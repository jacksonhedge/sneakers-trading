import { getServerClient } from '@/lib/supabase-server'
import { getTierIdentity, TierError } from '@/lib/require-tier'
import { dispatchFire } from '@/lib/alerts/dispatch'
import type { AlertRule, Channel } from '@/lib/alerts/types'

// POST /api/alerts/test-notification
//
// Body: { channel: 'browser_push' | 'email' }
//
// Sends a synthetic alert to the requested channel so the user can verify
// the delivery pipeline (push permission granted + push subscription
// recorded + email deliverable). Doesn't touch alert_rules or alert_events
// — purely transient.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let me
  try {
    me = await getTierIdentity()
  } catch (err) {
    if (err instanceof TierError) return err.toResponse()
    throw err
  }
  if (!me.waitlistId) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { channel?: unknown }
  const channel = body.channel === 'browser_push' || body.channel === 'email' ? body.channel : null
  if (!channel) {
    return Response.json(
      { error: 'invalid_channel', allowed: ['browser_push', 'email'] },
      { status: 400 },
    )
  }

  const sb = getServerClient()
  const { data: prefsRow } = await sb
    .from('alert_delivery_prefs')
    .select('*')
    .eq('user_id', me.waitlistId)
    .maybeSingle()

  const fakeRule: AlertRule = {
    id: 'test-' + crypto.randomUUID(),
    user_id: me.waitlistId,
    name: 'Test alert',
    description: 'This is a test from /dashboard/alerts/settings.',
    trigger_type: 'price_threshold',
    trigger_config: { direction: 'above', threshold: 0.9 },
    market_filter: { sport: 'basketball' },
    channels: [channel as Channel],
    cooldown_minutes: 60,
    enabled: true,
    last_fired_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const fakeResult = {
    market_key: 'kalshi:test-market',
    trigger_snapshot: {
      kind: 'price_threshold',
      direction: 'above',
      threshold: 0.9,
      current_prob: 0.93,
      prior_prob: 0.86,
      question: 'Will the Knicks win tonight?',
      platform: 'kalshi',
      ts: new Date().toISOString(),
    },
  }

  const result = await dispatchFire(fakeRule, fakeResult, {
    user_id: me.waitlistId,
    email: me.email,
    prefs: {
      email_enabled: prefsRow?.email_enabled ?? true,
      email_digest_mode: prefsRow?.email_digest_mode ?? false,
      push_enabled: prefsRow?.push_enabled ?? true,
      // Bypass quiet hours for test sends — user explicitly clicked the button.
      quiet_hours_start: null,
      quiet_hours_end: null,
      quiet_hours_tz: prefsRow?.quiet_hours_tz ?? 'America/New_York',
    },
  })

  return Response.json({ ok: true, result })
}
