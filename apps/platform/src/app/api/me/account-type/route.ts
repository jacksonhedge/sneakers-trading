import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/me/account-type
//
// Body: { type: 'individual' | 'business' }
//
// Flips the authenticated user's waitlist.account_type. Required for users
// who want to subscribe to Business or Fraternity plans — the checkout
// helper rejects the priceId if account_type doesn't match the flavor.
//
// Safe to call repeatedly (idempotent). Does NOT unwind an existing
// subscription — if a user with an active Business subscription flips back
// to individual, they still pay for the business plan until they cancel via
// Stripe Portal. That's intentional; the switch is a billing gate, not a
// billing action.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_TYPES = new Set(['individual', 'business'])

export async function POST(req: Request) {
  const authed = await getAuthClient()
  const {
    data: { user },
  } = await authed.auth.getUser()
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { type?: unknown }
  const type = typeof body.type === 'string' ? body.type : null
  if (!type || !VALID_TYPES.has(type)) {
    return Response.json(
      { error: 'invalid_type', allowed: [...VALID_TYPES] },
      { status: 400 },
    )
  }

  const admin = getServerClient()
  const { error } = await admin
    .from('waitlist')
    .update({ account_type: type })
    .eq('email', user.email.toLowerCase())

  if (error) {
    console.error('[me/account-type] update failed', error)
    return Response.json({ error: 'update_failed' }, { status: 500 })
  }

  return Response.json({ ok: true, account_type: type })
}
