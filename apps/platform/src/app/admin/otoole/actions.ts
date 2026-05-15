'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { getServerClient } from '@/lib/supabase-server'
import { logAdminAction } from '@/lib/admin-audit'
import type { GlobalSourceKind } from '@/lib/otoole-global-memory'
import {
  fetchSourceFromUrl,
  type FetchedSource,
} from '@/lib/otoole-source-fetcher'
import { suggestFilterKeywords } from '@/lib/otoole-keyword-suggester'

type Result = { ok: boolean; message: string }
type FetchResult =
  | { ok: true; source: FetchedSource }
  | { ok: false; message: string }
type SuggestResult =
  | { ok: true; keywords: string[]; suggested: string }
  | { ok: false; message: string }
export type BulkFetchRow =
  | { url: string; ok: true; source: FetchedSource }
  | { url: string; ok: false; message: string }
type BulkFetchResult =
  | { ok: true; rows: BulkFetchRow[] }
  | { ok: false; message: string }

const BULK_MAX_URLS = 10

const KINDS: GlobalSourceKind[] = ['twitter', 'github', 'article', 'note']
const PERSONA_MAX = 8 * 1024
const CONTENT_MAX = 32 * 1024
const SOURCE_LABEL_MAX = 200
const SOURCE_CONTENT_MAX = 16 * 1024
const SOURCE_FILTER_MAX = 500

function s(formData: FormData, key: string, max: number): string {
  const v = formData.get(key)
  if (typeof v !== 'string') return ''
  return v.slice(0, max)
}

function bool(formData: FormData, key: string): boolean {
  const v = formData.get(key)
  return v === '1' || v === 'true' || v === 'on'
}

export async function saveGlobalMemoryAction(
  formData: FormData,
): Promise<Result> {
  const { email: actor } = await requireAdmin()
  const persona_addendum = s(formData, 'persona_addendum', PERSONA_MAX)
  const content = s(formData, 'content', CONTENT_MAX)
  const enabled = bool(formData, 'enabled')

  const admin = getServerClient()

  const { data: prior } = await admin
    .from('otoole_global_memory')
    .select('persona_addendum, content, enabled')
    .eq('id', 1)
    .maybeSingle()

  const { error } = await admin
    .from('otoole_global_memory')
    .upsert(
      { id: 1, persona_addendum, content, enabled, updated_by: actor },
      { onConflict: 'id' },
    )

  if (error) return { ok: false, message: `save failed: ${error.message}` }

  await logAdminAction({
    actor,
    action: 'set_otoole_global_memory',
    targetKind: 'system',
    targetId: 'otoole_global_memory',
    metadata: {
      enabled,
      enabled_changed: prior ? prior.enabled !== enabled : true,
      persona_len: persona_addendum.length,
      persona_changed: prior ? prior.persona_addendum !== persona_addendum : true,
      content_len: content.length,
      content_changed: prior ? prior.content !== content : true,
    },
  })

  revalidatePath('/admin/otoole')
  revalidatePath('/admin/audit')
  return {
    ok: true,
    message: `saved · ${enabled ? 'ENABLED' : 'DISABLED'} · persona ${persona_addendum.length} chars · content ${content.length} chars`,
  }
}

export async function fetchSourceFromUrlAction(
  formData: FormData,
): Promise<FetchResult> {
  await requireAdmin()
  const url = s(formData, 'url', 2048).trim()
  if (!url) return { ok: false, message: 'url required' }
  return fetchSourceFromUrl(url)
}

export async function bulkFetchSourcesAction(
  formData: FormData,
): Promise<BulkFetchResult> {
  await requireAdmin()
  const urlsRaw = s(formData, 'urls', 8192)
  const seen = new Set<string>()
  const urls = urlsRaw
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter(Boolean)
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)))
  if (urls.length === 0) return { ok: false, message: 'no urls' }
  if (urls.length > BULK_MAX_URLS) {
    return { ok: false, message: `max ${BULK_MAX_URLS} urls per batch` }
  }

  const rows = await Promise.all(
    urls.map(async (url): Promise<BulkFetchRow> => {
      const r = await fetchSourceFromUrl(url)
      return r.ok
        ? { url, ok: true, source: r.source }
        : { url, ok: false, message: r.message }
    }),
  )
  return { ok: true, rows }
}

export async function suggestFilterKeywordsAction(
  formData: FormData,
): Promise<SuggestResult> {
  await requireAdmin()
  const label = s(formData, 'label', SOURCE_LABEL_MAX)
  const content = s(formData, 'content', SOURCE_CONTENT_MAX)
  const r = await suggestFilterKeywords(label, content)
  if (!r.ok) return r
  return { ok: true, keywords: r.keywords, suggested: r.keywords.join(', ') }
}

export async function createGlobalSourceAction(
  formData: FormData,
): Promise<Result> {
  const { email: actor } = await requireAdmin()
  const kindRaw = s(formData, 'kind', 32)
  const kind: GlobalSourceKind = (KINDS as string[]).includes(kindRaw)
    ? (kindRaw as GlobalSourceKind)
    : 'note'
  const label = s(formData, 'label', SOURCE_LABEL_MAX).trim()
  const content = s(formData, 'content', SOURCE_CONTENT_MAX).trim()
  const market_filter =
    s(formData, 'market_filter', SOURCE_FILTER_MAX).trim() || null

  if (!label) return { ok: false, message: 'label required' }
  if (!content) return { ok: false, message: 'content required' }

  const admin = getServerClient()
  const { data, error } = await admin
    .from('otoole_global_sources')
    .insert({
      kind,
      label,
      content,
      market_filter,
      enabled: true,
      updated_by: actor,
    })
    .select('id')
    .single()

  if (error) return { ok: false, message: `create failed: ${error.message}` }

  await logAdminAction({
    actor,
    action: 'create_otoole_global_source',
    targetKind: 'system',
    targetId: String(data.id),
    metadata: { kind, label, content_len: content.length, market_filter },
  })

  revalidatePath('/admin/otoole')
  revalidatePath('/admin/audit')
  return { ok: true, message: `created source #${data.id} · ${label}` }
}

export async function setGlobalSourceEnabledAction(
  formData: FormData,
): Promise<Result> {
  const { email: actor } = await requireAdmin()
  const id = Number(formData.get('id'))
  const enabled = bool(formData, 'enabled')
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, message: 'invalid id' }
  }

  const admin = getServerClient()

  const { data: prior } = await admin
    .from('otoole_global_sources')
    .select('label, enabled')
    .eq('id', id)
    .maybeSingle()
  if (!prior) return { ok: false, message: 'source not found' }

  const { error } = await admin
    .from('otoole_global_sources')
    .update({ enabled, updated_by: actor })
    .eq('id', id)

  if (error) return { ok: false, message: `update failed: ${error.message}` }

  await logAdminAction({
    actor,
    action: 'set_otoole_global_source_enabled',
    targetKind: 'system',
    targetId: String(id),
    metadata: {
      label: prior.label,
      prior_enabled: prior.enabled,
      new_enabled: enabled,
      changed: prior.enabled !== enabled,
    },
  })

  revalidatePath('/admin/otoole')
  revalidatePath('/admin/audit')
  return {
    ok: true,
    message: `${prior.label} → ${enabled ? 'ENABLED' : 'DISABLED'}`,
  }
}

export async function deleteGlobalSourceAction(
  formData: FormData,
): Promise<Result> {
  const { email: actor } = await requireAdmin()
  const id = Number(formData.get('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, message: 'invalid id' }
  }

  const admin = getServerClient()

  const { data: prior } = await admin
    .from('otoole_global_sources')
    .select('label, kind')
    .eq('id', id)
    .maybeSingle()
  if (!prior) return { ok: false, message: 'source not found' }

  const { error } = await admin
    .from('otoole_global_sources')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, message: `delete failed: ${error.message}` }

  await logAdminAction({
    actor,
    action: 'delete_otoole_global_source',
    targetKind: 'system',
    targetId: String(id),
    metadata: { label: prior.label, kind: prior.kind },
  })

  revalidatePath('/admin/otoole')
  revalidatePath('/admin/audit')
  return { ok: true, message: `deleted · ${prior.label}` }
}
