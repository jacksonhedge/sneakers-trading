import { getServerClient } from './supabase-server'
import { generateUniqueInviteCode } from './invite-code'
import { sendInviteEmail } from './email'

// Clubhouse-style auto-invite rule:
//   - direct_referrals >= 2                       → issue immediately
//   - direct_referrals >= 1 AND row age >= 24h    → issue (next-day)
// Cap at MAX_AUTO_INVITES (default 100) — applies to TOTAL invites (admin +
// auto). Simpler than tracking invite-source separately; admin-issued invites
// consume the cap the same way.

const MAX_AUTO_INVITES = Number(process.env.MAX_AUTO_INVITES ?? 100)
const DELAY_HOURS = 24

export type AutoInviteResult =
  | { issued: true; code: string }
  | {
      issued: false
      reason:
        | 'already_invited'
        | 'no_row'
        | 'no_progress'
        | 'need_more_time'
        | 'cap_reached'
        | 'error'
    }

export async function maybeAutoInvite(email: string): Promise<AutoInviteResult> {
  const normalizedEmail = email.toLowerCase().trim()
  const admin = getServerClient()

  const { data: row } = await admin
    .from('waitlist')
    .select('email, invite_code, direct_referrals, created_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (!row) return { issued: false, reason: 'no_row' }
  if (row.invite_code) return { issued: false, reason: 'already_invited' }
  if (row.direct_referrals < 1) return { issued: false, reason: 'no_progress' }

  if (row.direct_referrals < 2) {
    const ageMs = Date.now() - new Date(row.created_at).getTime()
    if (ageMs < DELAY_HOURS * 3600 * 1000) {
      return { issued: false, reason: 'need_more_time' }
    }
  }

  const { count: invitesOut } = await admin
    .from('waitlist')
    .select('*', { count: 'exact', head: true })
    .not('invite_code', 'is', null)

  if ((invitesOut ?? 0) >= MAX_AUTO_INVITES) {
    return { issued: false, reason: 'cap_reached' }
  }

  let code: string
  try {
    code = await generateUniqueInviteCode()
  } catch (err) {
    console.error('[auto-invite] code-gen failed', err)
    return { issued: false, reason: 'error' }
  }

  // Race-safe: only set invite_code if it's still null. If two concurrent calls
  // race past the cap check, only one UPDATE will affect a row.
  const { data: updated, error: updateErr } = await admin
    .from('waitlist')
    .update({
      invite_code: code,
      invited_at: new Date().toISOString(),
      invite_used_at: null,
    })
    .eq('email', normalizedEmail)
    .is('invite_code', null)
    .select('email')

  if (updateErr) {
    console.error('[auto-invite] update failed', updateErr)
    return { issued: false, reason: 'error' }
  }
  if (!updated || updated.length === 0) {
    // Another concurrent path already claimed this slot. Not an error.
    return { issued: false, reason: 'already_invited' }
  }

  // Fire-and-forget email send. Don't block the caller on Resend latency; the
  // invite is already saved in the DB, so /login will surface the code on
  // next render even if the email fails.
  sendInviteEmail({ to: normalizedEmail, code }).catch((err) => {
    console.error('[auto-invite] email send failed for', normalizedEmail, err)
  })

  return { issued: true, code }
}

/**
 * Compute what a waitlist row needs to hit the next auto-invite tier.
 * Used to drive the Clubhouse-style progress UI on /login and /dashboard.
 */
export function autoInviteProgress(row: { direct_referrals: number; created_at: string }): {
  qualifiesNow: boolean
  qualifiesIn24h: boolean
  refsNeededForInstant: number
  refsNeededForNextDay: number
  hoursUntilNextDay: number | null
} {
  const ageMs = Date.now() - new Date(row.created_at).getTime()
  const ageHours = ageMs / (3600 * 1000)
  const qualifiesNow = row.direct_referrals >= 2
  const qualifiesIn24h = row.direct_referrals >= 1 && ageHours >= DELAY_HOURS

  return {
    qualifiesNow,
    qualifiesIn24h,
    refsNeededForInstant: Math.max(0, 2 - row.direct_referrals),
    refsNeededForNextDay: Math.max(0, 1 - row.direct_referrals),
    hoursUntilNextDay:
      row.direct_referrals >= 1 && ageHours < DELAY_HOURS
        ? Math.max(0, Math.ceil(DELAY_HOURS - ageHours))
        : null,
  }
}
