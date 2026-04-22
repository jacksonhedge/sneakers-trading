import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/enterprise/inquiry
//
// Public endpoint — works whether or not the user is signed in. The /pricing
// page lets prospects fill the Contact-Sales form without an account, and
// /dashboard/billing lets logged-in users do the same with their waitlist row
// pre-linked. NOT a Stripe flow; the row is hand-quoted by sales.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface InquiryBody {
  contact_name?: unknown
  contact_email?: unknown
  company_name?: unknown
  phone?: unknown
  use_case?: unknown
  volume_estimate?: unknown
  referral_source?: unknown
}

function pickString(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as InquiryBody

  const contactName = pickString(body.contact_name, 200)
  const contactEmail = pickString(body.contact_email, 320)
  if (!contactName || !contactEmail) {
    return Response.json(
      { error: 'missing_fields', required: ['contact_name', 'contact_email'] },
      { status: 400 },
    )
  }
  // Cheap email shape check — Stripe-grade RFC validation isn't needed; sales
  // eyeballs the rows before reaching out.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 })
  }

  // Try to attach the user's waitlist row when they're signed in. Failing
  // softly: a public-page submission still succeeds with waitlist_user_id null.
  let waitlistUserId: string | null = null
  try {
    const authed = await getAuthClient()
    const {
      data: { user },
    } = await authed.auth.getUser()
    if (user?.email) {
      const admin = getServerClient()
      const { data: row } = await admin
        .from('waitlist')
        .select('id')
        .eq('email', user.email.toLowerCase())
        .maybeSingle()
      waitlistUserId = (row?.id as string | undefined) ?? null
    }
  } catch {
    // unauthenticated — fall through with waitlistUserId = null
  }

  const sb = getServerClient()
  const { data: inserted, error } = await sb
    .from('enterprise_inquiries')
    .insert({
      waitlist_user_id: waitlistUserId,
      contact_name: contactName,
      contact_email: contactEmail.toLowerCase(),
      company_name: pickString(body.company_name, 200),
      phone: pickString(body.phone, 50),
      use_case: pickString(body.use_case, 4000),
      volume_estimate: pickString(body.volume_estimate, 500),
      referral_source: pickString(body.referral_source, 200),
    })
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[enterprise-inquiry] insert failed', error)
    return Response.json({ error: 'insert_failed' }, { status: 500 })
  }

  return Response.json({ ok: true, id: inserted?.id })
}
