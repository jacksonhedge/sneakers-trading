import { getStripe, siteUrl } from './stripe'

/**
 * Create a Customer Portal session — Stripe-hosted UI where users can update
 * payment method, switch plans, or cancel. Returns the redirect URL.
 *
 * Requires the Stripe Customer Portal to be enabled in the dashboard
 * (docs/stripe-setup.md §3). On a fresh test-mode account that step is easy
 * to forget, so the SDK error is surfaced unmodified rather than swallowed.
 */
export async function createPortalSession(
  stripeCustomerId: string,
  returnPath: string = '/dashboard/billing',
): Promise<{ ok: true; url: string } | { ok: false; code: string; message: string }> {
  let stripe
  try {
    stripe = getStripe()
  } catch (err) {
    return { ok: false, code: 'stripe_not_configured', message: (err as Error).message }
  }
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${siteUrl()}${returnPath}`,
    })
    return { ok: true, url: session.url }
  } catch (err) {
    return {
      ok: false,
      code: 'stripe_error',
      message: err instanceof Error ? err.message : 'unknown',
    }
  }
}
