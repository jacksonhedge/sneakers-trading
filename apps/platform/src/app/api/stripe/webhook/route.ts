import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { getServerClient } from '@/lib/supabase-server'
import {
  flavorToSubtype,
  flavorToTier,
  priceIdToFlavor,
  type BillingFlavor,
  type Tier,
} from '@/lib/subscriptions'

// POST /api/stripe/webhook
//
// Stripe webhook receiver for SUBSCRIPTION events. The credits webhook at
// /api/credits/webhook handles one-time payments — these two intentionally
// share the Stripe account but use distinct endpoints + signing secrets so
// they can be administered independently.
//
// Stripe's verify/fulfill pattern requires the RAW body for HMAC; Next.js App
// Router gives us that via req.text().
//
// The four event types we subscribe to:
//   checkout.session.completed       → first time we see a customer + sub_id;
//                                      bind them to the waitlist row by email
//   customer.subscription.updated    → status, price, period_end, cancel flag
//   customer.subscription.deleted    → user fully canceled; downgrade to free
//   invoice.payment_failed           → set status to past_due; Stripe retries

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const signingSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET
  if (!signingSecret) {
    console.error('[stripe-webhook] STRIPE_SUBSCRIPTION_WEBHOOK_SECRET not set')
    return Response.json({ error: 'webhook_not_configured' }, { status: 503 })
  }
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return Response.json({ error: 'missing_signature' }, { status: 400 })
  }
  const raw = await req.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, signingSecret)
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed', err)
    return Response.json({ error: 'invalid_signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        // Subscription mode only — credits handler picks up payment-mode sessions.
        if (session.mode !== 'subscription') break
        await handleCheckoutCompleted(session)
        break
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        await applySubscriptionState(sub)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await applySubscriptionState(sub, { forceCanceled: true })
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null
        }
        const subId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id ?? null
        if (subId) await markPastDue(subId)
        break
      }
      default:
        // Other events ignored — credits webhook handles its own.
        break
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error for', event.type, err)
    // Return 500 so Stripe retries with backoff. Idempotency is provided by
    // the upserts (we always overwrite the latest state from Stripe).
    return Response.json({ error: 'handler_failed' }, { status: 500 })
  }

  return Response.json({ received: true })
}

// ─── Handlers ──────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null
  const email = session.customer_details?.email ?? session.customer_email ?? null
  if (!customerId || !subscriptionId || !email) {
    console.warn(
      '[stripe-webhook] checkout.session.completed missing customer/subscription/email',
      session.id,
    )
    return
  }

  // Bind the customer + subscription to the waitlist row by email. After
  // this, future subscription.* events for the same customer can be matched
  // by stripe_customer_id without needing email.
  const sb = getServerClient()
  const { error } = await sb
    .from('waitlist')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
    })
    .eq('email', email.toLowerCase())
  if (error) {
    console.error('[stripe-webhook] failed to attach customer ids by email', email, error)
    throw error
  }

  // Re-fetch the subscription so we write the canonical state (status, price,
  // period_end, etc.) — the .completed event payload doesn't always have the
  // latest, especially for trialing subs.
  const sub = await getStripe().subscriptions.retrieve(subscriptionId)
  await applySubscriptionState(sub)
}

async function applySubscriptionState(
  sub: Stripe.Subscription,
  opts?: { forceCanceled?: boolean },
): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const item = sub.items.data[0]
  const priceId = item?.price?.id ?? null
  const flavor: BillingFlavor | null = priceId ? priceIdToFlavor(priceId)?.flavor ?? null : null
  const fullTier: Tier = flavor ? flavorToTier(flavor) : 'free'
  const subtype = flavor ? flavorToSubtype(flavor) : null

  const status = opts?.forceCanceled ? 'canceled' : sub.status
  // Defensive: even if Stripe says someone is on Pro but their status is
  // past_due, we surface them as free here. requireTier re-checks on read,
  // so this is belt-and-suspenders.
  const effectiveTier: Tier = status === 'active' || status === 'trialing' ? fullTier : 'free'

  // current_period_end moved onto SubscriptionItem in Stripe SDK v22.
  const periodEnd = item?.current_period_end ?? null

  const sb = getServerClient()
  const { error } = await sb
    .from('waitlist')
    .update({
      stripe_subscription_id: opts?.forceCanceled ? null : sub.id,
      subscription_status: status,
      subscription_current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      subscription_cancel_at_period_end: sub.cancel_at_period_end,
      subscription_price_id: priceId,
      plan_tier: effectiveTier,
      business_subtype: fullTier === 'business' ? subtype : null,
    })
    .eq('stripe_customer_id', customerId)
  if (error) {
    console.error('[stripe-webhook] failed to apply subscription state', sub.id, error)
    throw error
  }
}

async function markPastDue(subscriptionId: string): Promise<void> {
  const sb = getServerClient()
  const { error } = await sb
    .from('waitlist')
    .update({ subscription_status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId)
  if (error) console.error('[stripe-webhook] failed to mark past_due', subscriptionId, error)
}
