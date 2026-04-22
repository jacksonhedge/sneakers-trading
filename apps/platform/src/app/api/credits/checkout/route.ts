import { getAuthClient } from '@/lib/supabase-auth'
import { CREDIT_PACKS } from '@/lib/credits'
import { getStripe, siteUrl } from '@/lib/stripe'

// POST /api/credits/checkout
//
// Body: { packId: 'credits_10' | 'credits_25' | 'credits_100' | 'credits_500' }
// Returns: { url: 'https://checkout.stripe.com/...' } — client redirects there.
//
// Creates a one-time Stripe Checkout Session for the requested credit pack.
// The webhook at /api/credits/webhook handles fulfillment (calling
// grantCredits) when Stripe confirms payment. Never grant credits here —
// Stripe's payment could still fail after session creation.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { packId?: unknown }
  const packId = typeof body.packId === 'string' ? body.packId : null
  const pack = CREDIT_PACKS.find((p) => p.id === packId)
  if (!pack) {
    return Response.json({ error: 'invalid_pack', validIds: CREDIT_PACKS.map((p) => p.id) }, { status: 400 })
  }

  let stripe
  try {
    stripe = getStripe()
  } catch (err) {
    return Response.json(
      { error: 'stripe_not_configured', message: (err as Error).message },
      { status: 503 },
    )
  }

  const totalCredits = pack.credits + pack.bonus
  const bonusLabel = pack.bonus > 0 ? ` (includes ${pack.bonus.toLocaleString()} bonus)` : ''
  const base = siteUrl()

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // One-time purchase; no subscription.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: pack.usd * 100, // cents
            product_data: {
              name: `${totalCredits.toLocaleString()} O'Toole Credits${bonusLabel}`,
              description: `Pre-paid credits for O'Toole AI — Haiku ≈ 3 cr, Sonnet ≈ 30 cr, Opus ≈ 150 cr per message.`,
            },
          },
        },
      ],
      client_reference_id: user.id,
      customer_email: user.email,
      success_url: `${base}/dashboard/billing/credits?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/dashboard/billing/credits?purchase=canceled`,
      allow_promotion_codes: true,
      // Metadata lets the webhook know exactly which pack was bought +
      // who bought it, without re-querying Supabase or decoding emails.
      metadata: {
        user_id: user.id,
        pack_id: pack.id,
        credits_base: String(pack.credits),
        credits_bonus: String(pack.bonus),
        credits_total: String(totalCredits),
      },
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          pack_id: pack.id,
          credits_total: String(totalCredits),
        },
      },
    })

    if (!session.url) {
      return Response.json({ error: 'no_checkout_url' }, { status: 500 })
    }

    return Response.json({ url: session.url, sessionId: session.id })
  } catch (err) {
    console.error('[credits/checkout] stripe error', err)
    return Response.json(
      { error: 'stripe_error', message: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
