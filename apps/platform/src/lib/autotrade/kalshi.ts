import { createSign, constants as cryptoConstants } from 'node:crypto'
import type { CredentialBundle } from './credentials'

// Kalshi v2 API auth: every request signed with an RSA private key.
//
// Setup the user does in the Kalshi UI:
//   1. Generate a 2048-bit RSA keypair locally.
//   2. Upload the public key to https://kalshi.com/account/profile.
//   3. Copy the resulting Access Key ID (a UUID) — that's the apiKey field.
//   4. Paste the matching private key PEM into our form — that's privateKey.
//
// Per-request signing:
//   payload   = `${timestamp_ms}${METHOD}${path}`
//   signature = RSA-PSS(SHA-256, salt=32) of payload, base64-encoded
// Headers: KALSHI-ACCESS-KEY, KALSHI-ACCESS-SIGNATURE, KALSHI-ACCESS-TIMESTAMP.

const KALSHI_HOST = 'https://api.elections.kalshi.com'
const PATH_PREFIX = '/trade-api/v2'

function signRequest(
  privateKeyPem: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
): { headers: Record<string, string> } {
  const timestamp = Date.now().toString()
  const payload = `${timestamp}${method}${path}`
  const signer = createSign('RSA-SHA256')
  signer.update(payload)
  signer.end()
  const signature = signer.sign(
    {
      key: privateKeyPem,
      padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32, // SHA-256 digest length — Kalshi's documented choice.
    },
    'base64',
  )
  return {
    headers: {
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature,
      accept: 'application/json',
    },
  }
}

async function kalshiGet(creds: CredentialBundle, path: string): Promise<Response> {
  if (!creds.privateKey) {
    throw new Error('kalshi creds missing private key (RSA PEM required)')
  }
  const fullPath = `${PATH_PREFIX}${path}`
  const { headers } = signRequest(creds.privateKey, 'GET', fullPath)
  return fetch(`${KALSHI_HOST}${fullPath}`, {
    method: 'GET',
    headers: {
      ...headers,
      'KALSHI-ACCESS-KEY': creds.apiKey,
    },
    cache: 'no-store',
  })
}

/**
 * Fetch the user's Kalshi cash balance. Returned in cents to match the
 * rest of the balance pipeline. Kalshi already uses cents internally
 * (their `balance` field is an integer count of cents), so no conversion.
 */
export async function fetchBalance(creds: CredentialBundle): Promise<{
  cents: number
  raw: unknown
}> {
  const res = await kalshiGet(creds, '/portfolio/balance')
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`kalshi /portfolio/balance returned ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { balance?: number }
  const cents = typeof data.balance === 'number' ? data.balance : 0
  return { cents, raw: data }
}

/**
 * Read-only auth check. Hits the balance endpoint — cheapest authenticated
 * call available. 401/403 → bad creds; 200 → ok.
 */
export async function testConnection(creds: CredentialBundle): Promise<{
  ok: boolean
  reason?: string
}> {
  try {
    if (!creds.privateKey) {
      return { ok: false, reason: 'missing private key' }
    }
    const res = await kalshiGet(creds, '/portfolio/balance')
    if (res.ok) return { ok: true }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'kalshi rejected the signature (check key ID + PEM)' }
    }
    return { ok: false, reason: `kalshi returned ${res.status}` }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown error' }
  }
}
