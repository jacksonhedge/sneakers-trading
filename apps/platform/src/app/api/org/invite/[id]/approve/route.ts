import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { isCaptainOf } from '@/lib/org-captain'

// POST /api/org/invite/:id/approve
//
// Captain-only. Promotes a `pending` invitation to `accepted`. Pending rows
// are created when somebody hits the public /join/[orgId] link and submits
// their email — we don't auto-add them to the roster (that would let any
// anonymous caller poison any org's roster by spraying random emails at the
// joinOrgId param). Captain reviews and clicks approve.
//
// No-op (returns ok: true) if the invitation is already accepted, so the
// button is safe to double-click.

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sb = await getAuthClient()
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser()
  if (authErr || !user || !user.email) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id || typeof id !== 'string') {
    return Response.json({ error: 'invalid_id' }, { status: 400 })
  }

  const admin = getServerClient()

  const { data: row } = await admin
    .from('organization_member_invitations')
    .select('id, org_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!row) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  // Caller must own the org that owns this invitation.
  if (!(await isCaptainOf(admin, row.org_id, { id: user.id, email: user.email }))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  if (row.status === 'accepted') {
    return Response.json({ ok: true })
  }
  if (row.status !== 'pending') {
    return Response.json(
      { error: 'invalid_state', detail: `Cannot approve from status=${row.status}` },
      { status: 400 },
    )
  }

  const { error: upErr } = await admin
    .from('organization_member_invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', id)
  if (upErr) {
    console.error('[org/invite/:id/approve] update failed', upErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
