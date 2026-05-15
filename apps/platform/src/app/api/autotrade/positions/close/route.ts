import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { loadUserCredentials } from '@/lib/autotrade/credentials'
import { placeMarketOrder } from '@/lib/autotrade/polymarket'
import {
  markClosing,
  recordClose,
  type AutotradePosition,
} from '@/lib/autotrade/positions'

// POST /api/autotrade/positions/close
// Body: { positionId: string }
//
// Manual close — user yanks an open autotrade_positions row before
// TP/SL fires. Mirrors the watcher's sell flow (claim → fetch midpoint →
// SELL → recordClose) but with reason='manual'. Idempotent: a position
// already in 'closing' or 'closed' state returns the existing state
// without firing a second sell.

export const dynamic = 'force-dynamic'

const POLYMARKET_CLOB_BASE = 'https://clob.polymarket.com'
const FETCH_TIMEOUT_MS = 10_000

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

export async function POST(req: Request) {
  const supabase = await getAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { positionId?: unknown }
  const positionId = typeof body.positionId === 'string' ? body.positionId : null
  if (!positionId) {
    return NextResponse.json(
      { ok: false, error: 'positionId required' },
      { status: 400 },
    )
  }

  const admin = getServerClient()

  // Map auth user → waitlist row (positions are keyed by waitlist.id).
  const { data: waitlistRow } = await admin
    .from('waitlist')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle<{ id: string }>()
  if (!waitlistRow?.id) {
    return NextResponse.json({ ok: false, error: 'no waitlist row' }, { status: 403 })
  }

  // Load + verify ownership.
  const { data: pos } = await admin
    .from('autotrade_positions')
    .select('*')
    .eq('id', positionId)
    .maybeSingle()
  if (!pos) {
    return NextResponse.json({ ok: false, error: 'position not found' }, { status: 404 })
  }
  const position = pos as unknown as AutotradePosition
  if (position.user_id !== waitlistRow.id) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  if (position.status !== 'open') {
    return NextResponse.json(
      { ok: false, error: `position already ${position.status}` },
      { status: 409 },
    )
  }

  // Optimistic claim. Loses to a concurrent watcher pass; that's fine.
  const claimed = await markClosing(positionId)
  if (!claimed) {
    return NextResponse.json(
      { ok: false, error: 'position is already closing (watcher beat you to it)' },
      { status: 409 },
    )
  }

  const mid = await fetchMidpoint(position.token_id)
  if (mid == null) {
    await recordClose(positionId, {
      reason: 'error',
      close_price: null,
      close_error: 'could not fetch Polymarket midpoint',
      final_status: 'errored',
    })
    return NextResponse.json(
      { ok: false, error: 'could not fetch current price' },
      { status: 502 },
    )
  }

  const creds = await loadUserCredentials(user.id, 'polymarket')
  if (!creds) {
    await recordClose(positionId, {
      reason: 'error',
      close_price: mid,
      close_error: 'no Polymarket credentials configured',
      final_status: 'errored',
    })
    return NextResponse.json(
      { ok: false, error: 'no Polymarket credentials' },
      { status: 412 },
    )
  }

  const sizeUsd = Math.max(1, Math.round(position.size_shares * mid * 100) / 100)

  try {
    const order = await placeMarketOrder(creds, {
      tokenId: position.token_id,
      side: 'SELL',
      sizeUsd,
    })
    await recordClose(positionId, {
      reason: 'manual',
      close_price: mid,
      close_error: null,
      final_status: 'closed',
    })
    return NextResponse.json({
      ok: true,
      orderId: order.orderId,
      closePrice: mid,
      sizeUsd,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown sell error'
    await recordClose(positionId, {
      reason: 'error',
      close_price: mid,
      close_error: message,
      final_status: 'errored',
    })
    return NextResponse.json(
      { ok: false, error: `Polymarket rejected sell: ${message}` },
      { status: 502 },
    )
  }
}
