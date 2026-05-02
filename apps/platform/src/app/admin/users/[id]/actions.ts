'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { getServerClient } from '@/lib/supabase-server'
import { generateUniqueInviteCode } from '@/lib/invite-code'
import { logAdminAction } from '@/lib/admin-audit'
import { getBalance } from '@/lib/credits'

// Server actions surfaced on /admin/users/<id>. Each one is a single
// idempotent write keyed by email. Wrap in requireAdmin() to keep them
// admin-only even if the action endpoint is hit directly.

type Result = { ok: boolean; message: string }

const CREDIT_ADJUST_MAX = 1_000_000 // hard cap per single adjustment to prevent typo blowups
const VALID_TIERS = ['free', 'pro', 'elite', 'business'] as const
type Tier = (typeof VALID_TIERS)[number]

async function findAuthUserId(email: string): Promise<string | null> {
  const admin = getServerClient()
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const u = (data?.users ?? []).find(
    (x) => x.email?.toLowerCase() === email.toLowerCase(),
  )
  return u?.id ?? null
}

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
  const { email: actorEmail } = await requireAdmin()

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
    // No state change, but log the attempt so the audit trail shows ops
    // tried — useful when investigating "why wasn't this user granted?".
    await logAdminAction({
      actor: actorEmail,
      action: 'grant_access',
      targetEmail: email,
      metadata: { noop: true, reason: 'already_authed', already_authed_at: row.invite_used_at },
    })
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

  await logAdminAction({
    actor: actorEmail,
    action: 'grant_access',
    targetEmail: email,
    metadata: {
      code,
      previously_had_code: Boolean(row.invite_code),
      previously_authed: false,
    },
  })

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${email}`)
  revalidatePath('/admin')
  return { ok: true, message: `granted access to ${email} (code ${code})` }
}

/**
 * Adjust a user's O'Toole credit balance by a delta. Positive delta credits
 * the user (admin grant); negative delta debits (e.g. clawback / refund
 * reversal). The delta is inserted as a single credit_transactions row
 * with kind='admin_grant' (positive) or kind='admin_adjustment' (negative —
 * we use 'admin_grant' with negative delta because the existing schema
 * doesn't have an explicit clawback kind; the audit log captures intent).
 *
 * Reason is required + included in both the credit_transactions.description
 * and the admin_audit_events row, so future investigation has both surfaces.
 */
export async function adjustCreditsAction(formData: FormData): Promise<Result> {
  const { email: actorEmail } = await requireAdmin()

  const rawEmail = formData.get('email')
  if (typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
    return { ok: false, message: 'missing or invalid email' }
  }
  const email = rawEmail.toLowerCase().trim()

  const rawDelta = formData.get('delta')
  const delta = typeof rawDelta === 'string' ? parseInt(rawDelta, 10) : NaN
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, message: 'delta must be a non-zero integer' }
  }
  if (Math.abs(delta) > CREDIT_ADJUST_MAX) {
    return {
      ok: false,
      message: `delta ${delta} exceeds hard cap of ±${CREDIT_ADJUST_MAX} per single adjustment`,
    }
  }

  const reason = (formData.get('reason') ?? '').toString().trim().slice(0, 500)
  if (!reason) {
    return { ok: false, message: 'reason is required (audit trail)' }
  }

  const userId = await findAuthUserId(email)
  if (!userId) {
    return {
      ok: false,
      message: 'no auth.users row for that email — user must sign in once before credits can be adjusted',
    }
  }

  const admin = getServerClient()
  const before = await getBalance(userId)

  // Insert the credit_transactions row directly so we can support negative
  // deltas (the existing grantCredits helper guards against amount <= 0).
  const { error } = await admin.from('credit_transactions').insert({
    user_id: userId,
    kind: 'admin_grant',
    delta,
    description: reason,
    metadata: { actor: actorEmail, adjustment_type: delta > 0 ? 'grant' : 'clawback' },
  })
  if (error) {
    return { ok: false, message: `insert failed: ${error.message}` }
  }

  const after = await getBalance(userId)

  await logAdminAction({
    actor: actorEmail,
    action: 'adjust_credits',
    targetEmail: email,
    targetId: userId,
    metadata: {
      delta,
      reason,
      balance_before: before.balance,
      balance_after: after.balance,
    },
  })

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${email}`)
  revalidatePath('/audit')
  return {
    ok: true,
    message: `${delta > 0 ? '+' : ''}${delta} credits → balance ${before.balance} → ${after.balance}`,
  }
}

/**
 * Set a user's plan_tier directly. Bypasses Stripe — useful for comping
 * an account, testing tier-gated features, or fixing a mis-synced row.
 * Stripe webhook will overwrite plan_tier on next subscription event,
 * so admin overrides are temporary unless paired with a Stripe action.
 */
export async function setUserTierAction(formData: FormData): Promise<Result> {
  const { email: actorEmail } = await requireAdmin()

  const rawEmail = formData.get('email')
  if (typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
    return { ok: false, message: 'missing or invalid email' }
  }
  const email = rawEmail.toLowerCase().trim()

  const rawTier = formData.get('tier')
  if (typeof rawTier !== 'string' || !(VALID_TIERS as readonly string[]).includes(rawTier)) {
    return { ok: false, message: `tier must be one of: ${VALID_TIERS.join(' / ')}` }
  }
  const newTier = rawTier as Tier

  const reason = (formData.get('reason') ?? '').toString().trim().slice(0, 500)
  if (!reason) {
    return { ok: false, message: 'reason is required (audit trail)' }
  }

  const admin = getServerClient()
  const { data: row, error: lookupErr } = await admin
    .from('waitlist')
    .select('email, plan_tier')
    .eq('email', email)
    .maybeSingle()
  if (lookupErr) return { ok: false, message: `lookup failed: ${lookupErr.message}` }
  if (!row) return { ok: false, message: 'no waitlist row for that email' }

  const priorTier = (row.plan_tier as Tier | null) ?? 'free'

  if (priorTier === newTier) {
    await logAdminAction({
      actor: actorEmail,
      action: 'set_user_tier',
      targetEmail: email,
      metadata: { noop: true, tier: newTier, reason },
    })
    return { ok: true, message: `already on ${newTier} tier` }
  }

  const { error: updErr } = await admin
    .from('waitlist')
    .update({ plan_tier: newTier })
    .eq('email', email)
  if (updErr) return { ok: false, message: `update failed: ${updErr.message}` }

  await logAdminAction({
    actor: actorEmail,
    action: 'set_user_tier',
    targetEmail: email,
    metadata: {
      prior_tier: priorTier,
      new_tier: newTier,
      reason,
    },
  })

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${email}`)
  revalidatePath('/audit')
  return {
    ok: true,
    message: `tier ${priorTier} → ${newTier}`,
  }
}
