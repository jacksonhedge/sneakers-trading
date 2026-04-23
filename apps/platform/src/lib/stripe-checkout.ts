import type Stripe from 'stripe'
import { getStripe, siteUrl } from './stripe'
import {
  PLANS,
  accountTypeForFlavor,
  priceIdToFlavor,
  type AccountType,
} from './subscriptions'

/**
 * Create a Stripe Checkout Session for a subscription. The caller has already
 * authenticated the user and verified their account_type vs the priceId.
 *
 * Trial length is pulled from PLANS (the lib/subscriptions.ts source of truth)
 * — Pro/Elite/Fraternity get 7 days, Business standard gets 2. Stripe charges
 * the card the user enters, but waits until day 7 (or 2) before settling, so a
 * card is required up-front by default — no special flag needed.
 *
 * Verified students get 14-day trials on Pro/Elite (double the standard 7)
 * in addition to the 75%-off coupon. Matches the "2 weeks free, then 75% off"
 * language on /students.
 *
 * Promotion codes are enabled so the Stripe-hosted page shows a coupon box.
 * The student-discount path (PR3) attaches its coupon programmatically via
 * the optional `studentCoupon` param — that one is server-side only and
 * never exposed to the client.
 */

// Trial length for verified students on Pro/Elite. Non-student trials come
// from PLANS[flavor].trialDays.
const STUDENT_TRIAL_DAYS = 14
export interface CreateCheckoutInput {
  priceId: string
  userId: string             // auth.users.id (uuid)
  userEmail: string
  accountType: AccountType   // user's current waitlist.account_type
  /** existing Stripe customer for repeat subscribers — pass to reuse cards on file. */
  stripeCustomerId?: string | null
  /** server-side coupon attach (e.g. STUDENT75 for verified students). Never client-supplied. */
  studentCoupon?: string | null
}

export interface CreateCheckoutOk {
  ok: true
  url: string
  sessionId: string
}
export interface CreateCheckoutErr {
  ok: false
  code:
    | 'unknown_price'
    | 'wrong_account_type'
    | 'stripe_not_configured'
    | 'no_checkout_url'
    | 'stripe_error'
  message: string
}

export async function createSubscriptionCheckout(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutOk | CreateCheckoutErr> {
  const lookup = priceIdToFlavor(input.priceId)
  if (!lookup) {
    return { ok: false, code: 'unknown_price', message: `Unknown price ID: ${input.priceId}` }
  }
  const { flavor } = lookup
  const requiredAccountType = accountTypeForFlavor(flavor)
  if (requiredAccountType && requiredAccountType !== input.accountType) {
    return {
      ok: false,
      code: 'wrong_account_type',
      message: `${flavor} requires a ${requiredAccountType} account; user has ${input.accountType}`,
    }
  }
  const plan = PLANS.find((p) => p.flavor === flavor)
  if (!plan) {
    return { ok: false, code: 'unknown_price', message: `No plan metadata for flavor ${flavor}` }
  }

  let stripe: Stripe
  try {
    stripe = getStripe()
  } catch (err) {
    return { ok: false, code: 'stripe_not_configured', message: (err as Error).message }
  }

  const base = siteUrl()

  // Verified students on Pro/Elite get a doubled trial (14 days vs 7). Coupon
  // eligibility (STUDENT75 restricted to Pro+Elite) gates this — we don't need
  // to re-check flavor here.
  const trialDays = input.studentCoupon ? STUDENT_TRIAL_DAYS : plan.trialDays

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: input.priceId, quantity: 1 }],
    client_reference_id: input.userId,
    success_url: `${base}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/dashboard/billing?canceled=true`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: {
        user_id: input.userId,
        flavor,
        interval: lookup.interval,
      },
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
    },
    metadata: {
      user_id: input.userId,
      flavor,
      interval: lookup.interval,
    },
  }

  // Reuse existing customer if we have one — keeps payment methods on file.
  if (input.stripeCustomerId) {
    params.customer = input.stripeCustomerId
  } else {
    params.customer_email = input.userEmail
  }

  // Server-attached student coupon. Never accept this from the client; the
  // API route only sets it when student_verification.status = 'approved'.
  if (input.studentCoupon) {
    params.discounts = [{ coupon: input.studentCoupon }]
    // Stripe rejects discounts + allow_promotion_codes together — the
    // server-attached coupon takes precedence.
    delete params.allow_promotion_codes
  }

  try {
    const session = await stripe.checkout.sessions.create(params)
    if (!session.url) {
      return { ok: false, code: 'no_checkout_url', message: 'Stripe returned no URL' }
    }
    return { ok: true, url: session.url, sessionId: session.id }
  } catch (err) {
    return {
      ok: false,
      code: 'stripe_error',
      message: err instanceof Error ? err.message : 'unknown',
    }
  }
}

