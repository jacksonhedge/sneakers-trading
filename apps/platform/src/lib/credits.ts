import { getServerClient } from './supabase-server'

export type CreditBalance = {
  balance: number
  lifetimePurchased: number
  lifetimeSpent: number
}

export async function getBalance(userId: string): Promise<CreditBalance> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('user_credits')
    .select('balance, lifetime_purchased, lifetime_spent')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[credits] getBalance failed', error)
    return { balance: 0, lifetimePurchased: 0, lifetimeSpent: 0 }
  }
  return {
    balance: data?.balance ?? 0,
    lifetimePurchased: data?.lifetime_purchased ?? 0,
    lifetimeSpent: data?.lifetime_spent ?? 0,
  }
}

/**
 * Append a consumption row to the ledger. The DB trigger updates
 * user_credits.balance atomically. Returns the new balance if we can query it
 * after; on failure logs and returns null (the chat still succeeds — we do
 * not block an already-sent model response on a bookkeeping write).
 */
export async function spendCredits(
  userId: string,
  amount: number,
  details: {
    modelId: string
    messageCount?: number
    tokensInput?: number
    tokensOutput?: number
  },
): Promise<number | null> {
  if (amount <= 0) return null
  const sb = getServerClient()
  const { error } = await sb.from('credit_transactions').insert({
    user_id: userId,
    kind: 'otoole_message',
    delta: -amount,
    description: `O'Toole message (${details.modelId})`,
    model_id: details.modelId,
    metadata: {
      message_count: details.messageCount ?? 1,
      tokens_input: details.tokensInput ?? null,
      tokens_output: details.tokensOutput ?? null,
    },
  })
  if (error) {
    console.error('[credits] spendCredits insert failed', error)
    return null
  }
  const after = await getBalance(userId)
  return after.balance
}

/**
 * Grant credits (purchase, admin grant, or refund). Source of truth is the
 * ledger — the DB trigger keeps user_credits in sync.
 *
 * For purchases tied to a Stripe charge, this is idempotent: if a row
 * already exists for the (kind=purchase, stripe_charge_id) pair, the second
 * call is a no-op. The DB also enforces this via a partial unique index
 * (migration 023) — duplicate inserts surface as a 23505 error which we
 * treat as success.
 */
export async function grantCredits(
  userId: string,
  amount: number,
  kind: 'purchase' | 'admin_grant' | 'refund',
  details: { description?: string; stripeChargeId?: string; metadata?: Record<string, unknown> },
): Promise<number | null> {
  if (amount <= 0) return null
  const sb = getServerClient()

  // Pre-check: if this is a purchase and we already have a row for this
  // charge, skip. Cheaper than relying on the unique-index conflict for
  // the common-path Stripe-retry case.
  if (kind === 'purchase' && details.stripeChargeId) {
    const { data: existing } = await sb
      .from('credit_transactions')
      .select('id')
      .eq('kind', 'purchase')
      .eq('stripe_charge_id', details.stripeChargeId)
      .maybeSingle()
    if (existing) {
      const after = await getBalance(userId)
      return after.balance
    }
  }

  const { error } = await sb.from('credit_transactions').insert({
    user_id: userId,
    kind,
    delta: amount,
    description: details.description ?? null,
    stripe_charge_id: details.stripeChargeId ?? null,
    metadata: details.metadata ?? null,
  })
  if (error) {
    // 23505 = unique violation — Stripe retried in flight; treat as success.
    if ((error as { code?: string }).code === '23505') {
      const after = await getBalance(userId)
      return after.balance
    }
    console.error('[credits] grantCredits insert failed', error)
    return null
  }
  const after = await getBalance(userId)
  return after.balance
}

/**
 * Standard credit packs for purchase. Pricing set so 1 credit = $0.001 before
 * margin — that way message costs shown to users (3 / 30 / 150 credits) map
 * cleanly to intuitive pennies and dimes. Bulk packs carry a bonus so paying
 * more up front gets more value.
 */
export const CREDIT_PACKS = [
  { id: 'credits_10', usd: 10, credits: 10_000, bonus: 0 },
  { id: 'credits_25', usd: 25, credits: 27_500, bonus: 2_500 },
  { id: 'credits_100', usd: 100, credits: 120_000, bonus: 20_000 },
  { id: 'credits_500', usd: 500, credits: 650_000, bonus: 150_000 },
] as const
