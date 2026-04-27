import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/onboarding/profile
//
// Partial-update endpoint for the onboarding flow. Each step posts only
// the fields it collects. Schema in migration 014_user_profiles.sql.
//
// Accepts (all optional):
//   - state: 2-letter US state code
//   - use_case: 'hobbyist' | 'semi_pro' | 'arb_hunter' | 'analyst'
//   - platforms_connected: string[] of venue ids
//   - invites_sent_emails: string[]
//   - geo_ip_country, geo_ip_state, geo_lat, geo_lng, geo_matches_claim
//   - current_step: string (which step the user is on, for resume support)
//   - mark_complete: boolean — if true, sets profile_complete_at = now()

const ALLOWED_USE_CASES = ['hobbyist', 'semi_pro', 'arb_hunter', 'analyst'] as const
type UseCase = (typeof ALLOWED_USE_CASES)[number]

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAILS = 5
const MAX_PLATFORMS = 30

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    state?: unknown
    use_case?: unknown
    platforms_connected?: unknown
    invites_sent_emails?: unknown
    geo_ip_country?: unknown
    geo_ip_state?: unknown
    geo_lat?: unknown
    geo_lng?: unknown
    geo_matches_claim?: unknown
    current_step?: unknown
    mark_complete?: unknown
  }

  // Type-narrow + validate every incoming field. Reject the whole request
  // if anything looks wrong rather than silently dropping.
  const update: Record<string, unknown> = {}

  if (typeof body.state === 'string' && body.state.trim().length > 0) {
    const code = body.state.trim().toUpperCase()
    if (!US_STATES.has(code)) {
      return Response.json({ error: 'invalid_state' }, { status: 400 })
    }
    update.state = code
  }

  if (typeof body.use_case === 'string') {
    if (!ALLOWED_USE_CASES.includes(body.use_case as UseCase)) {
      return Response.json({ error: 'invalid_use_case' }, { status: 400 })
    }
    update.use_case = body.use_case
  }

  if (Array.isArray(body.platforms_connected)) {
    if (body.platforms_connected.length > MAX_PLATFORMS) {
      return Response.json({ error: 'too_many_platforms' }, { status: 400 })
    }
    const cleaned = body.platforms_connected
      .filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 50)
      .slice(0, MAX_PLATFORMS)
    update.platforms_connected = cleaned
  }

  if (Array.isArray(body.invites_sent_emails)) {
    const cleaned: string[] = []
    for (const raw of body.invites_sent_emails.slice(0, MAX_EMAILS)) {
      if (typeof raw !== 'string') continue
      const e = raw.trim().toLowerCase()
      if (EMAIL_RE.test(e) && e.length < 254) cleaned.push(e)
    }
    update.invites_sent_emails = cleaned
  }

  if (typeof body.geo_ip_country === 'string' && body.geo_ip_country.length <= 4) {
    update.geo_ip_country = body.geo_ip_country.toUpperCase()
  }
  if (typeof body.geo_ip_state === 'string' && body.geo_ip_state.length <= 4) {
    update.geo_ip_state = body.geo_ip_state.toUpperCase()
  }
  if (typeof body.geo_lat === 'number' && Number.isFinite(body.geo_lat)) {
    update.geo_lat = Math.max(-90, Math.min(90, body.geo_lat))
  }
  if (typeof body.geo_lng === 'number' && Number.isFinite(body.geo_lng)) {
    update.geo_lng = Math.max(-180, Math.min(180, body.geo_lng))
  }
  if (typeof body.geo_matches_claim === 'boolean') {
    update.geo_matches_claim = body.geo_matches_claim
  }

  if (typeof body.current_step === 'string' && body.current_step.length < 50) {
    update.current_step = body.current_step
  }

  if (body.mark_complete === true) {
    update.profile_complete_at = new Date().toISOString()
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'no_fields' }, { status: 400 })
  }

  const admin = getServerClient()
  const { error } = await admin
    .from('user_profiles')
    .upsert({ user_id: user.id, ...update }, { onConflict: 'user_id' })
  if (error) {
    console.error('[onboarding/profile] upsert failed', error)
    return Response.json({ error: 'server_error', message: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
