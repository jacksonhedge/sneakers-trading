import { loadUserCredentials, touchLastUsed } from '../../autotrade/credentials'
import { fetchBalance } from '../../autotrade/kalshi'
import type { BalanceAdapter } from '../adapters'

export const kalshiBalanceAdapter: BalanceAdapter = {
  venue: 'kalshi',
  async fetch(userId) {
    const creds = await loadUserCredentials(userId, 'kalshi')
    if (!creds) return { status: 'no_credentials' }
    const { cents } = await fetchBalance(creds)
    await touchLastUsed(userId, 'kalshi')
    return { status: 'ok', cents }
  },
}
