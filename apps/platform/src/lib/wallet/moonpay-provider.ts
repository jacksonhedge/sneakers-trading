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

// MoonPay provider — stubbed shape. Live methods throw a clear "wired but
// not implemented; finish in phase 1.5b" error once env vars are present,
// to fail loud rather than silently 200 with mock data. While env vars are
// absent (`isLive === false`), callers should branch to the mock provider
// via the selector in ./index.ts.
//
// The integration that lands here once KYB clears + sandbox keys arrive:
//
//   - getBalance / listTransactions hit wallet_balances + wallet_transactions
//     in Supabase (we mirror MoonPay's truth via webhooks; reading their
//     API on every page-load is too slow + costs API calls)
//   - initiateDeposit constructs a MoonPay buy-widget URL with our
//     api_key, externalCustomerId = our user id, currencyCode='usdc_polygon',
//     baseCurrencyAmount, walletAddress, and signs the params with
//     MOONPAY_SECRET_KEY (HMAC-SHA256 over the query string). The URL goes
//     back to the client which opens it.
//   - initiateWithdraw uses the sell-widget equivalent (their /sell endpoint).
//   - parseWebhookRequest verifies the MoonPay-Signature-V2 header using
//     MOONPAY_WEBHOOK_SECRET and maps their event types
//     (transaction_completed / transaction_failed for both buy + sell)
//     into our normalized WebhookEvent shape.
//
// Vendor doc refs: dev.moonpay.com/v1.0/docs/on-ramp-overview,
// dev.moonpay.com/docs/webhooks, dev.moonpay.com/docs/customize-the-widgets-appearance.

interface MoonPayEnv {
  publicKey: string
  secretKey: string
  webhookSecret: string
  // Theme id provisioned by MoonPay after we submit our Sneakers Vault
  // brand. While that's pending, the widget renders MoonPay-default.
  themeId: string | null
  // 'sandbox' until production launch.
  environment: 'sandbox' | 'production'
}

function readEnv(): MoonPayEnv | null {
  const publicKey = process.env.NEXT_PUBLIC_MOONPAY_API_KEY
  const secretKey = process.env.MOONPAY_SECRET_KEY
  const webhookSecret = process.env.MOONPAY_WEBHOOK_SECRET
  if (!publicKey || !secretKey || !webhookSecret) return null
  return {
    publicKey,
    secretKey,
    webhookSecret,
    themeId: process.env.MOONPAY_THEME_ID ?? null,
    environment:
      (process.env.MOONPAY_ENVIRONMENT as 'sandbox' | 'production' | undefined) ??
      'sandbox',
  }
}

function notImplemented(name: string): never {
  throw new Error(
    `[wallet/moonpay] ${name} env-vars set but live impl not finished — phase 1.5b ships post-KYB`,
  )
}

const ENV = readEnv()

export const moonpayProvider: WalletProvider = {
  id: 'moonpay',
  isLive: ENV !== null,

  async getBalance(_userId): Promise<WalletBalance> {
    if (!ENV) notImplemented('getBalance')
    // Real impl: SELECT FROM wallet_balances WHERE user_id = … LIMIT 1
    notImplemented('getBalance')
  },

  async listTransactions(_userId, _opts): Promise<WalletTransaction[]> {
    if (!ENV) notImplemented('listTransactions')
    // Real impl: SELECT FROM wallet_transactions WHERE user_id = … ORDER BY occurred_at DESC
    notImplemented('listTransactions')
  },

  async initiateDeposit(_userId, _req: DepositRequest): Promise<DepositInitiated> {
    if (!ENV) notImplemented('initiateDeposit')
    // Real impl:
    //   const params = new URLSearchParams({ apiKey: ENV.publicKey, currencyCode: 'usdc_polygon', ... })
    //   const sig = hmacSha256(params.toString(), ENV.secretKey)
    //   return { redirectUrl: `https://${env}.moonpay.com?${params}&signature=${sig}`, ... }
    notImplemented('initiateDeposit')
  },

  async initiateWithdraw(_userId, _req: WithdrawRequest): Promise<WithdrawInitiated> {
    if (!ENV) notImplemented('initiateWithdraw')
    notImplemented('initiateWithdraw')
  },

  async parseWebhookRequest(
    _headers: Headers,
    _rawBody: string,
  ): Promise<WebhookEvent | null> {
    if (!ENV) return null
    // Real impl:
    //   const sig = headers.get('moonpay-signature-v2')
    //   const expected = hmacSha256(rawBody, ENV.webhookSecret)
    //   if (sig !== expected) return null
    //   parse JSON, map their event types to our WebhookEventType, return
    return null
  },
}
