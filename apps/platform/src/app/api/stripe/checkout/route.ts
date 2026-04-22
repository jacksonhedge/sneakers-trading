import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { createSubscriptionCheckout } from '@/lib/stripe-checkout'
import { priceIdToFlavor } from '@/lib/subscriptions'
import { getApprovedStudent } from '@/lib/student'

// POST /api/stripe/checkout
//
// Body: { priceId: 'price_...' }
// Returns: { url: 'https://checkout.stripe.com/...' } — client redirects there.
//
// Auth-gated. Validates the priceId resolves to a known flavor and that the
// user's account_type is allowed to subscribe to it. Reuses the existing
// stripe_customer_id if the user already has one (so payment methods on file
// carry over). The actual subscription state is written by the webhook on
// `checkout.session.completed` — never here.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const authed = await getAuthClient()
  const {
    data: { user },
  } = await authed.auth.getUser()
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { priceId?: unknown }
  const priceId = typeof body.priceId === 'string' ? body.priceId : null
  if (!priceId) {
    return Response.json({ error: 'missing_price_id' }, { status: 400 })
  }
  if (!priceIdToFlavor(priceId)) {
    return Response.json({ error: 'unknown_price' }, { status: 400 })
  }

  // Service-role read to bypass RLS for the user's waitlist row + see the
  // already-stored stripe_customer_id (if any) and account_type.
  const admin = getServerClient()
  const { data: row, error: rowErr } = await admin
    .from('waitlist')
    .select('id, account_type, stripe_customer_id')
    .eq('email', user.email)
    .maybeSingle()
  if (rowErr || !row) {
    return Response.json({ error: 'waitlist_lookup_failed', detail: rowErr?.message }, { status: 500 })
  }
  const accountType = (row.account_type as 'individual' | 'business' | null) ?? 'individual'

  // Server-side student-coupon attach. Coupon ID is never accepted from the
  // client. Restricted to Pro + Elite (matches the coupon's product
  // restriction in the Stripe dashboard — see docs/stripe-setup.md §2).
  let studentCoupon: string | null = null
  const flavor = priceIdToFlavor(priceId)?.flavor
  if (flavor === 'pro' || flavor === 'elite') {
    const approved = await getApprovedStudent(row.id as string)
    if (approved) {
      const couponId = process.env.STRIPE_COUPON_STUDENT75
      if (!couponId) {
        console.warn('[stripe/checkout] approved student but STRIPE_COUPON_STUDENT75 unset')
      } else {
        studentCoupon = couponId
      }
    }
  }

  const result = await createSubscriptionCheckout({
    priceId,
    userId: user.id,
    userEmail: user.email,
    accountType,
    stripeCustomerId: row.stripe_customer_id ?? null,
    studentCoupon,
  })

  if (!result.ok) {
    const status =
      result.code === 'wrong_account_type'
        ? 403
        : result.code === 'unknown_price'
          ? 400
          : result.code === 'stripe_not_configured'
            ? 503
            : 500
    return Response.json({ error: result.code, message: result.message }, { status })
  }

  return Response.json({ url: result.url, sessionId: result.sessionId })
}
