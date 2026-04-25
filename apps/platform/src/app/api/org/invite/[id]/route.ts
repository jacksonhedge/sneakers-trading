import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// DELETE /api/org/invite/:id
// Captain-only. Revokes a pending invitation (sets status='revoked').
// Doesn't delete the row — preserves audit trail.

export async function DELETE(
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

  // Caller must own the org that owns this invitation.
  const { data: row } = await admin
    .from('organization_member_invitations')
    .select('id, org_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!row) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  const { data: org } = await admin
    .from('organization_signups')
    .select('id')
    .eq('id', row.org_id)
    .eq('org_leader_email', user.email.toLowerCase())
    .maybeSingle()
  if (!org) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  if (row.status === 'accepted') {
    return Response.json(
      { error: 'cannot_revoke_accepted', detail: 'Use member-removal instead.' },
      { status: 400 },
    )
  }

  const { error: upErr } = await admin
    .from('organization_member_invitations')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (upErr) {
    console.error('[org/invite/:id] revoke failed', upErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
