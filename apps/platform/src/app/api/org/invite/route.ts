import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/org/invite
// Body: { emails: string[] }
//
// Captain-only. Adds emails to organization_member_invitations for the
// captain's org. Idempotent — re-posting the same email is a no-op.
//
// Email-send happens later via cron + Resend (when domain is verified).
// This endpoint just queues the invitations as status='pending'.

const EMAIL_RE = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const MAX_BATCH = 200

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser()
  if (authErr || !user || !user.email) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { emails?: unknown }
  if (!Array.isArray(body.emails)) {
    return Response.json({ error: 'invalid_body', detail: 'emails: string[]' }, { status: 400 })
  }
  if (body.emails.length > MAX_BATCH) {
    return Response.json(
      { error: 'too_many', detail: `Max ${MAX_BATCH} per batch.` },
      { status: 400 },
    )
  }

  // Validate + normalize the email list. Drop garbage, lowercase, dedupe.
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const raw of body.emails) {
    if (typeof raw !== 'string') continue
    const e = raw.trim().toLowerCase()
    if (!EMAIL_RE.test(e)) continue
    if (seen.has(e)) continue
    seen.add(e)
    cleaned.push(e)
  }
  if (cleaned.length === 0) {
    return Response.json({ error: 'no_valid_emails' }, { status: 400 })
  }

  // Look up the captain's org by email match. First match wins — if the
  // user has multiple orgs (shouldn't happen at MVP scale) we'd need a
  // disambiguator query param.
  const admin = getServerClient()
  const { data: org, error: orgErr } = await admin
    .from('organization_signups')
    .select('id')
    .eq('org_leader_email', user.email.toLowerCase())
    .maybeSingle()
  if (orgErr) {
    console.error('[org/invite] org lookup failed', orgErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
  if (!org) {
    return Response.json(
      { error: 'not_a_captain', detail: 'No organization found for this account.' },
      { status: 403 },
    )
  }

  // Bulk upsert. The unique (org_id, invited_email) constraint makes
  // re-runs safe — already-pending invitees keep their original timestamp.
  const rows = cleaned.map((email) => ({
    org_id: org.id,
    invited_email: email,
    invited_by: user.id,
    status: 'pending',
  }))
  const { error: upErr } = await admin
    .from('organization_member_invitations')
    .upsert(rows, { onConflict: 'org_id,invited_email', ignoreDuplicates: true })
  if (upErr) {
    console.error('[org/invite] upsert failed', upErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true, queued: cleaned.length })
}
