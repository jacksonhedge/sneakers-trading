import { getAuthClient } from '@/lib/supabase-auth'
import { loadMemory, saveMemory } from '@/lib/otoole-memory'
import {
  isRiskBandId,
  isStrategyStyleId,
  mergeEdgeBlock,
} from '@/lib/onboarding-edge'

// POST /api/onboarding/edge
//
// The "Your edge" onboarding step. Takes the student's risk-band and
// strategy-style picks and merges them into their O'Toole memory — so
// finishing the step actually tunes the AI, rather than just recording a
// preference. Non-destructive: a prior edge block is replaced in place,
// anything the user wrote themselves is preserved.
//
// Accepts:
//   - risk_band: RiskBandId
//   - strategy_style: StrategyStyleId

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    risk_band?: unknown
    strategy_style?: unknown
  }

  if (!isRiskBandId(body.risk_band)) {
    return Response.json({ error: 'invalid_risk_band' }, { status: 400 })
  }
  if (!isStrategyStyleId(body.strategy_style)) {
    return Response.json({ error: 'invalid_strategy_style' }, { status: 400 })
  }

  console.log(
    `[onboarding/edge] tuning O'Toole for ${user.id}: risk=${body.risk_band} style=${body.strategy_style}`,
  )

  try {
    const existing = await loadMemory(user.id)
    const merged = mergeEdgeBlock(existing, body.risk_band, body.strategy_style)
    await saveMemory(user.id, merged)
  } catch (err) {
    console.error('[onboarding/edge] failed to tune O\'Toole memory', err)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  console.log(`[onboarding/edge] O'Toole memory updated for ${user.id}`)
  return Response.json({ ok: true })
}
