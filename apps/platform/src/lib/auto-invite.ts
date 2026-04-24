import { getServerClient } from './supabase-server'
import { generateUniqueInviteCode } from './invite-code'
import { sendInviteEmail } from './email'

// Single-invite rule (pivoted 2026-04-24 for college-only positioning):
//   - direct_referrals >= 1  → issue immediately
//   - direct_referrals == 0  → halt, prompt them to share their link
//
// No 24-hour delay, no 2nd tier. The scarcity IS the curation — users
// have to personally vouch for somebody, that person actually signs up,
// then they're in. Admin emails always bypass via isAdminEmail checks
// upstream.
//
// Cap at MAX_AUTO_INVITES (default 100) — applies to TOTAL invites
// (admin + auto). Simpler than tracking invite-source separately; admin-
// issued invites consume the cap the same way.

const MAX_AUTO_INVITES = Number(process.env.MAX_AUTO_INVITES ?? 100)
const REFERRALS_REQUIRED = 1

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
  if (row.direct_referrals < REFERRALS_REQUIRED) {
    return { issued: false, reason: 'no_progress' }
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
 * Compute what a waitlist row needs for auto-invite. Post-pivot this is
 * one tier: 1 referral → instant. Second return fields kept as always-
 * false/zero so existing UI code that reads them doesn't break until
 * /login + /dashboard get their UI trimmed down.
 */
export function autoInviteProgress(row: { direct_referrals: number; created_at: string }): {
  qualifiesNow: boolean
  qualifiesIn24h: boolean
  refsNeededForInstant: number
  refsNeededForNextDay: number
  hoursUntilNextDay: number | null
} {
  const qualifiesNow = row.direct_referrals >= REFERRALS_REQUIRED
  return {
    qualifiesNow,
    qualifiesIn24h: false,
    refsNeededForInstant: Math.max(0, REFERRALS_REQUIRED - row.direct_referrals),
    refsNeededForNextDay: 0,
    hoursUntilNextDay: null,
  }
}
