import Stripe from 'stripe'

/**
 * Shared Stripe client. Reads `STRIPE_SECRET_KEY` from env. Module-scoped
 * singleton so we don't spin up a new client on every request — the Stripe
 * SDK handles internal connection pooling.
 *
 * Pin the API version explicitly; Stripe ties response shapes to this and
 * leaving it unpinned means random upgrades silently break us.
 */
let _client: Stripe | null = null

export function getStripe(): Stripe {
  if (_client) return _client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY not set — credit purchase flow is offline')
  }
  // Let the SDK default to its pinned API version for this major (v22).
  // Explicit pinning often drifts ahead of the types the SDK ships with,
  // causing TS errors. Rely on the SDK's tested default.
  _client = new Stripe(key, {
    typescript: true,
  })
  return _client
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'
}
