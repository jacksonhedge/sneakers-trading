'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { getServerClient } from '@/lib/supabase-server'
import { generateUniqueInviteCode } from '@/lib/invite-code'
import { sendInviteEmail } from '@/lib/email'

/**
 * Issue an invite code to a waitlist member.
 * Form fields: email (required), force ("1" to re-issue over an existing code).
 * Returns a plain object with ok + message so the client form can surface feedback.
 */
export async function issueInviteAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  await requireAdmin()

  const rawEmail = formData.get('email')
  const force = formData.get('force') === '1'
  if (typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
    return { ok: false, message: 'missing or invalid email' }
  }
  const email = rawEmail.toLowerCase().trim()

  const admin = getServerClient()
  const { data: row, error: lookupErr } = await admin
    .from('waitlist')
    .select('email, invite_code, invited_at')
    .eq('email', email)
    .maybeSingle()

  if (lookupErr) return { ok: false, message: `lookup failed: ${lookupErr.message}` }
  if (!row) return { ok: false, message: 'email not on waitlist — user must sign up for waitlist first' }
  if (row.invite_code && !force) {
    return { ok: false, message: `already has code ${row.invite_code} (issued ${row.invited_at}) — set force=1 to re-issue` }
  }

  let code: string
  try {
    code = await generateUniqueInviteCode()
  } catch (e) {
    return { ok: false, message: `code generation failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  const { error: updateErr } = await admin
    .from('waitlist')
    .update({
      invite_code: code,
      invited_at: new Date().toISOString(),
      invite_used_at: null,
    })
    .eq('email', email)

  if (updateErr) return { ok: false, message: `update failed: ${updateErr.message}` }

  try {
    await sendInviteEmail({ to: email, code })
  } catch (e) {
    return {
      ok: true,
      message: `code ${code} saved, but EMAIL FAILED: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  revalidatePath('/admin/invites')
  revalidatePath('/admin/users')
  revalidatePath('/admin')
  return { ok: true, message: `issued ${code} to ${email} (email sent)` }
}

/**
 * Revoke an invite — sets invite_code, invited_at, invite_used_at all to null.
 * If the code was already burned (invite_used_at set), this does NOT sign the user out.
 */
export async function revokeInviteAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  await requireAdmin()

  const email = formData.get('email')
  if (typeof email !== 'string') return { ok: false, message: 'missing email' }

  const admin = getServerClient()
  const { error } = await admin
    .from('waitlist')
    .update({ invite_code: null, invited_at: null, invite_used_at: null })
    .eq('email', email.toLowerCase().trim())

  if (error) return { ok: false, message: `revoke failed: ${error.message}` }

  revalidatePath('/admin/invites')
  revalidatePath('/admin/users')
  revalidatePath('/admin')
  return { ok: true, message: `revoked invite for ${email}` }
}
