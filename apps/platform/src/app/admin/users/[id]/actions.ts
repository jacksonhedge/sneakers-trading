'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { getServerClient } from '@/lib/supabase-server'
import { generateUniqueInviteCode } from '@/lib/invite-code'

// Server actions surfaced on /admin/users/<id>. Each one is a single
// idempotent write keyed by email. Wrap in requireAdmin() to keep them
// admin-only even if the action endpoint is hit directly.

type Result = { ok: boolean; message: string }

/**
 * Flip a waitlist user to AUTHED in one click. Equivalent to the manual
 * tsx scripts that ops has been running by hand:
 *   - if no invite_code: generate one
 *   - set invite_used_at = now()
 *   - ensure account_type is set
 *
 * Idempotent — running on an already-authed user just refreshes the
 * timestamps and returns ok.
 */
export async function grantAccessAction(formData: FormData): Promise<Result> {
  await requireAdmin()

  const rawEmail = formData.get('email')
  if (typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
    return { ok: false, message: 'missing or invalid email' }
  }
  const email = rawEmail.toLowerCase().trim()

  const admin = getServerClient()
  const { data: row, error: lookupErr } = await admin
    .from('waitlist')
    .select('email, invite_code, invite_used_at, account_type')
    .eq('email', email)
    .maybeSingle()

  if (lookupErr) return { ok: false, message: `lookup failed: ${lookupErr.message}` }
  if (!row) return { ok: false, message: 'no waitlist row for that email' }

  const now = new Date().toISOString()

  if (row.invite_used_at) {
    return { ok: true, message: `already authed (since ${row.invite_used_at})` }
  }

  // Ensure they have an invite_code so the audit trail is complete. If they
  // already have one, leave it; just burn it.
  let code = row.invite_code as string | null
  if (!code) {
    try {
      code = await generateUniqueInviteCode()
    } catch (e) {
      return {
        ok: false,
        message: `code generation failed: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
  }

  const { error: updErr } = await admin
    .from('waitlist')
    .update({
      invite_code: code,
      invited_at: row.invite_code ? undefined : now,
      invite_used_at: now,
      account_type: row.account_type ?? 'individual',
    })
    .eq('email', email)

  if (updErr) return { ok: false, message: `update failed: ${updErr.message}` }

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${email}`)
  revalidatePath('/admin')
  return { ok: true, message: `granted access to ${email} (code ${code})` }
}
