import { getServerClient } from '@/lib/supabase-server'
import { loadUserCredentials } from './credentials'
import { placeMarketOrder, resolveTokenIds } from './polymarket'
import { runRiskGates, type DraftForGates, type GateVerdict } from './risk-gates'
import { openPosition } from './positions'

// Co-pilot execute orchestrator. Takes a trade_drafts row id, runs the
// 5 gates, and — if all pass — places the order on Polymarket via the
// existing manual-trade layer. Always writes a trade_executions audit
// row, whether the trade fired or got rejected at a gate. Idempotent
// per draft: a draft already in 'confirmed' state returns the existing
// execution.

export type ExecuteResult =
  | {
      ok: true
      executionId: number
      orderId: string
      verdicts: GateVerdict[]
    }
  | {
      ok: false
      reason: string
      verdicts: GateVerdict[]
      executionId?: number
    }

interface DraftRow {
  id: string
  user_id: string
  platform: string
  platform_market_id: string
  outcome_name: string
  side: 'buy' | 'sell'
  size_usd: number
  max_price: number
  status: string
  take_profit_price: number | string | null
  stop_loss_price: number | string | null
}

export async function executeCopilotDraft(
  draftId: string,
  authUserId: string,
  waitlistId: string,
): Promise<ExecuteResult> {
  const admin = getServerClient()

  // ── Load draft + verify ownership ────────────────────────────────────
  const { data: draft, error: draftErr } = await admin
    .from('trade_drafts')
    .select(
      'id, user_id, platform, platform_market_id, outcome_name, side, size_usd, max_price, status, take_profit_price, stop_loss_price',
    )
    .eq('id', draftId)
    .maybeSingle<DraftRow>()
  if (draftErr || !draft) {
    return {
      ok: false,
      reason: `Draft ${draftId} not found.`,
      verdicts: [],
    }
  }
  if (draft.user_id !== waitlistId) {
    return {
      ok: false,
      reason: 'Draft does not belong to this user.',
      verdicts: [],
    }
  }
  if (draft.status === 'cancelled' || draft.status === 'expired') {
    return {
      ok: false,
      reason: `Draft already ${draft.status}.`,
      verdicts: [],
    }
  }
  if (draft.status === 'confirmed') {
    return {
      ok: false,
      reason: 'Draft already confirmed; no double-execute.',
      verdicts: [],
    }
  }

  // ── Run 5 gates ──────────────────────────────────────────────────────
  const draftForGates: DraftForGates = {
    user_id: waitlistId,
    auth_user_id: authUserId,
    platform: draft.platform,
    platform_market_id: draft.platform_market_id,
    outcome_name: draft.outcome_name,
    side: draft.side,
    size_usd: Number(draft.size_usd),
    max_price: Number(draft.max_price),
  }
  const gateResult = await runRiskGates(draftForGates)

  if (!gateResult.allPassed) {
    // Record the rejection in trade_executions for the audit trail.
    const failed = gateResult.verdicts.find((v) => !v.pass)
    const reason = failed && !failed.pass ? failed.reason : 'unknown gate failure'
    const { data: rejected } = await admin
      .from('trade_executions')
      .insert({
        user_id: authUserId,
        venue: draft.platform,
        market_id: draft.platform_market_id,
        side: draft.side,
        outcome: draft.outcome_name,
        size_usd: draft.size_usd,
        order_type: 'market',
        source: 'auto',
        status: 'rejected',
        error_message: reason,
        venue_response: { gate_verdicts: gateResult.verdicts, draft_id: draftId },
      })
      .select('id')
      .single()
    return {
      ok: false,
      reason,
      verdicts: gateResult.verdicts,
      executionId: rejected?.id,
    }
  }

  // ── Place the order ──────────────────────────────────────────────────
  const creds = await loadUserCredentials(authUserId, 'polymarket')
  if (!creds) {
    return {
      ok: false,
      reason: 'Credentials disappeared between gate check and execute.',
      verdicts: gateResult.verdicts,
    }
  }
  let tokenIds: { yesTokenId: string; noTokenId: string }
  try {
    tokenIds = await resolveTokenIds(draft.platform_market_id)
  } catch (err) {
    return {
      ok: false,
      reason: `Could not resolve Polymarket token id: ${(err as Error).message}`,
      verdicts: gateResult.verdicts,
    }
  }
  const isYes = /^yes/i.test(draft.outcome_name)
  const tokenId = isYes ? tokenIds.yesTokenId : tokenIds.noTokenId

  // Insert pending audit row first so we have an id to attach the
  // venue response to even if placeMarketOrder throws.
  const { data: pending, error: pendingErr } = await admin
    .from('trade_executions')
    .insert({
      user_id: authUserId,
      venue: 'polymarket',
      market_id: draft.platform_market_id,
      side: draft.side,
      outcome: draft.outcome_name,
      size_usd: draft.size_usd,
      order_type: 'market',
      source: 'auto',
      status: 'pending',
      venue_response: { gate_verdicts: gateResult.verdicts, draft_id: draftId },
    })
    .select('id')
    .single()
  if (pendingErr || !pending) {
    return {
      ok: false,
      reason: `Could not create execution record: ${pendingErr?.message ?? 'unknown'}`,
      verdicts: gateResult.verdicts,
    }
  }

  let orderId: string
  let raw: unknown
  try {
    const result = await placeMarketOrder(creds, {
      tokenId,
      side: draft.side === 'buy' ? 'BUY' : 'SELL',
      sizeUsd: Number(draft.size_usd),
    })
    orderId = result.orderId
    raw = result.raw
  } catch (err) {
    await admin
      .from('trade_executions')
      .update({
        status: 'error',
        error_message: (err as Error).message,
      })
      .eq('id', pending.id)
    return {
      ok: false,
      reason: `Polymarket rejected order: ${(err as Error).message}`,
      verdicts: gateResult.verdicts,
      executionId: pending.id,
    }
  }

  // Mark execution filled (Polymarket market orders fill at submission
  // or revert; the SDK throws on revert) and flip the draft to confirmed.
  await admin
    .from('trade_executions')
    .update({
      status: 'filled',
      venue_order_id: orderId,
      venue_response: { gate_verdicts: gateResult.verdicts, draft_id: draftId, raw },
      filled_at: new Date().toISOString(),
    })
    .eq('id', pending.id)

  await admin
    .from('trade_drafts')
    .update({
      status: 'confirmed',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', draftId)

  // ── Open autotrade position (TP/SL watcher input) ────────────────────
  // Only on buys, and only when at least one threshold is set. Failure
  // here is non-fatal — the buy already filled, the user just won't
  // get the auto-sell. Errors logged for diagnosis.
  const tp = numOrNull(draft.take_profit_price)
  const sl = numOrNull(draft.stop_loss_price)
  if (draft.side === 'buy' && (tp != null || sl != null)) {
    const entryPrice = Number(draft.max_price)
    const sizeShares = entryPrice > 0 ? Number(draft.size_usd) / entryPrice : 0
    if (sizeShares > 0) {
      const opened = await openPosition({
        user_id: waitlistId,
        entry_execution_id: pending.id,
        platform_market_id: draft.platform_market_id,
        outcome_name: draft.outcome_name,
        token_id: tokenId,
        side: isYes ? 'YES' : 'NO',
        size_shares: sizeShares,
        entry_price: entryPrice,
        take_profit_price: tp,
        stop_loss_price: sl,
      })
      if (!opened.ok) {
        console.error(
          '[copilot-execute] openPosition failed (buy still filled)',
          { draftId, executionId: pending.id, error: opened.error },
        )
      }
    }
  }

  return {
    ok: true,
    executionId: pending.id,
    orderId,
    verdicts: gateResult.verdicts,
  }
}

function numOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}
