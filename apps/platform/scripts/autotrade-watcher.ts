#!/usr/bin/env tsx
// Autotrade position watcher (Polymarket v1).
//
// Loads every open autotrade_positions row, fetches current Polymarket
// midpoint per token, and — when the price crosses TP or SL — fires a
// market sell via the existing placeMarketOrder path. Updates each row's
// last_checked_at + last_observed_price on every pass; flips status to
// 'closed' (or 'errored') when the sell completes.
//
// Run manually:
//   cd apps/platform && pnpm watch:positions
//
// Or under cron / a Railway worker every 60s. Safe to run concurrently:
// markClosing() does an optimistic 'open' → 'closing' update so only one
// watcher fires the sell per position.
//
// Flags:
//   --once        Single pass, then exit (default if NODE_ENV != 'production')
//   --interval N  Loop forever, sleeping N seconds between passes (default 60)

import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'

loadEnv({ path: path.join(process.cwd(), '.env.local') })

import {
  listAllOpenPositions,
  recordPriceObservation,
  markClosing,
  recordClose,
  checkTrigger,
  type AutotradePosition,
} from '../src/lib/autotrade/positions'
import { loadUserCredentials } from '../src/lib/autotrade/credentials'
import { placeMarketOrder } from '../src/lib/autotrade/polymarket'

const POLYMARKET_CLOB_BASE = 'https://clob.polymarket.com'
const FETCH_TIMEOUT_MS = 10_000
const MAX_PARALLEL = 5

interface MidpointResponse {
  mid: string | number
}

async function fetchMidpoint(tokenId: string): Promise<number | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(
      `${POLYMARKET_CLOB_BASE}/midpoint?token_id=${encodeURIComponent(tokenId)}`,
      { signal: ctrl.signal },
    )
    if (!res.ok) return null
    const json = (await res.json()) as MidpointResponse
    const mid = typeof json.mid === 'number' ? json.mid : parseFloat(json.mid)
    return Number.isFinite(mid) ? mid : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function processOne(
  pos: AutotradePosition,
): Promise<{ result: 'no-trigger' | 'closed' | 'errored' | 'price-fail' | 'no-tpsl' }> {
  // Skip rows the watcher can't act on. Position rows with neither
  // threshold set are just record-keeping; we still update their
  // last_observed_price so the dashboard shows freshness.
  const hasAnyTrigger = pos.take_profit_price != null || pos.stop_loss_price != null

  const mid = await fetchMidpoint(pos.token_id)
  if (mid == null) {
    return { result: 'price-fail' }
  }

  await recordPriceObservation(pos.id, mid)

  if (!hasAnyTrigger) {
    return { result: 'no-tpsl' }
  }

  const trigger = checkTrigger(mid, pos)
  if (!trigger) {
    return { result: 'no-trigger' }
  }

  // Optimistic claim. If another watcher pass beat us, skip.
  const claimed = await markClosing(pos.id)
  if (!claimed) {
    return { result: 'no-trigger' }
  }

  // Find the auth user_id for credential lookup. Positions reference
  // waitlist.id; credentials are keyed by auth.users.id. We need the
  // mapping. Cheap join.
  const authUserId = await resolveAuthUserId(pos.user_id)
  if (!authUserId) {
    await recordClose(pos.id, {
      reason: 'error',
      close_price: mid,
      close_error: `no auth.users row for waitlist id ${pos.user_id}`,
      final_status: 'errored',
    })
    return { result: 'errored' }
  }

  const creds = await loadUserCredentials(authUserId, 'polymarket')
  if (!creds) {
    await recordClose(pos.id, {
      reason: 'error',
      close_price: mid,
      close_error: 'user has no Polymarket credentials configured',
      final_status: 'errored',
    })
    return { result: 'errored' }
  }

  // SELL of N shares at midpoint M = N * M USDC notional.
  const sizeUsd = Math.max(1, Math.round(pos.size_shares * mid * 100) / 100)

  try {
    const order = await placeMarketOrder(creds, {
      tokenId: pos.token_id,
      side: 'SELL',
      sizeUsd,
    })
    await recordClose(pos.id, {
      reason: trigger,
      close_price: mid,
      close_error: null,
      final_status: 'closed',
    })
    log(
      `closed pos=${pos.id} token=${pos.token_id} reason=${trigger} mid=${mid} sizeUsd=${sizeUsd} orderId=${order.orderId}`,
    )
    return { result: 'closed' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await recordClose(pos.id, {
      reason: 'error',
      close_price: mid,
      close_error: message,
      final_status: 'errored',
    })
    log(`ERR pos=${pos.id} sell failed: ${message}`)
    return { result: 'errored' }
  }
}

async function resolveAuthUserId(waitlistId: string): Promise<string | null> {
  const { getServerClient } = await import('../src/lib/supabase-server')
  const admin = getServerClient()
  const { data } = await admin
    .from('waitlist')
    .select('email')
    .eq('id', waitlistId)
    .maybeSingle<{ email: string }>()
  if (!data?.email) return null
  // Look up auth.users by email. We do this server-side via the admin
  // API rather than a join because auth.users isn't in the public schema.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const u = list?.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase())
  return u?.id ?? null
}

async function processBatch(positions: AutotradePosition[]): Promise<void> {
  // Bounded parallelism so we don't fan out 100 Polymarket calls at once.
  const queue = [...positions]
  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(MAX_PARALLEL, queue.length); i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const next = queue.shift()
          if (!next) return
          await processOne(next).catch((err) => {
            log(`ERR pos=${next.id} processOne threw: ${(err as Error).message}`)
          })
        }
      })(),
    )
  }
  await Promise.all(workers)
}

function log(msg: string): void {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ${msg}`)
}

async function runOnce(): Promise<void> {
  const t0 = Date.now()
  const positions = await listAllOpenPositions()
  log(`pass start · open positions=${positions.length}`)
  if (positions.length === 0) {
    log(`pass done · 0ms · nothing to do`)
    return
  }
  await processBatch(positions)
  log(`pass done · ${Date.now() - t0}ms · processed ${positions.length}`)
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))
  const intervalArg = process.argv.find((a, i) => process.argv[i - 1] === '--interval')
  const intervalSec = intervalArg ? Math.max(15, parseInt(intervalArg, 10)) : 60
  const isLoop = args.has('--loop') || (!args.has('--once') && process.env.NODE_ENV === 'production')

  if (!isLoop) {
    await runOnce()
    return
  }

  log(`watcher starting · loop interval=${intervalSec}s`)
  for (;;) {
    try {
      await runOnce()
    } catch (err) {
      log(`pass crashed: ${(err as Error).message}`)
    }
    await new Promise((r) => setTimeout(r, intervalSec * 1000))
  }
}

main().catch((err) => {
  log(`fatal: ${(err as Error).message}`)
  process.exit(1)
})
