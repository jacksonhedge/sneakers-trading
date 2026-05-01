'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { getServerClient } from '@/lib/supabase-server'
import { logAdminAction } from '@/lib/admin-audit'

const KEY_RE = /^[a-z][a-z0-9_]{1,63}$/

type Result = { ok: boolean; message: string }

function parseFlagInput(formData: FormData): { key: string; value: boolean; description: string | null } | { error: string } {
  const rawKey = formData.get('key')
  const rawValue = formData.get('value')
  const rawDescription = formData.get('description')

  if (typeof rawKey !== 'string' || !KEY_RE.test(rawKey)) {
    return { error: 'invalid key (lowercase letters, digits, underscores; 2-64 chars; must start with a letter)' }
  }
  const value = rawValue === '1' || rawValue === 'true' || rawValue === 'on'
  const description =
    typeof rawDescription === 'string' && rawDescription.trim().length > 0
      ? rawDescription.trim().slice(0, 500)
      : null
  return { key: rawKey, value, description }
}

/**
 * Create a NEW flag. Errors out (red pill) if a flag with the same key
 * already exists. Used by NewFlagForm so submitting a duplicate doesn't
 * silently overwrite the existing row's description/value (which is what
 * an upsert would do — see setFlagAction).
 */
export async function createFlagAction(formData: FormData): Promise<Result> {
  const { email: actorEmail } = await requireAdmin()
  const parsed = parseFlagInput(formData)
  if ('error' in parsed) return { ok: false, message: parsed.error }
  const { key, value, description } = parsed

  const admin = getServerClient()
  const { error } = await admin.from('feature_flags').insert({
    key,
    value_bool: value,
    description,
    updated_by: actorEmail,
  })

  if (error) {
    // 23505 = unique_violation. Surface a friendly message instead of the
    // raw "duplicate key value violates unique constraint" string.
    if (error.code === '23505') {
      return {
        ok: false,
        message: `${key} already exists. Toggle it from the row below or pick a different key.`,
      }
    }
    return { ok: false, message: `create failed: ${error.message}` }
  }

  await logAdminAction({
    actor: actorEmail,
    action: 'create_feature_flag',
    targetKind: 'system',
    targetId: key,
    metadata: { key, value, description },
  })

  revalidatePath('/admin/flags')
  revalidatePath('/admin/audit')
  return { ok: true, message: `created ${key} = ${value ? 'TRUE' : 'FALSE'}` }
}

/**
 * Toggle an existing flag's value. Used by FlagRow's two-step confirm.
 * Idempotent — running with the same value is a no-op write but still
 * logs an audit row (useful when investigating "did anyone touch this
 * recently?"). Upserts so a flag flipped via the row that doesn't yet
 * exist in the table also works.
 */
export async function setFlagAction(formData: FormData): Promise<Result> {
  const { email: actorEmail } = await requireAdmin()
  const parsed = parseFlagInput(formData)
  if ('error' in parsed) return { ok: false, message: parsed.error }
  const { key, value, description } = parsed

  const admin = getServerClient()

  // Capture the prior state so the audit row shows what flipped.
  const { data: priorRow } = await admin
    .from('feature_flags')
    .select('value_bool, description')
    .eq('key', key)
    .maybeSingle()

  const { error } = await admin.from('feature_flags').upsert(
    {
      key,
      value_bool: value,
      description: description ?? priorRow?.description ?? null,
      updated_by: actorEmail,
    },
    { onConflict: 'key' },
  )

  if (error) return { ok: false, message: `set failed: ${error.message}` }

  await logAdminAction({
    actor: actorEmail,
    action: 'set_feature_flag',
    targetKind: 'system',
    targetId: key,
    metadata: {
      key,
      new_value: value,
      prior_value: priorRow?.value_bool ?? null,
      changed: priorRow ? priorRow.value_bool !== value : true,
    },
  })

  revalidatePath('/admin/flags')
  revalidatePath('/admin/audit')
  return { ok: true, message: `${key} = ${value ? 'TRUE' : 'FALSE'}` }
}
