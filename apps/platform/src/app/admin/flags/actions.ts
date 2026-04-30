'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { getServerClient } from '@/lib/supabase-server'
import { logAdminAction } from '@/lib/admin-audit'

const KEY_RE = /^[a-z][a-z0-9_]{1,63}$/

export async function setFlagAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const { email: actorEmail } = await requireAdmin()

  const rawKey = formData.get('key')
  const rawValue = formData.get('value')
  const rawDescription = formData.get('description')

  if (typeof rawKey !== 'string' || !KEY_RE.test(rawKey)) {
    return { ok: false, message: 'invalid key (lowercase letters, digits, underscores; 2-64 chars; must start with a letter)' }
  }
  const key = rawKey
  const value = rawValue === '1' || rawValue === 'true' || rawValue === 'on'
  const description =
    typeof rawDescription === 'string' && rawDescription.trim().length > 0
      ? rawDescription.trim().slice(0, 500)
      : null

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
  return {
    ok: true,
    message: `${key} = ${value ? 'TRUE' : 'FALSE'}`,
  }
}
