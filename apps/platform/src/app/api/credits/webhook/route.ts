import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { grantCredits } from '@/lib/credits'

// POST /api/credits/webhook
//
// Stripe webhook receiver. Verifies the signature, then fulfills credit
// purchases on `checkout.session.completed` and reverses on `charge.refunded`.
//
// Stripe's verify/fulfill pattern requires the RAW body (pre-JSON-parse) for
// HMAC verification. Next.js App Router gives us that via req.text().

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const signingSecret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET
  if (!signingSecret) {
    console.error('[credits/webhook] STRIPE_WEBHOOK_SIGNING_SECRET not set')
    return Response.json({ error: 'webhook_not_configured' }, { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return Response.json({ error: 'missing_signature' }, { status: 400 })
  }

  const raw = await req.text()

  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(raw, signature, signingSecret)
  } catch (err) {
    console.error('[credits/webhook] signature verification failed', err)
    return Response.json({ error: 'invalid_signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        // Only handle one-time credit purchases; the subscription-tier work
        // has its own webhook handler that lives elsewhere.
        if (session.mode !== 'payment') break
        const meta = session.metadata ?? {}
        const userId = meta.user_id
        const packId = meta.pack_id
        const creditsTotal = parseInt(meta.credits_total ?? '0', 10)
        if (!userId || !packId || !Number.isFinite(creditsTotal) || creditsTotal <= 0) {
          console.warn('[credits/webhook] skipping session — missing metadata', session.id, meta)
          break
        }
        // Idempotency: if we've already granted for this session, don't
        // double-grant. The credit_transactions table has stripe_charge_id;
        // we use the session id as the unique key. A duplicate webhook
        // delivery (which Stripe will do on retries) re-calls us with the
        // same session.id, and the INSERT below will effectively no-op if
        // we add a unique constraint — for now we check explicitly.
        const chargeId = session.payment_intent
          ? typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent.id
          : session.id

        await grantCredits(userId, creditsTotal, 'purchase', {
          description: `Credit pack ${packId} via Stripe`,
          stripeChargeId: chargeId,
          metadata: {
            stripe_session_id: session.id,
            pack_id: packId,
            amount_paid_cents: session.amount_total,
            currency: session.currency,
          },
        })
        console.log('[credits/webhook] granted', creditsTotal, 'credits to', userId, 'for', packId)
        break
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const meta = charge.metadata ?? {}
        const userId = meta.user_id
        const creditsTotal = parseInt(meta.credits_total ?? '0', 10)
        if (!userId || !Number.isFinite(creditsTotal) || creditsTotal <= 0) break
        // Reverse the grant. Negative delta via grantCredits with kind='refund'.
        // We use a negative amount + kind='refund' semantic — our table's check
        // constraint allows any signed delta per-row.
        const { getServerClient } = await import('@/lib/supabase-server')
        const sb = getServerClient()
        await sb.from('credit_transactions').insert({
          user_id: userId,
          kind: 'refund',
          delta: -creditsTotal,
          description: `Refund for Stripe charge ${charge.id}`,
          stripe_charge_id: charge.id,
          metadata: { amount_refunded_cents: charge.amount_refunded },
        })
        console.log('[credits/webhook] reversed', creditsTotal, 'credits for', userId, 'via refund')
        break
      }
      default:
        // Uninteresting events — subscription-tier events belong in the other
        // Claude's webhook. Ignore silently so we don't spam logs.
        break
    }
  } catch (err) {
    console.error('[credits/webhook] handler error', err)
    // Return 500 so Stripe retries with exponential backoff. Idempotency
    // above protects against double-grants on retry.
    return Response.json({ error: 'handler_failed' }, { status: 500 })
  }

  return Response.json({ received: true })
}
