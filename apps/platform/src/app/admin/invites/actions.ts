'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { getServerClient } from '@/lib/supabase-server'
import { generateUniqueInviteCode } from '@/lib/invite-code'
import { sendInviteEmail } from '@/lib/email'
import { logAdminAction } from '@/lib/admin-audit'

/**
 * Issue an invite code to a waitlist member.
 * Form fields: email (required), force ("1" to re-issue over an existing code).
 * Returns a plain object with ok + message so the client form can surface feedback.
 */
export async function issueInviteAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const { email: actorEmail } = await requireAdmin()

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

  let emailSent = true
  let emailError: string | null = null
  try {
    await sendInviteEmail({ to: email, code })
  } catch (e) {
    emailSent = false
    emailError = e instanceof Error ? e.message : String(e)
  }

  await logAdminAction({
    actor: actorEmail,
    action: force ? 'reissue_invite' : 'issue_invite',
    targetEmail: email,
    metadata: {
      code,
      force,
      previous_code: row.invite_code ?? null,
      email_sent: emailSent,
      email_error: emailError,
    },
  })

  revalidatePath('/admin/invites')
  revalidatePath('/admin/users')
  revalidatePath('/admin')
  if (!emailSent) {
    return {
      ok: true,
      message: `code ${code} saved, but EMAIL FAILED: ${emailError}`,
    }
  }
  return { ok: true, message: `issued ${code} to ${email} (email sent)` }
}

/**
 * Revoke an invite — sets invite_code, invited_at, invite_used_at all to null.
 * If the code was already burned (invite_used_at set), this does NOT sign the user out.
 */
export async function revokeInviteAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const { email: actorEmail } = await requireAdmin()

  const rawEmail = formData.get('email')
  if (typeof rawEmail !== 'string') return { ok: false, message: 'missing email' }
  const email = rawEmail.toLowerCase().trim()

  const admin = getServerClient()
  // Capture the prior state before nulling, so the audit row records what
  // was lost (prior code, whether it had been burned, etc).
  const { data: priorRow } = await admin
    .from('waitlist')
    .select('invite_code, invited_at, invite_used_at')
    .eq('email', email)
    .maybeSingle()

  const { error } = await admin
    .from('waitlist')
    .update({ invite_code: null, invited_at: null, invite_used_at: null })
    .eq('email', email)

  if (error) return { ok: false, message: `revoke failed: ${error.message}` }

  await logAdminAction({
    actor: actorEmail,
    action: 'revoke_invite',
    targetEmail: email,
    metadata: {
      prior_code: priorRow?.invite_code ?? null,
      prior_invited_at: priorRow?.invited_at ?? null,
      prior_invite_used_at: priorRow?.invite_used_at ?? null,
    },
  })

  revalidatePath('/admin/invites')
  revalidatePath('/admin/users')
  revalidatePath('/admin')
  return { ok: true, message: `revoked invite for ${email}` }
}
