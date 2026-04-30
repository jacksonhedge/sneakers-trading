import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-auth'

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
  const { error } = await admin
    .from('waitlist')
    .update({
      invite_used_at: action === 'approve' ? new Date().toISOString() : null,
    })
    .eq('id', id)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  // Bust the admin/users page cache so the row state flips immediately
  // when the page re-renders (force-dynamic re-runs the query, but this
  // also invalidates any client-cached chunks).
  revalidatePath('/admin/users')
  revalidatePath('/users')
  return NextResponse.json({ ok: true, action })
}
