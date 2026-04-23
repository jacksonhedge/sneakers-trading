import { getAuthClient } from './supabase-auth'
import { getServerClient } from './supabase-server'
import {
  isActiveStatus,
  tierMeetsMinimum,
  type AccountType,
  type BusinessSubtype,
  type Tier,
} from './subscriptions'

// Server-side tier gate — call from every protected API route and server
// component. UI gates (useTier) are convenience for "show a lock icon"; this
// is the authoritative check.
//
// Returns the resolved user identity if access is granted; throws a
// `TierError` (HTTP 401 or 402) otherwise. Pattern at the call site:
//
//   try {
//     const me = await requireTier('pro')
//     // ... do the work
//   } catch (err) {
//     if (err instanceof TierError) return err.toResponse()
//     throw err
//   }
//
// Or use `requireTierResponse(...)` which returns a Response on failure and
// the user record on success.

export interface TierIdentity {
  authUserId: string                       // auth.users.id
  waitlistId: string                       // waitlist.id (uuid)
  email: string
  tier: Tier                               // effective tier (collapses to free if status not active/trialing)
  rawTier: Tier                            // what plan_tier says before status collapse
  status: string | null                    // raw subscription_status
  isActive: boolean                        // status in (active, trialing)
  accountType: AccountType
  businessSubtype: BusinessSubtype | null  // only meaningful if tier === 'business'
}

export class TierError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
  toResponse(): Response {
    return Response.json({ error: this.code, message: this.message }, { status: this.status })
  }
}

/**
 * Resolve the authenticated user's effective tier, no minimum check.
 * Use when you need the identity but the gate is conditional (e.g. show
 * different UI for free vs paid without blocking either).
 */
export async function getTierIdentity(): Promise<TierIdentity> {
  const authed = await getAuthClient()
  const {
    data: { user },
  } = await authed.auth.getUser()
  if (!user || !user.email) {
    throw new TierError(401, 'unauthenticated', 'Sign in required')
  }

  const admin = getServerClient()
  const { data: row, error } = await admin
    .from('waitlist')
    .select('id, email, plan_tier, subscription_status, account_type, business_subtype')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()
  // Schema-drift resilience: a missing column (migration not yet applied,
  // e.g. business_subtype before the Stripe migration lands) would throw
  // here. That shouldn't crash the whole tier-check — the user is already
  // authenticated. Collapse to a free-tier identity instead so the dashboard
  // still renders; paid gates fail closed, which is the right behavior.
  if (error) {
    console.error(
      '[require-tier] waitlist lookup failed — collapsing to free tier',
      { code: error.code, message: error.message, hint: error.hint },
    )
    return {
      authUserId: user.id,
      waitlistId: '',
      email: user.email,
      tier: 'free',
      rawTier: 'free',
      status: null,
      isActive: false,
      accountType: 'individual',
      businessSubtype: null,
    }
  }
  if (!row) {
    // Authenticated but no waitlist row — treat as free with no status. They
    // can still hit free endpoints; paid ones will reject.
    return {
      authUserId: user.id,
      waitlistId: '',
      email: user.email,
      tier: 'free',
      rawTier: 'free',
      status: null,
      isActive: false,
      accountType: 'individual',
      businessSubtype: null,
    }
  }

  const accountType = ((row.account_type as string | null) ?? 'individual') as AccountType
  const rawTier = ((row.plan_tier as string | null) ?? 'free') as Tier
  const status = row.subscription_status as string | null
  const active = isActiveStatus(status)

  // Defensive sanity checks. Either is a data inconsistency — log it and
  // collapse to free rather than letting bad state grant access.
  let safeTier: Tier = active ? rawTier : 'free'
  if (safeTier === 'business' && accountType !== 'business') {
    console.warn(
      '[require-tier] inconsistency: individual account on business tier',
      { email: row.email, rawTier, accountType },
    )
    safeTier = 'free'
  }

  let subtype = row.business_subtype as BusinessSubtype | null
  if (subtype && safeTier !== 'business') {
    console.warn(
      '[require-tier] inconsistency: business_subtype set on non-business tier',
      { email: row.email, safeTier, subtype },
    )
    subtype = null
  }

  return {
    authUserId: user.id,
    waitlistId: row.id as string,
    email: row.email as string,
    tier: safeTier,
    rawTier,
    status,
    isActive: active,
    accountType,
    businessSubtype: subtype,
  }
}

/**
 * Throwing version: enforces a minimum tier. Fraternity is treated as
 * Business (per flavorToTier in subscriptions.ts — this comparison happens
 * after the flavor → tier collapse). Seat-limit checks are NOT here; do them
 * in the seat-management code path with `identity.businessSubtype` if needed.
 */
export async function requireTier(minimum: Tier): Promise<TierIdentity> {
  const me = await getTierIdentity()
  if (!tierMeetsMinimum(me.tier, minimum)) {
    throw new TierError(
      402,
      'upgrade_required',
      `This feature requires ${minimum} or higher; you are on ${me.tier}.`,
    )
  }
  return me
}

/**
 * Convenience wrapper for route handlers — returns either the identity or a
 * Response that the handler can directly return.
 *
 *   const r = await requireTierResponse('pro')
 *   if (r instanceof Response) return r
 *   // r is TierIdentity
 */
export async function requireTierResponse(
  minimum: Tier,
): Promise<TierIdentity | Response> {
  try {
    return await requireTier(minimum)
  } catch (err) {
    if (err instanceof TierError) return err.toResponse()
    throw err
  }
}
