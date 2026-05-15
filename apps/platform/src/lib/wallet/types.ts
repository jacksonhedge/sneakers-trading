// Sneakers Wallet — vendor-agnostic contract.
//
// Every wallet provider (mock, MoonPay, Coinbase CDP, …) implements this
// interface. The /dashboard/wallet UI only talks to the WalletProvider —
// never to a vendor SDK directly — so swapping rails is one file.
//
// Money is stored in **cents**, signed: positive = inflow, negative =
// outflow. We never pass floats around; vendor responses get normalized at
// the provider boundary so consumers never see vendor-specific shapes.

export type TransactionKind =
  | 'deposit'
  | 'withdraw'
  | 'trade_buy'
  | 'trade_settle'
  | 'transfer_in'
  | 'transfer_out'

export type TransactionStatus =
  | 'pending' // intent created, awaiting vendor confirmation
  | 'completed' // settled
  | 'failed' // vendor reported failure
  | 'canceled' // user canceled before settle

export interface WalletBalance {
  /** USD-equivalent amount in cents. */
  amountCents: number
  /** ISO timestamp the provider returned this balance. */
  observedAt: string
}

export interface WalletTransaction {
  /** Our id for the txn (we generate uuids on insert). */
  id: string
  /** Vendor-side id, for cross-referencing in vendor dashboards. */
  vendorTxnId: string | null
  kind: TransactionKind
  status: TransactionStatus
  /** Display label, e.g. "Deposit" or "Withdraw". */
  label: string
  /** Display source, e.g. "MoonPay" or "Bank ••4421". */
  source: string
  /** Signed cents. Positive = inflow, negative = outflow. */
  amountCents: number
  /** ISO timestamp. */
  occurredAt: string
}

export interface DepositRequest {
  amountCents: number
  /** Optional client-side hint we round-trip back through the vendor. */
  memo?: string
}

export interface DepositInitiated {
  /** Provider's id for this intent (we persist this with status='pending'). */
  vendorIntentId: string
  /**
   * Where the client opens next. For widget-based vendors this is the
   * hosted-checkout URL; for headless flows it might be a payment-method
   * token. Always a string the client can either window.open() or use
   * to mount an iframe.
   */
  redirectUrl: string
  /** ISO timestamp when this intent expires. Vendor-dependent. */
  expiresAt: string
}

export interface WithdrawRequest {
  amountCents: number
  /** Vendor-side destination token (e.g. a saved bank account id). */
  destinationToken: string
  memo?: string
}

export interface WithdrawInitiated {
  vendorIntentId: string
  /**
   * Many vendors (MoonPay included) require the user to confirm the
   * withdrawal inside the vendor widget for fraud / KYC reasons; some
   * fire-and-forget. Clients should branch on this flag.
   */
  requiresUserConfirmation: boolean
  redirectUrl: string | null
  expiresAt: string
}

/**
 * Stable cross-vendor event shape. Provider impls of `parseWebhookRequest`
 * map their vendor's specific event names to these.
 */
export type WebhookEventType =
  | 'deposit.completed'
  | 'deposit.failed'
  | 'withdraw.completed'
  | 'withdraw.failed'

export interface WebhookEvent {
  type: WebhookEventType
  /** Vendor's id for this event (we de-dupe on it). */
  vendorEventId: string
  /**
   * Our user id we passed the vendor as their externalUserId — used to look
   * up which user's wallet to credit/debit on receipt.
   */
  externalUserId: string
  transaction: WalletTransaction
}

export interface WalletProvider {
  /** Stable id — 'mock' | 'moonpay' | 'coinbase-cdp' (future). */
  readonly id: string

  /**
   * Whether this provider is fully configured for live operations. The mock
   * provider is always false; MoonPay flips to true when its env vars are
   * present. Callers can use this to surface "wallet not yet live" copy or
   * fall through to the mock provider.
   */
  readonly isLive: boolean

  getBalance(externalUserId: string): Promise<WalletBalance>

  listTransactions(
    externalUserId: string,
    opts?: { limit?: number },
  ): Promise<WalletTransaction[]>

  initiateDeposit(externalUserId: string, req: DepositRequest): Promise<DepositInitiated>

  initiateWithdraw(
    externalUserId: string,
    req: WithdrawRequest,
  ): Promise<WithdrawInitiated>

  /**
   * Verify the request's vendor-specific signature, parse the payload, and
   * normalize to our WebhookEvent shape. Returns null on invalid signature
   * or unrecognized payload — caller should respond 400 in that case.
   *
   * Implementations MUST be safe against replay (vendorEventId + occurredAt
   * are enough for the receiver to de-dupe on insert).
   */
  parseWebhookRequest(
    headers: Headers,
    rawBody: string,
  ): Promise<WebhookEvent | null>
}
