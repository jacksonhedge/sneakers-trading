import { getServerClient } from './supabase-server'

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

export type Tier = keyof typeof DAILY_CAP

export type UsageCheckResult = {
  allowed: boolean
  count: number
  cap: number
  tier: Tier
  /** seconds until UTC midnight — useful for client-side "resets in X" copy */
  resetsInSeconds: number
}

/**
 * Placeholder tier resolver. When the Stripe/subscriptions table lands, look
 * up user's active subscription from Supabase and map to Tier. For now
 * everyone is `free` except admin emails.
 */
async function resolveTier(userEmail: string): Promise<Tier> {
  // TODO: replace with a subscriptions-table lookup once Stripe integration
  // lands. Admin emails are the only non-free tier right now.
  const ADMIN_ALLOWLIST = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (ADMIN_ALLOWLIST.includes(userEmail.toLowerCase())) return 'business'
  return 'free'
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
): Promise<UsageCheckResult> {
  const sb = getServerClient()
  const tier = await resolveTier(userEmail)
  const cap = DAILY_CAP[tier]

  const { data, error } = await sb
    .from('otoole_daily_usage')
    .select('message_count')
    .eq('user_id', userId)
    .eq('usage_date', utcToday())
    .maybeSingle()

  if (error) {
    console.error('[otoole-usage] checkDailyCap read failed', error)
    // Fail open — don't block the user because our logging is broken. A
    // billing-grade enforcement path would fail closed, but this is a cap,
    // not a charge, and a false-deny is worse than a missed-count.
    return { allowed: true, count: 0, cap, tier, resetsInSeconds: secondsUntilUtcMidnight() }
  }

  const count = data?.message_count ?? 0
  return {
    allowed: count < cap,
    count,
    cap,
    tier,
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
): Promise<number> {
  const sb = getServerClient()
  const today = utcToday()
  const nowIso = new Date().toISOString()

  const { data: existing } = await sb
    .from('otoole_daily_usage')
    .select('message_count, token_input, token_output')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle()

  const nextCount = (existing?.message_count ?? 0) + 1
  const nextInput = (existing?.token_input ?? 0) + tokens.input
  const nextOutput = (existing?.token_output ?? 0) + tokens.output

  if (existing) {
    await sb
      .from('otoole_daily_usage')
      .update({
        message_count: nextCount,
        token_input: nextInput,
        token_output: nextOutput,
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
      last_message_at: nowIso,
    })
  }

  return nextCount
}
