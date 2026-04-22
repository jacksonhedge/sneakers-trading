import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-auth'
import { deriveExpiresAt } from '@/lib/student'

// POST /api/admin/student/review
//
// Body: { id: string, action: 'approve' | 'reject', reason?: string }
// Admin-only — checks the auth user against ADMIN_EMAILS allowlist.
//
// On approve: status='approved', verified_at=now, verified_by=admin email,
//             expires_at=June 30 of the row's grad_year + slack.
// On reject:  status='rejected', verified_at=now, verified_by=admin email,
//             rejection_reason set from the dropdown.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REJECTION_REASONS = new Set([
  'not_a_student',
  'fake_profile',
  'already_graduated',
  'duplicate_submission',
  'other',
])

interface ReviewBody {
  id?: unknown
  action?: unknown
  reason?: unknown
}

export async function POST(req: Request) {
  const authed = await getAuthClient()
  const {
    data: { user },
  } = await authed.auth.getUser()
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!isAdminEmail(user.email)) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as ReviewBody
  const id = typeof body.id === 'string' ? body.id : null
  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null
  if (!id || !action) {
    return Response.json({ error: 'missing_fields', required: ['id', 'action'] }, { status: 400 })
  }

  const admin = getServerClient()
  const { data: row, error: lookupErr } = await admin
    .from('student_verification')
    .select('id, grad_year, status')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr || !row) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  if (action === 'approve') {
    const expires = deriveExpiresAt(row.grad_year as number)
    const { error: upErr } = await admin
      .from('student_verification')
      .update({
        status: 'approved',
        verified_at: new Date().toISOString(),
        verified_by: user.email,
        rejection_reason: null,
        expires_at: expires,
      })
      .eq('id', id)
    if (upErr) {
      console.error('[admin/student/review] approve failed', upErr)
      return Response.json({ error: 'update_failed' }, { status: 500 })
    }
    return Response.json({ ok: true, status: 'approved', expires_at: expires })
  }

  // reject
  const reason = typeof body.reason === 'string' ? body.reason : 'other'
  if (!REJECTION_REASONS.has(reason)) {
    return Response.json(
      { error: 'invalid_reason', allowed: Array.from(REJECTION_REASONS) },
      { status: 400 },
    )
  }
  const { error: rejErr } = await admin
    .from('student_verification')
    .update({
      status: 'rejected',
      verified_at: new Date().toISOString(),
      verified_by: user.email,
      rejection_reason: reason,
      expires_at: null,
    })
    .eq('id', id)
  if (rejErr) {
    console.error('[admin/student/review] reject failed', rejErr)
    return Response.json({ error: 'update_failed' }, { status: 500 })
  }
  return Response.json({ ok: true, status: 'rejected', reason })
}
