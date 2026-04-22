import { getServerClient } from '@/lib/supabase-server'
import { normalizeEmail } from '@/lib/email-validation'
import { findVenue } from '@/lib/venues'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown
    venueId?: unknown
    source?: unknown
  }

  const normalizedEmail = normalizeEmail(body.email)
  if (!normalizedEmail) {
    return Response.json({ error: 'invalid_email' }, { status: 400 })
  }

  const venueId = typeof body.venueId === 'string' ? body.venueId : null
  if (!venueId || !findVenue(venueId)) {
    return Response.json({ error: 'invalid_venue' }, { status: 400 })
  }

  const source = typeof body.source === 'string' ? body.source.slice(0, 64) : null

  const sb = await getServerClient()
  const { error } = await sb
    .from('venue_access_requests')
    .upsert(
      { email: normalizedEmail, venue_id: venueId, source },
      { onConflict: 'email,venue_id', ignoreDuplicates: true }
    )

  if (error) {
    console.error('[venue-access-request] insert failed', error)
    return Response.json({ error: 'insert_failed' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
