import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// GET  /api/otoole/autotrade-settings  → current per-trade cap, daily
//                                        cap, kill-switch state.
// POST /api/otoole/autotrade-settings  → upsert any subset of those.
//
// Driven by the QuickActions chip row above the OToole prompt input.
// Kill-switch toggle remains its own dedicated endpoint
// (/api/otoole/kill-switch) because activating it also cancels every
// pending trade_drafts row — that's separate from the simple
// caps-update path.

export const dynamic = 'force-dynamic'

const PER_TRADE_MAX = 5_000
const DAILY_MAX = 25_000
const PER_TRADE_DEFAULT = 50
const DAILY_DEFAULT = 200

export async function GET() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }
  const admin = getServerClient()
  const { data } = await admin
    .from('autotrade_settings')
    .select('per_trade_cap_usd, daily_cap_usd, kill_switch_active, kill_switch_reason')
    .eq('user_id', user.id)
    .maybeSingle()
  return NextResponse.json({
    ok: true,
    perTradeCapUsd: Number(data?.per_trade_cap_usd ?? PER_TRADE_DEFAULT),
    dailyCapUsd: Number(data?.daily_cap_usd ?? DAILY_DEFAULT),
    killSwitchActive: Boolean(data?.kill_switch_active),
    killSwitchReason: (data?.kill_switch_reason as string | null) ?? null,
  })
}

export async function POST(req: Request) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as {
    perTradeCapUsd?: unknown
    dailyCapUsd?: unknown
  }
  const updates: Record<string, number> = {}
  if (typeof body.perTradeCapUsd === 'number') {
    if (body.perTradeCapUsd <= 0 || body.perTradeCapUsd > PER_TRADE_MAX) {
      return NextResponse.json(
        { ok: false, error: 'invalid', message: `per-trade cap must be in (0, $${PER_TRADE_MAX}]` },
        { status: 400 },
      )
    }
    updates.per_trade_cap_usd = body.perTradeCapUsd
  }
  if (typeof body.dailyCapUsd === 'number') {
    if (body.dailyCapUsd <= 0 || body.dailyCapUsd > DAILY_MAX) {
      return NextResponse.json(
        { ok: false, error: 'invalid', message: `daily cap must be in (0, $${DAILY_MAX}]` },
        { status: 400 },
      )
    }
    updates.daily_cap_usd = body.dailyCapUsd
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { ok: false, error: 'nothing_to_update' },
      { status: 400 },
    )
  }

  const admin = getServerClient()
  const { error } = await admin
    .from('autotrade_settings')
    .upsert(
      {
        user_id: user.id,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, updated: updates })
}
