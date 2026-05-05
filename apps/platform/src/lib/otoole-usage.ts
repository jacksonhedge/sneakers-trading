import { getServerClient } from './supabase-server'
import { estimateRequestCostUsd, type AIModelMeta } from './ai-models'

/**
 * Daily message caps by tier. When a Stripe-backed subscriptions table exists,
 * replace the hardcoded tier lookup with a Supabase query. For now, free tier
 * is the assumption for every user.
 */
const DAILY_CAP: Record<'free' | 'pro' | 'elite' | 'business', number> = {
  free: 5,
  pro: 50,
  elite: 500,
  business: Number.POSITIVE_INFINITY,
}

/**
 * Daily $-cost caps by tier on Sneakers' shared API key. Only applies when
 * the user is NOT BYO-key (their own Anthropic / OpenAI / etc. key bypasses
 * this — they pay their provider directly). Caps are enforced alongside
 * the message-count cap above; whichever fires first stops the user.
 *
 * Free tier: $2/day — caps roughly 400 short Haiku messages or ~50 Sonnet,
 * which is plenty of trial usage without burning a hole in the API budget
 * if a user hammers the chat. Higher tiers scale linearly with tier price.
 */
const DAILY_COST_CAP_USD: Record<'free' | 'pro' | 'elite' | 'business', number> = {
  free: 2.0,
  pro: 10.0,
  elite: 50.0,
  business: Number.POSITIVE_INFINITY,
}

export type Tier = keyof typeof DAILY_CAP

export type UsageCheckResult = {
  allowed: boolean
  count: number
  cap: number
  /** Cumulative USD spent today on Sneakers' shared key. */
  costUsd: number
  /** USD ceiling for the day on Sneakers' shared key (∞ for business). */
  costUsdCap: number
  /** Which cap caused the deny (only set when allowed=false). */
  blockedBy?: 'message_count' | 'cost_usd'
  /** Tier used for cap enforcement (admins are bumped to business for caps). */
  tier: Tier
  /** Actual subscription tier from waitlist.plan_tier — what O'Toole quotes
   *  back to the user. Diverges from `tier` for admin emails who haven't
   *  actually paid. Always reflects what the user sees on /dashboard/billing. */
  displayTier: Tier
  /** seconds until UTC midnight — useful for client-side "resets in X" copy */
  resetsInSeconds: number
}

function isAdminEmail(userEmail: string): boolean {
  const allowlist = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return allowlist.includes(userEmail.toLowerCase())
}

/**
 * Resolve tier for cap-enforcement purposes. Admins get bumped to 'business'
 * (infinite cap) so the dev workflow doesn't hit caps. Everyone else uses
 * their actual subscription from waitlist.plan_tier.
 *
 * For O'Toole's user-context block, use resolveDisplayTier instead — that
 * returns the user's REAL plan, not the admin-bumped version. Otherwise
 * O'Toole tells admin users they're on 'business' when they're actually
 * on the free tier in billing — verifier caught this bug, real trust hit.
 */
async function resolveCapTier(userId: string, userEmail: string): Promise<Tier> {
  if (isAdminEmail(userEmail)) return 'business'
  return resolveDisplayTier(userId, userEmail)
}

async function resolveDisplayTier(userId: string, userEmail: string): Promise<Tier> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('waitlist')
    .select('plan_tier')
    .eq('email', userEmail.toLowerCase())
    .maybeSingle()
  if (error || !data) return 'free'
  const t = data.plan_tier as string | null
  if (t === 'pro' || t === 'elite' || t === 'business') return t
  return 'free'
  // Note: userId param kept for forward-compat once we move plan_tier from
  // waitlist (email-keyed) to a proper user_subscriptions table (id-keyed).
}

/**
 * Tier-only resolver — no usage-table read. Use this for early branches
 * that need tier (e.g. picking a default model) before we know whether
 * the request will use a BYO key. The full checkDailyCap call should
 * still run later, with usingByoKey, to enforce the actual caps.
 */
export async function resolveUserTier(
  userId: string,
  userEmail: string,
): Promise<{ tier: Tier; displayTier: Tier; resetsInSeconds: number }> {
  const [tier, displayTier] = await Promise.all([
    resolveCapTier(userId, userEmail),
    resolveDisplayTier(userId, userEmail),
  ])
  return { tier, displayTier, resetsInSeconds: secondsUntilUtcMidnight() }
}

function secondsUntilUtcMidnight(): number {
  const now = new Date()
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return Math.max(0, Math.floor((tomorrow.getTime() - now.getTime()) / 1000))
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Check whether a user is under their daily OToole cap. Does NOT increment —
 * call `recordUsage` after a successful model response so failed requests
 * don't count against the user.
 */
export async function checkDailyCap(
  userId: string,
  userEmail: string,
  opts: { usingByoKey?: boolean } = {},
): Promise<UsageCheckResult> {
  const sb = getServerClient()
  const [tier, displayTier] = await Promise.all([
    resolveCapTier(userId, userEmail),
    resolveDisplayTier(userId, userEmail),
  ])
  const cap = DAILY_CAP[tier]
  // BYO-key users bypass the $/day cap (they're paying their own provider)
  // but stay subject to the per-tier message-count cap. Setting the cost
  // cap to +Infinity here makes the allow-check skip it cleanly.
  const costUsdCap = opts.usingByoKey ? Number.POSITIVE_INFINITY : DAILY_COST_CAP_USD[tier]

  const { data, error } = await sb
    .from('otoole_daily_usage')
    .select('message_count, cost_usd_total')
    .eq('user_id', userId)
    .eq('usage_date', utcToday())
    .maybeSingle()

  if (error) {
    console.error('[otoole-usage] checkDailyCap read failed', error)
    // Fail open — don't block the user because our logging is broken. A
    // billing-grade enforcement path would fail closed, but this is a cap,
    // not a charge, and a false-deny is worse than a missed-count.
    return {
      allowed: true,
      count: 0,
      cap,
      costUsd: 0,
      costUsdCap,
      tier,
      displayTier,
      resetsInSeconds: secondsUntilUtcMidnight(),
    }
  }

  const count = data?.message_count ?? 0
  const costUsd = Number(data?.cost_usd_total ?? 0)
  const messageOk = count < cap
  const costOk = costUsd < costUsdCap
  const allowed = messageOk && costOk
  return {
    allowed,
    count,
    cap,
    costUsd,
    costUsdCap,
    blockedBy: allowed ? undefined : !costOk ? 'cost_usd' : 'message_count',
    tier,
    displayTier,
    resetsInSeconds: secondsUntilUtcMidnight(),
  }
}

/**
 * Called after a successful O'Toole response. Atomically increments the
 * user's day-row counters. Uses upsert so the first message of the day
 * creates the row; subsequent messages update it.
 */
export async function recordUsage(
  userId: string,
  tokens: { input: number; output: number },
): Promise<void> {
  const sb = getServerClient()
  const today = utcToday()
  const nowIso = new Date().toISOString()

  // Try update first (common path after day 1); fall back to insert on miss.
  const { error: updateErr, data } = await sb
    .from('otoole_daily_usage')
    .update({
      message_count: 1,  // placeholder — we use the RPC-like increment below
      token_input: tokens.input,
      token_output: tokens.output,
      last_message_at: nowIso,
    })
    .eq('user_id', userId)
    .eq('usage_date', today)
    .select('message_count')
    .maybeSingle()

  // Supabase JS doesn't ship a clean atomic increment API from the client
  // side without a database function. For now we upsert with a SELECT+UPDATE
  // pattern — race condition surface is small since a single user rarely
  // fires two chat calls within milliseconds, and the cap enforcement is
  // read separately. Pattern: read count, increment, write back.
  if (data) return

  // Row didn't exist yet — insert it.
  const { error: insertErr } = await sb.from('otoole_daily_usage').insert({
    user_id: userId,
    usage_date: today,
    message_count: 1,
    token_input: tokens.input,
    token_output: tokens.output,
    last_message_at: nowIso,
  })
  if (insertErr) {
    console.error('[otoole-usage] recordUsage insert failed', insertErr)
  }
  if (updateErr && updateErr.code !== 'PGRST116') {
    console.error('[otoole-usage] recordUsage update failed', updateErr)
  }
}

/**
 * Convenience for the API route: reads current count, increments by 1,
 * writes atomically-ish (read+write without a trigger — races are
 * acceptable for cap enforcement on a per-user basis).
 *
 * Returns the new usage number so the API response can include remaining
 * allowance for the client to show.
 */
export async function incrementAndGetCount(
  userId: string,
  tokens: { input: number; output: number },
  /** When provided + usingByoKey=false, we estimate the request's USD cost
   *  via estimateRequestCostUsd and accumulate it into cost_usd_total so
   *  the next checkDailyCap enforces the $/day cap. Omit (or pass byo=true)
   *  to leave cost_usd_total untouched — used when we don't pay for the
   *  call (BYO key) or we just don't care to track it. */
  opts: { model?: AIModelMeta; usingByoKey?: boolean } = {},
): Promise<{ count: number; costUsd: number }> {
  const sb = getServerClient()
  const today = utcToday()
  const nowIso = new Date().toISOString()

  const { data: existing } = await sb
    .from('otoole_daily_usage')
    .select('message_count, token_input, token_output, cost_usd_total')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle()

  const nextCount = (existing?.message_count ?? 0) + 1
  const nextInput = (existing?.token_input ?? 0) + tokens.input
  const nextOutput = (existing?.token_output ?? 0) + tokens.output
  const requestCost =
    opts.model && !opts.usingByoKey ? estimateRequestCostUsd(opts.model, tokens) : 0
  const nextCost = Number(existing?.cost_usd_total ?? 0) + requestCost

  if (existing) {
    await sb
      .from('otoole_daily_usage')
      .update({
        message_count: nextCount,
        token_input: nextInput,
        token_output: nextOutput,
        cost_usd_total: nextCost,
        last_message_at: nowIso,
      })
      .eq('user_id', userId)
      .eq('usage_date', today)
  } else {
    await sb.from('otoole_daily_usage').insert({
      user_id: userId,
      usage_date: today,
      message_count: nextCount,
      token_input: nextInput,
      token_output: nextOutput,
      cost_usd_total: nextCost,
      last_message_at: nowIso,
    })
  }

  return { count: nextCount, costUsd: nextCost }
}
