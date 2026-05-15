import type {
  DepositInitiated,
  DepositRequest,
  WalletBalance,
  WalletProvider,
  WalletTransaction,
  WebhookEvent,
  WithdrawInitiated,
  WithdrawRequest,
} from './types'

// Mock implementation. Returns the same balance + activity the
// /dashboard/wallet scaffold has been rendering. Used pre-MoonPay-KYB so
// the surface stays visible during development, and as a fallback when
// live env vars are absent. isLive is hardcoded false so callers can
// branch UI on it ("wallet not yet live — what you see is sample data").

const MOCK_BALANCE_CENTS = 124732 // $1,247.32

const MOCK_TRANSACTIONS: WalletTransaction[] = [
  {
    id: 'mock-1',
    vendorTxnId: null,
    kind: 'deposit',
    status: 'completed',
    label: 'Deposit',
    source: 'CoinFlow',
    amountCents: 25000,
    occurredAt: '2026-05-15T05:47:00.000Z',
  },
  {
    id: 'mock-2',
    vendorTxnId: null,
    kind: 'trade_settle',
    status: 'completed',
    label: 'Trade settle',
    source: 'Kalshi',
    amountCents: 1840,
    occurredAt: '2026-05-15T04:08:00.000Z',
  },
  {
    id: 'mock-3',
    vendorTxnId: null,
    kind: 'withdraw',
    status: 'completed',
    label: 'Withdraw',
    source: 'Bank ••4421',
    amountCents: -10000,
    occurredAt: '2026-05-14T01:14:00.000Z',
  },
  {
    id: 'mock-4',
    vendorTxnId: null,
    kind: 'trade_buy',
    status: 'completed',
    label: 'Trade buy',
    source: 'Polymarket',
    amountCents: -5000,
    occurredAt: '2026-05-13T20:33:00.000Z',
  },
  {
    id: 'mock-5',
    vendorTxnId: null,
    kind: 'deposit',
    status: 'completed',
    label: 'Deposit',
    source: 'CoinFlow',
    amountCents: 50000,
    occurredAt: '2026-05-13T15:02:00.000Z',
  },
]

export const mockProvider: WalletProvider = {
  id: 'mock',
  isLive: false,

  async getBalance(): Promise<WalletBalance> {
    return {
      amountCents: MOCK_BALANCE_CENTS,
      observedAt: new Date().toISOString(),
    }
  },

  async listTransactions(_userId, opts): Promise<WalletTransaction[]> {
    const limit = opts?.limit ?? MOCK_TRANSACTIONS.length
    return MOCK_TRANSACTIONS.slice(0, limit)
  },

  async initiateDeposit(_userId, req: DepositRequest): Promise<DepositInitiated> {
    // In mock mode the redirect is a no-op page that explains it. Clients
    // should check provider.isLive before calling — if false, the scaffold
    // disables the primary action.
    return {
      vendorIntentId: `mock-deposit-${Date.now()}`,
      redirectUrl: '/dashboard/wallet?mock_intent=deposit',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }
  },

  async initiateWithdraw(_userId, _req: WithdrawRequest): Promise<WithdrawInitiated> {
    return {
      vendorIntentId: `mock-withdraw-${Date.now()}`,
      requiresUserConfirmation: false,
      redirectUrl: '/dashboard/wallet?mock_intent=withdraw',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }
  },

  async parseWebhookRequest(): Promise<WebhookEvent | null> {
    // Mock provider receives no real webhooks; if a request lands on the
    // webhook route while we're in mock mode, the route no-ops 200 to keep
    // vendors from retrying.
    return null
  },
}
