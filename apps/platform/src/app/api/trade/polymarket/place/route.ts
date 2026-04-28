import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { loadUserCredentials, touchLastUsed } from '@/lib/autotrade/credentials'
import { placeMarketOrder, resolveTokenIds } from '@/lib/autotrade/polymarket'

// POST /api/trade/polymarket/place
//
// Body: { marketId, outcome: 'YES'|'NO', side: 'BUY'|'SELL', sizeUsd }
//   OR  { tokenId, outcome, side, sizeUsd }   ← legacy direct-tokenId form
//
// Places a market order on Polymarket using the user's stored CLOB +
// signing credentials. Logs to trade_executions on attempt + on
// completion. Caps sizeUsd at $1000 in v1.
//
// `marketId` is the gamma `id` we get from the scraper. We resolve it to
// the YES/NO conditional-token IDs server-side via the gamma API before
// placing the order, so the client never has to know about token IDs.

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

  const directTokenId = typeof body.tokenId === 'string' ? body.tokenId.trim() : ''
  const sideRaw = typeof body.side === 'string' ? body.side.toUpperCase() : ''
  const sizeUsd = typeof body.sizeUsd === 'number' ? body.sizeUsd : Number(body.sizeUsd)
  const marketId =
    typeof body.marketId === 'string' && body.marketId.trim().length > 0
      ? body.marketId.trim()
      : null
  const outcome = typeof body.outcome === 'string' ? body.outcome.toUpperCase() : ''

  if (sideRaw !== 'BUY' && sideRaw !== 'SELL') {
    return Response.json(
      { error: 'invalid_input', message: 'Side must be BUY or SELL.' },
      { status: 400 },
    )
  }
  if (outcome !== 'YES' && outcome !== 'NO' && !directTokenId) {
    return Response.json(
      { error: 'invalid_outcome', message: "Outcome must be 'YES' or 'NO'." },
      { status: 400 },
    )
  }
  if (!marketId && !directTokenId) {
    return Response.json(
      { error: 'invalid_market', message: 'Provide a marketId.' },
      { status: 400 },
    )
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

  // Resolve the conditional-token id to use. Direct-tokenId path (legacy
  // / advanced) skips the lookup; marketId+outcome (preferred) hits the
  // gamma API to map the gamma id → clobTokenIds.
  let tokenId = directTokenId
  if (!tokenId && marketId) {
    try {
      const ids = await resolveTokenIds(marketId)
      tokenId = outcome === 'YES' ? ids.yesTokenId : ids.noTokenId
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      console.error('[trade/polymarket] resolveTokenIds failed', message)
      return Response.json(
        { error: 'token_resolution_failed', message },
        { status: 502 },
      )
    }
  }
  if (!tokenId) {
    return Response.json({ error: 'no_token_id' }, { status: 400 })
  }

  // Pre-insert the trade row so we have a paper trail even if the
  // venue call throws. We update it after the response lands.
  const admin = getServerClient()
  const { data: row } = await admin
    .from('trade_executions')
    .insert({
      user_id: user.id,
      venue: 'polymarket',
      market_id: marketId ?? tokenId,
      side: sideRaw === 'BUY' ? 'buy' : 'sell',
      outcome: outcome || 'UNKNOWN',
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
