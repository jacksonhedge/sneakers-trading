import type { CredentialBundle } from './credentials'

// Opinion.trade v1 API auth: a single API key in the `apikey` header.
//
// User setup (per the Opinion API access reference):
//   1. Sign up at opinion.trade.
//   2. Send <0.1 USDT on BNB Chain to the Opinion deposit address
//      (memory: 0x0932a1e…f60e) to seed your contract wallet.
//   3. Create the contract wallet inside the app.
//   4. Request an API key (approval-based, default 15 TPS).
//
// The wizard's affiliate nudge surfaces those steps.

const API_BASE = 'https://proxy.opinion.trade:8443/openapi'

// HEADS UP: Opinion's official docs are not in this repo. The path below
// is a guess that mirrors Kalshi's convention. If the test connection
// returns 404 or 405 on first run, swap to whatever Opinion actually
// publishes (likely candidates: `/account/balance`, `/wallet`, `/user`).
const BALANCE_PATH = '/portfolio/balance'

interface OpinionEnvelope<T> {
  data?: T
  result?: T
  // Opinion wraps responses in an envelope but the exact key varies
  // between endpoints in their public examples. The scraper at
  // apps/trader/src/scrapers/opinion uses `data.list`. We try both
  // shapes when reading balance.
  message?: string
  status?: string
}

async function opinionGet<T>(creds: CredentialBundle, path: string): Promise<{
  ok: boolean
  status: number
  body: OpinionEnvelope<T> | null
  raw: string
}> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      apikey: creds.apiKey,
    },
    cache: 'no-store',
  })
  const raw = await res.text()
  let body: OpinionEnvelope<T> | null = null
  try {
    body = raw ? (JSON.parse(raw) as OpinionEnvelope<T>) : null
  } catch {
    body = null
  }
  return { ok: res.ok, status: res.status, body, raw }
}

/**
 * Fetch the user's Opinion contract-wallet balance. Returns cents.
 *
 * Opinion settles in USDT on BNB Chain (6 decimals). The exact JSON
 * shape isn't pinned down in our codebase yet — we look in a few
 * common places and pick the first numeric one we find.
 */
export async function fetchBalance(creds: CredentialBundle): Promise<{
  cents: number
  raw: unknown
}> {
  const res = await opinionGet<{ balance?: number | string; usdt?: number | string }>(
    creds,
    BALANCE_PATH,
  )
  if (!res.ok) {
    throw new Error(
      `opinion ${BALANCE_PATH} returned ${res.status}: ${res.raw.slice(0, 200)}`,
    )
  }
  const payload = res.body?.data ?? res.body?.result ?? res.body
  const rawAmount =
    (payload as { balance?: number | string } | null)?.balance ??
    (payload as { usdt?: number | string } | null)?.usdt ??
    0
  // Treat the value as USDT in major units. USDT has 6 decimals; their
  // public scraper-side responses tend to return human-readable strings
  // (e.g. "12.34"), not base units. Coerce + multiply to cents.
  const usdt = typeof rawAmount === 'string' ? Number(rawAmount) : rawAmount
  const cents = Number.isFinite(usdt) ? Math.floor(usdt * 100) : 0
  return { cents, raw: res.body }
}

/**
 * Read-only auth check. Hits the balance endpoint — if it returns 401
 * the key is bad; if it returns 404 the path guess above is wrong (and
 * the surfaced reason will say so so you can fix the constant).
 */
export async function testConnection(creds: CredentialBundle): Promise<{
  ok: boolean
  reason?: string
}> {
  try {
    if (!creds.apiKey) return { ok: false, reason: 'missing api key' }
    const res = await opinionGet(creds, BALANCE_PATH)
    if (res.ok) return { ok: true }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'opinion rejected the api key' }
    }
    if (res.status === 404 || res.status === 405) {
      return {
        ok: false,
        reason: `opinion returned ${res.status} for ${BALANCE_PATH} — the balance endpoint path may need updating in lib/autotrade/opinion.ts`,
      }
    }
    return { ok: false, reason: `opinion returned ${res.status}` }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown error' }
  }
}
