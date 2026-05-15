import { getWalletProvider } from '@/lib/wallet'

// POST /api/wallet/moonpay/webhook
//
// MoonPay calls this when a transaction state changes. We:
//   1. Pull raw body (signature verification needs it byte-exact, no JSON
//      parse in between).
//   2. Hand the request to the active wallet provider's parseWebhookRequest
//      — that's where signature verification + payload-shape parsing live.
//      Provider returns null for invalid signatures or unrecognized events.
//   3. Persist the normalized WebhookEvent: upsert the txn row, recompute
//      the user's balance.
//
// While we're in mock mode (env vars absent or KYB pending), the provider
// selector returns mockProvider whose parseWebhookRequest always returns
// null. The route still 200s so any stray POSTs don't trigger vendor
// retry storms.
//
// IMPORTANT: this route is server-side only. It runs with the service
// role to write wallet_balances / wallet_transactions, bypassing RLS.
// Never expose it client-side.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const provider = getWalletProvider()

  // Pre-KYB / dev mode — accept and no-op to avoid the vendor retrying.
  if (!provider.isLive) {
    console.log(
      '[wallet/moonpay/webhook] received in mock mode, accepting+ignoring',
    )
    return Response.json({ ok: true, mode: 'mock' }, { status: 200 })
  }

  const rawBody = await req.text()

  let event
  try {
    event = await provider.parseWebhookRequest(req.headers, rawBody)
  } catch (err) {
    console.error('[wallet/moonpay/webhook] parse threw', err)
    return Response.json({ error: 'parse_failed' }, { status: 400 })
  }

  if (!event) {
    // Either bad signature or payload we don't recognize. 400 makes the
    // vendor stop retrying; the alternative (silent 200) hides real bugs.
    console.warn('[wallet/moonpay/webhook] rejected — invalid signature or shape')
    return Response.json({ error: 'invalid' }, { status: 400 })
  }

  console.log(
    `[wallet/moonpay/webhook] ${event.type} ${event.vendorEventId} user=${event.externalUserId}`,
  )

  // Phase 1.5b lands here:
  //
  //   - Upsert into wallet_transactions on (vendor, vendor_txn_id) so
  //     re-delivery of the same event is idempotent.
  //   - If status flipped to 'completed', recompute wallet_balances for
  //     this user (sum of completed inflows minus outflows). Use a single
  //     SQL statement to keep balance + txn write atomic.
  //   - Optionally fan out a notification (email, push) on first
  //     'completed' transition.
  //
  // For now: log and 200 so the vendor doesn't retry. The full persistence
  // path waits on KYB + sandbox keys + migration 043 being applied.

  return Response.json({ ok: true })
}
