import { getAuthClient } from '@/lib/supabase-auth'
import {
  storeUserCredentials,
  getCredentialMeta,
  deleteUserCredentials,
  loadUserCredentials,
  markTestConnection,
  type CredentialBundle,
  type CredentialedVenue,
  type CredentialScope,
} from '@/lib/autotrade/credentials'
import { testConnection as testPolymarket } from '@/lib/autotrade/polymarket'
import { testConnection as testKalshi } from '@/lib/autotrade/kalshi'
import { testConnection as testOpinion } from '@/lib/autotrade/opinion'

// POST   /api/autotrade/credentials  → save (and verify) a venue cred bundle
// GET    /api/autotrade/credentials?venue=  → return metadata only
// DELETE /api/autotrade/credentials?venue=  → drop the saved bundle
//
// `venue` defaults to 'polymarket' for backward compat with the existing
// settings UI. New venues (kalshi today, opinion next) MUST pass it
// explicitly.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPPORTED_VENUES: readonly CredentialedVenue[] = [
  'polymarket',
  'kalshi',
  'opinion',
] as const

function parseVenue(v: unknown): CredentialedVenue | null {
  if (typeof v !== 'string') return null
  return (SUPPORTED_VENUES as readonly string[]).includes(v)
    ? (v as CredentialedVenue)
    : null
}

export async function GET(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const venueParam = new URL(req.url).searchParams.get('venue') ?? 'polymarket'
  const venue = parseVenue(venueParam)
  if (!venue) {
    return Response.json({ error: 'unsupported_venue', venue: venueParam }, { status: 400 })
  }

  const meta = await getCredentialMeta(user.id, venue)
  return Response.json({ ok: true, venue, meta })
}

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const venue = parseVenue(body.venue ?? 'polymarket')
  if (!venue) {
    return Response.json({ error: 'unsupported_venue', venue: body.venue }, { status: 400 })
  }

  const label = typeof body.label === 'string' ? body.label.slice(0, 80) : null
  const scope: CredentialScope =
    body.scope === 'read' || body.scope === 'trade' ? body.scope : 'trade'

  let bundle: CredentialBundle
  if (venue === 'polymarket') {
    const parsed = parsePolymarket(body)
    if ('error' in parsed) return Response.json(parsed.error, { status: 400 })
    bundle = parsed.bundle
  } else if (venue === 'kalshi') {
    const parsed = parseKalshi(body)
    if ('error' in parsed) return Response.json(parsed.error, { status: 400 })
    bundle = parsed.bundle
  } else {
    const parsed = parseOpinion(body)
    if ('error' in parsed) return Response.json(parsed.error, { status: 400 })
    bundle = parsed.bundle
  }

  // Verify FIRST against the in-memory bundle. Don't persist anything
  // until the venue confirms the credentials work. Previous order was
  // save-then-verify, which left orphan error rows in user_venue_credentials
  // when verify failed (verifier flagged this as a security/UX bug).
  const test =
    venue === 'polymarket'
      ? await testPolymarket(bundle)
      : venue === 'kalshi'
        ? await testKalshi(bundle)
        : await testOpinion(bundle)

  if (!test.ok) {
    return Response.json(
      {
        ok: false,
        venue,
        test,
        error: 'verify_failed',
        message: `Couldn't verify the credentials: ${test.reason ?? 'unknown reason'}. Nothing was saved — fix the values and try again.`,
      },
      { status: 400 },
    )
  }

  // Verify passed — persist + mark verified atomically (best-effort; if
  // storeUserCredentials fails after a successful verify, we surface the
  // error and the credential row is just absent, which matches the
  // pre-save state).
  await storeUserCredentials(user.id, venue, bundle, label, scope)

  // Round-trip safety check: read it back to confirm encrypt/decrypt
  // works and the row is queryable. Drops the orphan-row class of bug
  // because we only get here if verify succeeded.
  const reloaded = await loadUserCredentials(user.id, venue)
  if (!reloaded) {
    return Response.json(
      { error: 'load_failed', message: 'Saved credentials but could not reload them. Try again.' },
      { status: 500 },
    )
  }

  await markTestConnection(user.id, venue, true)

  return Response.json({
    ok: true,
    venue,
    test,
    meta: await getCredentialMeta(user.id, venue),
  })
}

export async function DELETE(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const venueParam = new URL(req.url).searchParams.get('venue') ?? 'polymarket'
  const venue = parseVenue(venueParam)
  if (!venue) {
    return Response.json({ error: 'unsupported_venue', venue: venueParam }, { status: 400 })
  }

  await deleteUserCredentials(user.id, venue)
  return Response.json({ ok: true, venue })
}

// ---------- per-venue body parsing ----------

type ParseResult =
  | { bundle: CredentialBundle }
  | { error: { error: string; message: string } }

function parsePolymarket(body: Record<string, unknown>): ParseResult {
  const apiKey = strField(body.apiKey)
  const apiSecret = strField(body.apiSecret)
  const passphrase = strField(body.passphrase)
  const privateKey = optStrField(body.privateKey)
  const funderAddress = optStrField(body.funderAddress)

  if (!apiKey || !apiSecret || !passphrase) {
    return {
      error: {
        error: 'missing_fields',
        message: 'API key, secret, and passphrase are all required.',
      },
    }
  }
  if (privateKey && !/^(0x)?[0-9a-fA-F]{64}$/.test(privateKey)) {
    return {
      error: {
        error: 'invalid_private_key',
        message: 'Private key must be 64 hex characters (with or without 0x prefix).',
      },
    }
  }
  if (funderAddress && !/^0x[0-9a-fA-F]{40}$/.test(funderAddress)) {
    return {
      error: {
        error: 'invalid_funder_address',
        message: 'Funder address must be a 0x-prefixed 40-character hex string.',
      },
    }
  }
  return { bundle: { apiKey, apiSecret, passphrase, privateKey, funderAddress } }
}

function parseOpinion(body: Record<string, unknown>): ParseResult {
  // Opinion: a single API key in the `apikey` header.
  const apiKey = strField(body.apiKey)
  if (!apiKey) {
    return {
      error: {
        error: 'missing_fields',
        message: 'Opinion API key is required.',
      },
    }
  }
  return { bundle: { apiKey } }
}

function parseKalshi(body: Record<string, unknown>): ParseResult {
  // Kalshi: apiKey = the access key UUID; privateKey = RSA PEM.
  const apiKey = strField(body.apiKey)
  const privateKey = strField(body.privateKey)

  if (!apiKey) {
    return {
      error: {
        error: 'missing_fields',
        message: 'Kalshi access key ID is required.',
      },
    }
  }
  if (!privateKey) {
    return {
      error: {
        error: 'missing_fields',
        message: 'Kalshi RSA private key (PEM) is required — every request is signed.',
      },
    }
  }
  if (!privateKey.includes('BEGIN') || !privateKey.includes('PRIVATE KEY')) {
    return {
      error: {
        error: 'invalid_private_key',
        message: 'Private key must be a PEM block (starts with -----BEGIN ... PRIVATE KEY-----).',
      },
    }
  }
  return { bundle: { apiKey, privateKey } }
}

function strField(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function optStrField(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
