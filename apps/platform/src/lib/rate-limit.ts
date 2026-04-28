import { getServerClient } from './supabase-server'

// Pg-based sliding-window rate limiter. One INSERT per allowed request,
// one COUNT per check. Cheap, no new vendor, schema versioned.
//
// Usage:
//   const ok = await checkRateLimit({ key: `forgot:${ip}`, max: 5, windowSec: 900 })
//   if (!ok.allowed) // ... handle (often: silent fail-closed, sometimes 429)
//
// Fail-soft: if the DB lookup throws, we allow the request. Better to
// let through a few suspicious requests than to lock everyone out
// because of a transient Supabase blip.

export interface RateLimitInput {
  key: string
  max: number
  windowSec: number
}

export interface RateLimitResult {
  allowed: boolean
  count: number
  /** Seconds until the oldest counted row falls out of the window. */
  retryAfterSec: number
}

export async function checkRateLimit({
  key,
  max,
  windowSec,
}: RateLimitInput): Promise<RateLimitResult> {
  const sb = getServerClient()
  const since = new Date(Date.now() - windowSec * 1000).toISOString()

  try {
    const { count, error: countErr } = await sb
      .from('rate_limit_buckets')
      .select('id', { count: 'exact', head: true })
      .eq('key', key)
      .gte('created_at', since)

    if (countErr) {
      console.error('[rate-limit] count failed, fail-soft allow', countErr)
      return { allowed: true, count: 0, retryAfterSec: 0 }
    }

    const used = count ?? 0
    if (used >= max) {
      // Look up the oldest row inside the window so we can tell the
      // caller when their limit resets.
      const { data: oldest } = await sb
        .from('rate_limit_buckets')
        .select('created_at')
        .eq('key', key)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      const oldestMs = oldest?.created_at ? Date.parse(oldest.created_at) : Date.now()
      const retryAfterSec = Math.max(
        1,
        Math.ceil((oldestMs + windowSec * 1000 - Date.now()) / 1000),
      )
      return { allowed: false, count: used, retryAfterSec }
    }

    // Insert the row that counts THIS request before returning. If insert
    // fails, still allow — the count was under the limit anyway.
    const { error: insertErr } = await sb
      .from('rate_limit_buckets')
      .insert({ key })
    if (insertErr) {
      console.error('[rate-limit] insert failed (still allowing)', insertErr)
    }

    return { allowed: true, count: used + 1, retryAfterSec: 0 }
  } catch (err) {
    console.error('[rate-limit] unexpected error, fail-soft allow', err)
    return { allowed: true, count: 0, retryAfterSec: 0 }
  }
}

// Best-effort client IP extraction from the request headers. Works on
// Vercel (x-forwarded-for, x-real-ip) and falls back to a literal
// 'unknown' string so the rate-limit key is still stable. Don't rely on
// this for security — clients can spoof these headers when there's no
// trusted proxy in front.
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    // First IP in the chain is the original client.
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
