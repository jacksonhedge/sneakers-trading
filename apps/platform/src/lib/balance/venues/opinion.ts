import { loadUserCredentials, touchLastUsed } from '../../autotrade/credentials'
import { fetchBalance } from '../../autotrade/opinion'
import type { BalanceAdapter } from '../adapters'

export const opinionBalanceAdapter: BalanceAdapter = {
  venue: 'opinion',
  async fetch(userId) {
    const creds = await loadUserCredentials(userId, 'opinion')
    if (!creds) return { status: 'no_credentials' }
    const { cents } = await fetchBalance(creds)
    await touchLastUsed(userId, 'opinion')
    return { status: 'ok', cents }
  },
}
