import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { executeCopilotDraft } from '@/lib/autotrade/copilot-execute'

// POST /api/otoole/execute-trade
//
// Body: { draftId: string }
//
// Confirms a pending O'Toole trade_drafts row. Runs the 5 risk gates,
// resolves Polymarket token id, places the order via the manual-trade
// layer, writes a trade_executions audit row, and flips the draft to
// 'confirmed'. Idempotent — already-confirmed/cancelled drafts return
// 4xx without re-firing.
//
// Returns: { ok, executionId?, orderId?, verdicts, reason? }

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { draftId?: unknown }
  const draftId = typeof body.draftId === 'string' ? body.draftId : null
  if (!draftId) {
    return NextResponse.json({ ok: false, error: 'draftId required' }, { status: 400 })
  }

  // Map auth user → waitlist row so we can verify ownership of the draft
  // (drafts are keyed by waitlist.id, not auth.users.id).
  const admin = getServerClient()
  const { data: waitlistRow } = await admin
    .from('waitlist')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()
  if (!waitlistRow?.id) {
    return NextResponse.json({ ok: false, error: 'no waitlist row' }, { status: 403 })
  }

  const result = await executeCopilotDraft(draftId, user.id, waitlistRow.id as string)

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
        verdicts: result.verdicts,
        executionId: result.executionId,
      },
      { status: 400 },
    )
  }

  return NextResponse.json({
    ok: true,
    executionId: result.executionId,
    orderId: result.orderId,
    verdicts: result.verdicts,
  })
}
