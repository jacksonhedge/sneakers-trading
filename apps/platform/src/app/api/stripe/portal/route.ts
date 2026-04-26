import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { createPortalSession } from '@/lib/stripe-portal'

// POST /api/stripe/portal
//
// Auth-gated. Looks up the user's stripe_customer_id and creates a Customer
// Portal session. Returns { url }; client redirects.
//
// 404s if the user has no Stripe customer yet — meaning they've never started
// a Checkout flow. The UI should hide the "Manage subscription" button in
// that case rather than calling this and showing an error.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request) {
  const authed = await getAuthClient()
  const {
    data: { user },
  } = await authed.auth.getUser()
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const admin = getServerClient()
  const { data: row, error } = await admin
    .from('waitlist')
    .select('stripe_customer_id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()
  if (error || !row) {
    return Response.json({ error: 'waitlist_lookup_failed', detail: error?.message }, { status: 500 })
  }
  if (!row.stripe_customer_id) {
    return Response.json({ error: 'no_stripe_customer' }, { status: 404 })
  }

  const result = await createPortalSession(row.stripe_customer_id)
  if (!result.ok) {
    const status = result.code === 'stripe_not_configured' ? 503 : 500
    return Response.json({ error: result.code, message: result.message }, { status })
  }
  return Response.json({ url: result.url })
}
