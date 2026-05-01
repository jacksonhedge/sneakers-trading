import { loadUserCredentials, touchLastUsed } from '../../autotrade/credentials'
import { fetchBalance } from '../../autotrade/polymarket'
import type { BalanceAdapter } from '../adapters'

export const polymarketBalanceAdapter: BalanceAdapter = {
  venue: 'polymarket',
  async fetch(userId) {
    const creds = await loadUserCredentials(userId, 'polymarket')
    if (!creds) return { status: 'no_credentials' }
    const { usdcCents } = await fetchBalance(creds)
    await touchLastUsed(userId, 'polymarket')
    return { status: 'ok', cents: usdcCents }
  },
}
