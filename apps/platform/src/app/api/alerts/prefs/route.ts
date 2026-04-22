import { getServerClient } from '@/lib/supabase-server'
import { getTierIdentity, TierError } from '@/lib/require-tier'

// GET  /api/alerts/prefs — read this user's delivery preferences (or defaults).
// PUT  /api/alerts/prefs — upsert preferences.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_TZS = new Set([
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Honolulu',
])

const DEFAULTS = {
  email_enabled: true,
  email_digest_mode: false,
  push_enabled: true,
  quiet_hours_start: null as number | null,
  quiet_hours_end: null as number | null,
  quiet_hours_tz: 'America/New_York',
}

export async function GET() {
  let me
  try {
    me = await getTierIdentity()
  } catch (err) {
    if (err instanceof TierError) return err.toResponse()
    throw err
  }
  if (!me.waitlistId) return Response.json(DEFAULTS)

  const sb = getServerClient()
  const { data } = await sb
    .from('alert_delivery_prefs')
    .select('*')
    .eq('user_id', me.waitlistId)
    .maybeSingle()
  return Response.json(data ?? DEFAULTS)
}

export async function PUT(req: Request) {
  let me
  try {
    me = await getTierIdentity()
  } catch (err) {
    if (err instanceof TierError) return err.toResponse()
    throw err
  }
  if (!me.waitlistId) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const update: Record<string, unknown> = { user_id: me.waitlistId }
  if (typeof body.email_enabled === 'boolean') update.email_enabled = body.email_enabled
  if (typeof body.email_digest_mode === 'boolean') update.email_digest_mode = body.email_digest_mode
  if (typeof body.push_enabled === 'boolean') update.push_enabled = body.push_enabled
  if (body.quiet_hours_start === null) update.quiet_hours_start = null
  else if (typeof body.quiet_hours_start === 'number' && body.quiet_hours_start >= 0 && body.quiet_hours_start <= 23) {
    update.quiet_hours_start = Math.floor(body.quiet_hours_start)
  }
  if (body.quiet_hours_end === null) update.quiet_hours_end = null
  else if (typeof body.quiet_hours_end === 'number' && body.quiet_hours_end >= 0 && body.quiet_hours_end <= 23) {
    update.quiet_hours_end = Math.floor(body.quiet_hours_end)
  }
  if (typeof body.quiet_hours_tz === 'string' && ALLOWED_TZS.has(body.quiet_hours_tz)) {
    update.quiet_hours_tz = body.quiet_hours_tz
  }

  const sb = getServerClient()
  const { data, error } = await sb
    .from('alert_delivery_prefs')
    .upsert(update, { onConflict: 'user_id' })
    .select('*')
    .single()
  if (error) {
    return Response.json({ error: 'upsert_failed', message: error.message }, { status: 500 })
  }
  return Response.json(data)
}
