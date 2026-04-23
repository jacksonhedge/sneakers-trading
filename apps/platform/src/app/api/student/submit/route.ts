import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import {
  isLinkedInUrl,
  normalizeInstagramHandle,
} from '@/lib/student'
import { categorizeEduEmail } from '@/lib/student/edu-domains'

// POST /api/student/submit
//
// Auth-gated. Validates inputs and upserts a student_verification row with
// status='pending'. Re-submission (e.g. after rejection or expires_at lapse)
// reuses the same row via the unique waitlist_user_id constraint.
//
// Validation:
//   - edu_email must be a valid .edu address (any subdomain). Foreign .edu.xx
//     addresses are rejected. Unknown US .edu domains are accepted but
//     flagged for manual admin review (not auto-approved).
//   - instagram_handle is normalized to lowercase, no @, [a-z0-9._]{1,30}.
//   - linkedin_url must look like a LinkedIn profile URL.
//   - grad_year must be plausible (within ±10 years of now).
//
// Bulk-fraud signal: more than 5 submissions in the last 24h from the same
// university domain auto-flags the row's status to 'pending' but logs a
// warning (the API still succeeds — admin sees the cluster on the queue
// page and can act).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BULK_FLAG_WINDOW_HOURS = 24
const BULK_FLAG_THRESHOLD = 5

interface SubmitBody {
  edu_email?: unknown
  instagram_handle?: unknown
  linkedin_url?: unknown
  grad_year?: unknown
}

export async function POST(req: Request) {
  const authed = await getAuthClient()
  const {
    data: { user },
  } = await authed.auth.getUser()
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as SubmitBody
  const eduEmailRaw = typeof body.edu_email === 'string' ? body.edu_email : null
  const instaRaw = typeof body.instagram_handle === 'string' ? body.instagram_handle : null
  const liRaw = typeof body.linkedin_url === 'string' ? body.linkedin_url : null
  const gradYearRaw =
    typeof body.grad_year === 'number'
      ? body.grad_year
      : typeof body.grad_year === 'string'
        ? parseInt(body.grad_year, 10)
        : null

  if (!eduEmailRaw || !instaRaw || !liRaw || gradYearRaw == null) {
    return Response.json(
      {
        error: 'missing_fields',
        required: ['edu_email', 'instagram_handle', 'linkedin_url', 'grad_year'],
      },
      { status: 400 },
    )
  }

  // Length caps applied BEFORE domain categorization to bound the regex work
  // and prevent oversized strings from reaching the DB. RFC 5321 caps email
  // at 320 chars; 500 matches isLinkedInUrl's own cap; 100 is well above
  // Instagram's 30-char real limit but blocks 10KB payloads.
  if (eduEmailRaw.length > 320) {
    return Response.json(
      { error: 'invalid_edu_email', message: 'Email is too long.' },
      { status: 400 },
    )
  }
  if (instaRaw.length > 100) {
    return Response.json(
      { error: 'invalid_instagram', message: 'Instagram handle is too long.' },
      { status: 400 },
    )
  }
  if (liRaw.length > 500) {
    return Response.json(
      { error: 'invalid_linkedin', message: 'LinkedIn URL is too long.' },
      { status: 400 },
    )
  }

  const edu = categorizeEduEmail(eduEmailRaw)
  if (edu.category === 'invalid' || edu.category === 'not_edu') {
    return Response.json(
      { error: 'edu_email_required', message: 'Submit a valid .edu email address.' },
      { status: 400 },
    )
  }

  const instagramHandle = normalizeInstagramHandle(instaRaw)
  if (!instagramHandle) {
    return Response.json(
      { error: 'invalid_instagram', message: 'Use letters, numbers, periods, or underscores.' },
      { status: 400 },
    )
  }

  if (!isLinkedInUrl(liRaw)) {
    return Response.json(
      { error: 'invalid_linkedin', message: 'Paste a full LinkedIn profile URL.' },
      { status: 400 },
    )
  }

  const nowYear = new Date().getUTCFullYear()
  if (
    !Number.isFinite(gradYearRaw) ||
    gradYearRaw < nowYear - 10 ||
    gradYearRaw > nowYear + 10
  ) {
    return Response.json(
      { error: 'invalid_grad_year', message: `Graduation year must be near ${nowYear}.` },
      { status: 400 },
    )
  }

  // Resolve the waitlist row. Submission requires the user to be on the waitlist
  // (which they always are if they've authenticated via magic link).
  const admin = getServerClient()
  const { data: waitlistRow, error: waitlistErr } = await admin
    .from('waitlist')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()
  if (waitlistErr || !waitlistRow) {
    return Response.json(
      { error: 'no_waitlist_row', message: 'Your account is not on the waitlist.' },
      { status: 404 },
    )
  }
  const waitlistUserId = waitlistRow.id as string

  // Bulk-fraud check — log only, don't block. Admin sees the cluster.
  if (edu.domain) {
    const since = new Date(Date.now() - BULK_FLAG_WINDOW_HOURS * 3600 * 1000).toISOString()
    const { count } = await admin
      .from('student_verification')
      .select('id', { head: true, count: 'exact' })
      .eq('university_domain', edu.domain)
      .gte('submitted_at', since)
    if (typeof count === 'number' && count >= BULK_FLAG_THRESHOLD) {
      console.warn(
        `[student/submit] bulk-flag: ${count} submissions from ${edu.domain} in last ${BULK_FLAG_WINDOW_HOURS}h`,
      )
    }
  }

  const { data: upserted, error: upErr } = await admin
    .from('student_verification')
    .upsert(
      {
        waitlist_user_id: waitlistUserId,
        edu_email: eduEmailRaw.trim().toLowerCase(),
        instagram_handle: instagramHandle,
        linkedin_url: liRaw.trim(),
        university_name: edu.university?.name ?? null,
        university_domain: edu.domain,
        grad_year: gradYearRaw,
        status: 'pending',
        // Reset admin-set fields on re-submission.
        verified_at: null,
        verified_by: null,
        rejection_reason: null,
        expires_at: null,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'waitlist_user_id' },
    )
    .select('id, status')
    .maybeSingle()
  if (upErr) {
    console.error('[student/submit] upsert failed', upErr)
    return Response.json({ error: 'upsert_failed' }, { status: 500 })
  }

  return Response.json({
    ok: true,
    id: upserted?.id,
    status: upserted?.status,
    flaggedDomain: edu.category === 'unknown_edu',
  })
}
