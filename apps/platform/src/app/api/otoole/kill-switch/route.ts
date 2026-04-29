import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/otoole/kill-switch
//
// Body: { active: boolean, reason?: string }
//
// Toggles autotrade_settings.kill_switch_active for the current user.
// When activating: also cancels every pending trade_drafts row owned
// by this user, so no in-flight proposal can fire after the user has
// pressed the big red button.
//
// Idempotent — calling with active=true twice in a row is fine.

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    active?: unknown
    reason?: unknown
  }
  const active = body.active === true
  const reason =
    typeof body.reason === 'string' ? body.reason.slice(0, 200) : null

  const admin = getServerClient()
  const now = new Date().toISOString()

  // Upsert by user_id; default caps stay at table-default if this is
  // the first row for the user.
  const { error: settingsErr } = await admin
    .from('autotrade_settings')
    .upsert(
      {
        user_id: user.id,
        kill_switch_active: active,
        kill_switch_reason: active ? reason : null,
        kill_switch_at: active ? now : null,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    )
  if (settingsErr) {
    return NextResponse.json(
      { ok: false, error: settingsErr.message },
      { status: 500 },
    )
  }

  let cancelledDrafts = 0
  if (active) {
    const { data: waitlistRow } = await admin
      .from('waitlist')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .maybeSingle()
    if (waitlistRow?.id) {
      const { data: cancelled } = await admin
        .from('trade_drafts')
        .update({ status: 'cancelled', resolved_at: now })
        .eq('user_id', waitlistRow.id as string)
        .eq('status', 'pending')
        .select('id')
      cancelledDrafts = cancelled?.length ?? 0
    }
  }

  return NextResponse.json({
    ok: true,
    killSwitchActive: active,
    cancelledDrafts,
  })
}
