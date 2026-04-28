import { ClobClient, Chain, Side, OrderType, AssetType } from '@polymarket/clob-client'
import { SignatureType } from '@polymarket/clob-client/dist/order-utils'
import { Wallet, type TypedDataDomain, type TypedDataField } from 'ethers'
import type { CredentialBundle } from './credentials'

// Adapter from ethers-v6 Wallet to the EthersSigner shape Polymarket's
// CLOB SDK expects (it predates v6's renamed methods). v6 has
// `signTypedData`; v5 + the SDK both use `_signTypedData`.
type EthersV5Signer = {
  _signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>,
  ): Promise<string>
  getAddress(): Promise<string>
}

function v5SignerFromV6(wallet: Wallet): EthersV5Signer {
  return {
    _signTypedData(domain, types, value) {
      return wallet.signTypedData(domain, types, value)
    },
    getAddress() {
      return Promise.resolve(wallet.address)
    },
  }
}

// Thin wrapper around @polymarket/clob-client for the trade-execution
// surface. Stateless — create a fresh client per request, do the call,
// throw it away. The SDK does its own retries internally.
//
// Two flavors of operation:
//   - "read"  — needs only the API key trio. Used for balance + positions
//   - "write" — needs the private key as well. Used for placing orders.
//
// The CLOB host is hardcoded to mainnet. We don't ship the Amoy testnet
// path because there's no real value in testing against fake liquidity —
// we'd rather test with $1 of real USDC.e on a benign market.

const POLY_CLOB_HOST = 'https://clob.polymarket.com'
const POLY_CHAIN = Chain.POLYGON

type ReadClient = InstanceType<typeof ClobClient>
type WriteClient = InstanceType<typeof ClobClient>

function readClient(creds: CredentialBundle): ReadClient {
  return new ClobClient(POLY_CLOB_HOST, POLY_CHAIN, undefined, {
    key: creds.apiKey,
    secret: creds.apiSecret,
    passphrase: creds.passphrase,
  })
}

function writeClient(creds: CredentialBundle): WriteClient {
  if (!creds.privateKey) {
    throw new Error('private key required for write operations')
  }
  const signer = v5SignerFromV6(new Wallet(creds.privateKey))
  // SignatureType.POLY_PROXY (1) — most common: user funded their
  // Polymarket UI, generated API creds, and the wallet that signed
  // those creds is the proxy owner. If the user used a Gnosis Safe
  // setup, this needs to be POLY_GNOSIS_SAFE (2). v1 assumes proxy.
  return new ClobClient(
    POLY_CLOB_HOST,
    POLY_CHAIN,
    signer,
    {
      key: creds.apiKey,
      secret: creds.apiSecret,
      passphrase: creds.passphrase,
    },
    SignatureType.POLY_PROXY,
    creds.funderAddress,
  )
}

/**
 * Read-only check: hits the API with the credentials. Used by the
 * "Test connection" button. Returns true if the API key trio works
 * AND (if a private key is present) the EOA address derived from it
 * matches the funder address logically.
 */
export async function testConnection(creds: CredentialBundle): Promise<{
  ok: boolean
  reason?: string
  signerAddress?: string
}> {
  try {
    const client = readClient(creds)
    // Smoke-test: list api keys (cheap, requires valid creds).
    await client.getApiKeys()
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'unknown error',
    }
  }

  if (creds.privateKey) {
    try {
      const signer = new Wallet(creds.privateKey)
      return { ok: true, signerAddress: signer.address }
    } catch {
      return { ok: false, reason: 'invalid private key format' }
    }
  }
  return { ok: true }
}

/**
 * Place a market order. v1 places a GTC market order — Polymarket
 * fills market orders against the resting orderbook at the time of
 * placement, so 'GTC market' means "buy at top of book up to size".
 *
 * `tokenId` is the Conditional-Token id for the YES or NO outcome of
 * the market the user clicked. The trade panel resolves this from the
 * MarketSnapshot before calling.
 */
export async function placeMarketOrder(
  creds: CredentialBundle,
  params: {
    tokenId: string
    side: 'BUY' | 'SELL'
    sizeUsd: number
  },
): Promise<{
  orderId: string
  raw: unknown
}> {
  const client = writeClient(creds)
  const signed = await client.createMarketOrder({
    tokenID: params.tokenId,
    amount: params.sizeUsd,
    side: params.side === 'BUY' ? Side.BUY : Side.SELL,
  })
  const response = (await client.postOrder(signed, OrderType.GTC)) as {
    orderId?: string
    success?: boolean
    errorMsg?: string
  }
  if (!response.success || !response.orderId) {
    throw new Error(response.errorMsg ?? 'order rejected by Polymarket')
  }
  return { orderId: response.orderId, raw: response }
}

/**
 * Read the user's USDC.e + outcome-token balances. Polymarket exposes
 * this via /balance-allowance. Returns the USDC balance; outcome-token
 * counts are surfaced separately when we add positions.
 */
export async function fetchBalance(creds: CredentialBundle): Promise<{
  usdcCents: number
  raw: unknown
}> {
  const client = readClient(creds)
  // The SDK's BalanceAllowanceResponse type doesn't expose the field
  // names cleanly, so cast to a permissive shape and read defensively.
  // asset_type COLLATERAL = USDC.e — the user's funded balance.
  const res = (await client.getBalanceAllowance({
    asset_type: AssetType.COLLATERAL,
  })) as unknown as {
    balance?: string
  }
  // Polymarket returns balances in USDC.e base units (6 decimals). Convert
  // to cents for display: balance / 1e4.
  const raw = res?.balance ?? '0'
  const usdcCents = Math.floor(Number(raw) / 1e4)
  return { usdcCents, raw: res }
}

/**
 * List the user's currently-open Polymarket orders. Read-only.
 */
export async function fetchOpenOrders(creds: CredentialBundle) {
  const client = readClient(creds)
  return client.getOpenOrders()
}
