import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { loadUserCredentials, touchLastUsed } from '@/lib/autotrade/credentials'
import { placeMarketOrder } from '@/lib/autotrade/polymarket'

// POST /api/trade/polymarket/place
//
// Body: { tokenId, side: 'BUY'|'SELL', sizeUsd, marketId?, outcome? }
//
// Places a market order on Polymarket using the user's stored CLOB +
// signing credentials. Logs to trade_executions on attempt + on
// completion. Caps sizeUsd at $1000 in v1 — same hard ceiling as
// auto-trade per the brief, but defaulting low until we've validated
// the execution path with real money.

const MAX_SIZE_USD = 1000

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    tokenId?: unknown
    side?: unknown
    sizeUsd?: unknown
    marketId?: unknown
    outcome?: unknown
  }

  const tokenId = typeof body.tokenId === 'string' ? body.tokenId : ''
  const sideRaw = typeof body.side === 'string' ? body.side.toUpperCase() : ''
  const sizeUsd = typeof body.sizeUsd === 'number' ? body.sizeUsd : Number(body.sizeUsd)
  const marketId = typeof body.marketId === 'string' ? body.marketId : tokenId
  const outcome = typeof body.outcome === 'string' ? body.outcome : ''

  if (!tokenId || (sideRaw !== 'BUY' && sideRaw !== 'SELL')) {
    return Response.json({ error: 'invalid_input' }, { status: 400 })
  }
  if (!Number.isFinite(sizeUsd) || sizeUsd <= 0 || sizeUsd > MAX_SIZE_USD) {
    return Response.json(
      {
        error: 'invalid_size',
        message: `Size must be between $0.01 and $${MAX_SIZE_USD.toLocaleString()} for manual trades in v1.`,
      },
      { status: 400 },
    )
  }

  const creds = await loadUserCredentials(user.id, 'polymarket')
  if (!creds) {
    return Response.json(
      { error: 'no_credentials', message: 'Connect Polymarket first from your settings.' },
      { status: 404 },
    )
  }
  if (!creds.privateKey) {
    return Response.json(
      {
        error: 'no_signing_key',
        message: 'No private key stored — re-save your credentials with the wallet key to enable trading.',
      },
      { status: 400 },
    )
  }

  // Pre-insert the trade row so we have a paper trail even if the
  // venue call throws. We update it after the response lands.
  const admin = getServerClient()
  const { data: row } = await admin
    .from('trade_executions')
    .insert({
      user_id: user.id,
      venue: 'polymarket',
      market_id: marketId,
      side: sideRaw === 'BUY' ? 'buy' : 'sell',
      outcome: outcome || tokenId,
      size_usd: sizeUsd,
      order_type: 'market',
      source: 'manual',
      status: 'pending',
    })
    .select('id')
    .maybeSingle()
  const tradeRowId = row?.id ?? null

  try {
    const result = await placeMarketOrder(creds, {
      tokenId,
      side: sideRaw,
      sizeUsd,
    })
    await touchLastUsed(user.id, 'polymarket')

    if (tradeRowId) {
      await admin
        .from('trade_executions')
        .update({
          status: 'pending',
          venue_order_id: result.orderId,
          venue_response: result.raw as object,
        })
        .eq('id', tradeRowId)
    }

    return Response.json({
      ok: true,
      orderId: result.orderId,
      tradeRowId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[trade/polymarket] place failed', message)
    if (tradeRowId) {
      await admin
        .from('trade_executions')
        .update({ status: 'error', error_message: message })
        .eq('id', tradeRowId)
    }
    return Response.json({ error: 'place_failed', message }, { status: 502 })
  }
}
