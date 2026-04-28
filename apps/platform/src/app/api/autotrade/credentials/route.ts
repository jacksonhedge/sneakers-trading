import { getAuthClient } from '@/lib/supabase-auth'
import {
  storeUserCredentials,
  getCredentialMeta,
  deleteUserCredentials,
  loadUserCredentials,
  markTestConnection,
} from '@/lib/autotrade/credentials'
import { testConnection } from '@/lib/autotrade/polymarket'

// POST   /api/autotrade/credentials  → save (and verify) a Polymarket cred bundle
// GET    /api/autotrade/credentials  → return metadata only (no secrets)
// DELETE /api/autotrade/credentials  → drop the saved bundle

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const meta = await getCredentialMeta(user.id, 'polymarket')
  return Response.json({ ok: true, meta })
}

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    apiKey?: unknown
    apiSecret?: unknown
    passphrase?: unknown
    privateKey?: unknown
    funderAddress?: unknown
    label?: unknown
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const apiSecret = typeof body.apiSecret === 'string' ? body.apiSecret.trim() : ''
  const passphrase =
    typeof body.passphrase === 'string' ? body.passphrase.trim() : ''
  const privateKey =
    typeof body.privateKey === 'string' && body.privateKey.trim().length > 0
      ? body.privateKey.trim()
      : undefined
  const funderAddress =
    typeof body.funderAddress === 'string' && body.funderAddress.trim().length > 0
      ? body.funderAddress.trim()
      : undefined
  const label = typeof body.label === 'string' ? body.label.slice(0, 80) : null

  if (!apiKey || !apiSecret || !passphrase) {
    return Response.json(
      {
        error: 'missing_fields',
        message: 'API key, secret, and passphrase are all required.',
      },
      { status: 400 },
    )
  }

  // Sanity-check the private key shape if provided. ethers throws on
  // invalid hex when the Wallet ctor runs — easier to catch up front.
  if (privateKey) {
    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(privateKey)) {
      return Response.json(
        {
          error: 'invalid_private_key',
          message: 'Private key must be 64 hex characters (with or without 0x prefix).',
        },
        { status: 400 },
      )
    }
  }
  if (funderAddress && !/^0x[0-9a-fA-F]{40}$/.test(funderAddress)) {
    return Response.json(
      {
        error: 'invalid_funder_address',
        message: 'Funder address must be a 0x-prefixed 40-character hex string.',
      },
      { status: 400 },
    )
  }

  await storeUserCredentials(
    user.id,
    'polymarket',
    { apiKey, apiSecret, passphrase, privateKey, funderAddress },
    label,
  )

  // Try the connection test immediately so the UI can show pass/fail
  // without a separate round-trip. We re-load from DB so we exercise
  // the encrypt → decrypt path end-to-end (catches key drift early).
  const reloaded = await loadUserCredentials(user.id, 'polymarket')
  if (!reloaded) {
    return Response.json(
      { error: 'load_failed', message: 'Saved credentials but could not reload them.' },
      { status: 500 },
    )
  }
  const test = await testConnection(reloaded)
  await markTestConnection(user.id, 'polymarket', test.ok)

  return Response.json({
    ok: true,
    test,
    meta: await getCredentialMeta(user.id, 'polymarket'),
  })
}

export async function DELETE() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  await deleteUserCredentials(user.id, 'polymarket')
  return Response.json({ ok: true })
}
