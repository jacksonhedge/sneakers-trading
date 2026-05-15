import { mockProvider } from './mock-provider'
import { moonpayProvider } from './moonpay-provider'
import type { WalletProvider } from './types'

// Provider selector. The live MoonPay impl only takes over when its env
// vars are present (NEXT_PUBLIC_MOONPAY_API_KEY + MOONPAY_SECRET_KEY +
// MOONPAY_WEBHOOK_SECRET). Anything else falls through to the mock — keeps
// the /dashboard/wallet scaffold rendering during local dev + pre-KYB.
//
// Order matters: future Coinbase CDP provider goes ABOVE moonpay so
// migrating is just a flag flip, not a refactor.

let cached: WalletProvider | null = null

export function getWalletProvider(): WalletProvider {
  if (cached) return cached
  if (moonpayProvider.isLive) {
    cached = moonpayProvider
    return cached
  }
  cached = mockProvider
  return cached
}

export type {
  DepositInitiated,
  DepositRequest,
  TransactionKind,
  TransactionStatus,
  WalletBalance,
  WalletProvider,
  WalletTransaction,
  WebhookEvent,
  WebhookEventType,
  WithdrawInitiated,
  WithdrawRequest,
} from './types'
