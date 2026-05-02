import { getServerClient } from './supabase-server'

// Per-user O'Toole memory + insight sources. v1 is paste-only:
// users type their strategy into one freeform field, and add insight
// snippets (tweets, GitHub READMEs, article paragraphs) one row at a
// time. No URL fetching — that lands in v2 if it lands.
//
// Read at chat time via formatUserMemoryBlock(). Written by the
// /api/otoole/memory + /api/otoole/sources routes on behalf of the user.

export type SourceKind = 'twitter' | 'github' | 'article' | 'note'

export interface OtooleSource {
  id: number
  kind: SourceKind
  label: string
  content: string
  marketFilter: string | null
  createdAt: string
}

const MEMORY_MAX = 8_000
const SOURCE_LABEL_MAX = 120
const SOURCE_CONTENT_MAX = 12_000
const SOURCE_FILTER_MAX = 200
const PROMPT_SOURCES_BUDGET = 15_000

export async function loadMemory(userId: string): Promise<string> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('user_otoole_memory')
    .select('content')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[otoole-memory] loadMemory failed', error.message)
    return ''
  }
  return (data?.content as string | undefined) ?? ''
}

export async function saveMemory(userId: string, content: string): Promise<void> {
  const trimmed = content.slice(0, MEMORY_MAX)
  const sb = getServerClient()
  const { error } = await sb.from('user_otoole_memory').upsert(
    {
      user_id: userId,
      content: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

export async function listSources(userId: string): Promise<OtooleSource[]> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('user_otoole_sources')
    .select('id, kind, label, content, market_filter, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[otoole-memory] listSources failed', error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    id: r.id as number,
    kind: ((r.kind as string) ?? 'note') as SourceKind,
    label: r.label as string,
    content: r.content as string,
    marketFilter: (r.market_filter as string | null) ?? null,
    createdAt: r.created_at as string,
  }))
}

export async function addSource(
  userId: string,
  input: { kind: SourceKind; label: string; content: string; marketFilter?: string | null },
): Promise<OtooleSource> {
  const label = input.label.trim().slice(0, SOURCE_LABEL_MAX)
  const content = input.content.trim().slice(0, SOURCE_CONTENT_MAX)
  const marketFilter = input.marketFilter?.trim().slice(0, SOURCE_FILTER_MAX) || null

  if (!label) throw new Error('label is required')
  if (!content) throw new Error('content is required')

  const sb = getServerClient()
  const { data, error } = await sb
    .from('user_otoole_sources')
    .insert({
      user_id: userId,
      kind: input.kind,
      label,
      content,
      market_filter: marketFilter,
    })
    .select('id, kind, label, content, market_filter, created_at')
    .single()
  if (error) throw error
  return {
    id: data.id as number,
    kind: data.kind as SourceKind,
    label: data.label as string,
    content: data.content as string,
    marketFilter: (data.market_filter as string | null) ?? null,
    createdAt: data.created_at as string,
  }
}

export async function deleteSource(userId: string, id: number): Promise<void> {
  const sb = getServerClient()
  const { error } = await sb
    .from('user_otoole_sources')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
  if (error) throw error
}

/**
 * Build the system-prompt block injected on every chat turn.
 *
 * - The strategy memory is always included (unless empty).
 * - Sources without a market_filter are always included.
 * - Sources with a market_filter fire only when one of their comma-
 *   separated keywords appears (case-insensitive substring) in the
 *   user's most recent message.
 * - Total source content is capped at ~15K chars to keep prompt size
 *   sane; sources are added newest-first until the budget is hit.
 *
 * Returns '' if there's nothing to inject — caller should filter that
 * out of the system-prompt assembly.
 */
export async function formatUserMemoryBlock(
  userId: string,
  lastUserMessage: string,
): Promise<string> {
  const [memory, sources] = await Promise.all([loadMemory(userId), listSources(userId)])
  const haystack = lastUserMessage.toLowerCase()

  const matched: OtooleSource[] = []
  let charBudget = PROMPT_SOURCES_BUDGET
  for (const s of sources) {
    if (s.marketFilter) {
      const tokens = s.marketFilter
        .split(/[,\n]/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
      const hit = tokens.some((t) => haystack.includes(t))
      if (!hit) continue
    }
    if (s.content.length > charBudget) continue
    matched.push(s)
    charBudget -= s.content.length
  }

  if (!memory && matched.length === 0) return ''

  const parts: string[] = []
  parts.push("# This user's notes for O'Toole")
  parts.push(
    'These are the user\'s own words about how they trade and what insights they find useful. ' +
      'Treat them as authoritative when answering — they override generic defaults but should ' +
      'NOT override hard safety rules (caps, kill switch, market freshness).',
  )
  if (memory) {
    parts.push('## Strategy & preferences')
    parts.push(memory)
  }
  if (matched.length > 0) {
    parts.push(`## Insight snippets (${matched.length} attached)`)
    for (const s of matched) {
      parts.push(`### ${s.label} — ${s.kind}${s.marketFilter ? ` · matched: ${s.marketFilter}` : ''}`)
      parts.push(s.content)
    }
  }
  return parts.join('\n\n')
}
