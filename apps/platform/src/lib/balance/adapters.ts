import { polymarketBalanceAdapter } from './venues/polymarket'
import { kalshiBalanceAdapter } from './venues/kalshi'
import { opinionBalanceAdapter } from './venues/opinion'

// Per-venue cash-balance fetcher. v1 is collateral / cash only — no
// open-position MTM. When a venue ships an authenticated balance call,
// add a file under venues/ and register it here.

export type BalanceFetchResult =
  | { status: 'ok'; cents: number }
  | { status: 'no_credentials' }

export interface BalanceAdapter {
  venue: string
  fetch(userId: string): Promise<BalanceFetchResult>
}

export const balanceAdapters: Record<string, BalanceAdapter> = {
  [polymarketBalanceAdapter.venue]: polymarketBalanceAdapter,
  [kalshiBalanceAdapter.venue]: kalshiBalanceAdapter,
  [opinionBalanceAdapter.venue]: opinionBalanceAdapter,
}

export function getBalanceAdapter(venue: string): BalanceAdapter | undefined {
  return balanceAdapters[venue]
}
