import { getServerClient } from '@/lib/supabase-server'

// Autotrade-position CRUD. Created when a copilot buy fills (or imported
// manually). The watcher in apps/trader polls Polymarket and calls
// closePosition() when TP/SL crosses.

export type AutotradeSide = 'YES' | 'NO'
export type AutotradeStatus = 'open' | 'closing' | 'closed' | 'cancelled' | 'errored'
export type AutotradeCloseReason = 'tp_hit' | 'sl_hit' | 'manual' | 'expired' | 'error'

export interface AutotradePosition {
  id: string
  user_id: string
  entry_execution_id: number | null
  venue: 'polymarket'
  platform_market_id: string
  outcome_name: string
  token_id: string
  side: AutotradeSide
  size_shares: number
  entry_price: number
  take_profit_price: number | null
  stop_loss_price: number | null
  status: AutotradeStatus
  close_reason: AutotradeCloseReason | null
  close_price: number | null
  close_execution_id: number | null
  close_error: string | null
  last_checked_at: string | null
  last_observed_price: number | null
  opened_at: string
  updated_at: string
  closed_at: string | null
}

export interface OpenPositionInput {
  user_id: string  // waitlist.id
  entry_execution_id?: number | null
  platform_market_id: string
  outcome_name: string
  token_id: string
  side: AutotradeSide
  size_shares: number
  entry_price: number
  take_profit_price?: number | null
  stop_loss_price?: number | null
}

function num(v: number | string | null | undefined): number {
  if (v == null) return NaN
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : NaN
}

function rowToPosition(r: Record<string, unknown>): AutotradePosition {
  return {
    id: r.id as string,
    user_id: r.user_id as string,
    entry_execution_id: (r.entry_execution_id as number | null) ?? null,
    venue: 'polymarket',
    platform_market_id: r.platform_market_id as string,
    outcome_name: r.outcome_name as string,
    token_id: r.token_id as string,
    side: r.side as AutotradeSide,
    size_shares: num(r.size_shares as number | string | null),
    entry_price: num(r.entry_price as number | string | null),
    take_profit_price: r.take_profit_price == null ? null : num(r.take_profit_price as number | string),
    stop_loss_price: r.stop_loss_price == null ? null : num(r.stop_loss_price as number | string),
    status: r.status as AutotradeStatus,
    close_reason: (r.close_reason as AutotradeCloseReason | null) ?? null,
    close_price: r.close_price == null ? null : num(r.close_price as number | string),
    close_execution_id: (r.close_execution_id as number | null) ?? null,
    close_error: (r.close_error as string | null) ?? null,
    last_checked_at: (r.last_checked_at as string | null) ?? null,
    last_observed_price:
      r.last_observed_price == null ? null : num(r.last_observed_price as number | string),
    opened_at: r.opened_at as string,
    updated_at: r.updated_at as string,
    closed_at: (r.closed_at as string | null) ?? null,
  }
}

/**
 * Validate TP/SL before insert. Returns null if OK, or an error message.
 * Schema enforces these too — this is the early-return for nicer errors.
 */
export function validateTpSl(
  entry_price: number,
  take_profit_price: number | null | undefined,
  stop_loss_price: number | null | undefined,
): string | null {
  if (entry_price <= 0 || entry_price > 1) return 'entry_price must be > 0 and <= 1'
  if (take_profit_price != null) {
    if (take_profit_price <= 0 || take_profit_price > 1)
      return 'take_profit_price must be > 0 and <= 1'
    if (take_profit_price <= entry_price)
      return 'take_profit_price must be strictly above entry_price'
  }
  if (stop_loss_price != null) {
    if (stop_loss_price <= 0 || stop_loss_price > 1)
      return 'stop_loss_price must be > 0 and <= 1'
    if (stop_loss_price >= entry_price)
      return 'stop_loss_price must be strictly below entry_price'
  }
  return null
}

export async function openPosition(
  input: OpenPositionInput,
): Promise<{ ok: true; position: AutotradePosition } | { ok: false; error: string }> {
  const tpSlErr = validateTpSl(
    input.entry_price,
    input.take_profit_price ?? null,
    input.stop_loss_price ?? null,
  )
  if (tpSlErr) return { ok: false, error: tpSlErr }
  if (!(input.size_shares > 0)) return { ok: false, error: 'size_shares must be > 0' }

  const admin = getServerClient()
  const { data, error } = await admin
    .from('autotrade_positions')
    .insert({
      user_id: input.user_id,
      entry_execution_id: input.entry_execution_id ?? null,
      venue: 'polymarket',
      platform_market_id: input.platform_market_id,
      outcome_name: input.outcome_name,
      token_id: input.token_id,
      side: input.side,
      size_shares: input.size_shares,
      entry_price: input.entry_price,
      take_profit_price: input.take_profit_price ?? null,
      stop_loss_price: input.stop_loss_price ?? null,
      status: 'open',
    })
    .select('*')
    .single()
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'insert failed' }
  }
  return { ok: true, position: rowToPosition(data as Record<string, unknown>) }
}

export async function listOpenPositionsForUser(
  user_id: string,
): Promise<AutotradePosition[]> {
  const admin = getServerClient()
  const { data, error } = await admin
    .from('autotrade_positions')
    .select('*')
    .eq('user_id', user_id)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(rowToPosition)
}

/**
 * Watcher entry: every open position across every user. Used by the
 * apps/trader autotrade-watcher. Returned in oldest-checked-first order
 * so a stuck row at the front of the queue doesn't starve the rest.
 */
export async function listAllOpenPositions(): Promise<AutotradePosition[]> {
  const admin = getServerClient()
  const { data, error } = await admin
    .from('autotrade_positions')
    .select('*')
    .eq('status', 'open')
    .order('last_checked_at', { ascending: true, nullsFirst: true })
  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(rowToPosition)
}

export async function recordPriceObservation(
  positionId: string,
  observedPrice: number,
): Promise<void> {
  const admin = getServerClient()
  await admin
    .from('autotrade_positions')
    .update({
      last_checked_at: new Date().toISOString(),
      last_observed_price: observedPrice,
    })
    .eq('id', positionId)
}

export async function markClosing(positionId: string): Promise<boolean> {
  // Optimistic claim: only flip 'open' → 'closing'. If the row is already
  // 'closing' (another watcher pass beat us) the update affects 0 rows
  // and we know to skip.
  const admin = getServerClient()
  const { data, error } = await admin
    .from('autotrade_positions')
    .update({ status: 'closing' })
    .eq('id', positionId)
    .eq('status', 'open')
    .select('id')
  if (error) return false
  return (data?.length ?? 0) > 0
}

export async function recordClose(
  positionId: string,
  args: {
    reason: AutotradeCloseReason
    close_price: number | null
    close_execution_id?: number | null
    close_error?: string | null
    final_status?: 'closed' | 'errored' | 'cancelled'
  },
): Promise<void> {
  const admin = getServerClient()
  await admin
    .from('autotrade_positions')
    .update({
      status: args.final_status ?? 'closed',
      close_reason: args.reason,
      close_price: args.close_price,
      close_execution_id: args.close_execution_id ?? null,
      close_error: args.close_error ?? null,
      closed_at: new Date().toISOString(),
    })
    .eq('id', positionId)
}

/**
 * Decide whether the current observed price triggers a close. Returns
 * a CloseReason or null if neither threshold crossed.
 *
 * Semantics: "crossed" = current_price >= take_profit (TP filled)
 * OR current_price <= stop_loss (SL filled). Single touch is the
 * trigger — no debounce, no N-tick confirmation. Watcher cadence is
 * minute-grain so any single read is already a meaningful average.
 */
export function checkTrigger(
  currentPrice: number,
  position: Pick<AutotradePosition, 'take_profit_price' | 'stop_loss_price'>,
): AutotradeCloseReason | null {
  if (position.take_profit_price != null && currentPrice >= position.take_profit_price) {
    return 'tp_hit'
  }
  if (position.stop_loss_price != null && currentPrice <= position.stop_loss_price) {
    return 'sl_hit'
  }
  return null
}
