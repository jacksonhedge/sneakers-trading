import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-auth'
import { sendApprovedEmail } from '@/lib/email'

// POST /api/admin/approve-user
//
// Body: { id: string, action: 'approve' | 'revoke' }
//
// Admin-only — gated by the same isAdminEmail allowlist that protects
// /admin/*. Approve sets waitlist.invite_used_at to now() so the user
// can hit /dashboard. Revoke nulls it out — useful for kicking a user
// back to /pending without deleting their data.

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown }
  const id = typeof body.id === 'string' ? body.id : null
  const action = body.action === 'revoke' ? 'revoke' : 'approve'
  if (!id) {
    return NextResponse.json(
      { ok: false, error: 'missing_id' },
      { status: 400 },
    )
  }

  const admin = getServerClient()
  const { data: row, error } = await admin
    .from('waitlist')
    .update({
      invite_used_at: action === 'approve' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select('email')
    .maybeSingle()
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Email the user on approve so they don't have to randomly check back.
  // Best-effort — the approval itself already succeeded; an email failure
  // shouldn't fail the request. Caller will see emailed:false in the
  // response if Resend errored.
  let emailed = false
  let emailError: string | null = null
  if (action === 'approve' && row?.email) {
    try {
      await sendApprovedEmail({ to: row.email })
      emailed = true
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e)
      console.warn('[approve-user] email send failed:', emailError)
    }
  }

  // Bust the admin/users page cache so the row state flips immediately
  // when the page re-renders (force-dynamic re-runs the query, but this
  // also invalidates any client-cached chunks).
  revalidatePath('/admin/users')
  revalidatePath('/users')
  return NextResponse.json({ ok: true, action, emailed, emailError })
}
