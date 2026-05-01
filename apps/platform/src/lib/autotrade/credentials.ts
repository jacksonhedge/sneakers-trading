import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getServerClient } from '../supabase-server'

// AES-256-GCM encryption for venue trading credentials. Output format
// matches lib/secrets.ts (used for BYO LLM keys): base64 of
// iv (12B) || ciphertext (var) || authTag (16B).
//
// Key from env AUTOTRADE_CREDENTIAL_KEY — 32 bytes, base64 or hex.
// If unset, encrypt/decrypt are pass-through with a loud warning so
// dev environments still work; ABSOLUTELY don't run prod that way.

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

let warned = false

function getKey(): Buffer | null {
  const raw = process.env.AUTOTRADE_CREDENTIAL_KEY
  if (!raw) {
    if (!warned) {
      console.warn(
        '[autotrade] AUTOTRADE_CREDENTIAL_KEY unset — venue credentials stored in plaintext. ' +
          "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      )
      warned = true
    }
    return null
  }
  let buf: Buffer
  try {
    buf = Buffer.from(raw, 'base64')
    if (buf.length !== 32) buf = Buffer.from(raw, 'hex')
  } catch {
    buf = Buffer.from(raw, 'hex')
  }
  if (buf.length !== 32) {
    throw new Error(
      `AUTOTRADE_CREDENTIAL_KEY must decode to 32 bytes (got ${buf.length}).`,
    )
  }
  return buf
}

function encrypt(plain: string): string {
  const key = getKey()
  if (!key) return plain
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ct, tag]).toString('base64')
}

function decrypt(blob: string): string {
  const key = getKey()
  if (!key) return blob
  const buf = Buffer.from(blob, 'base64')
  if (buf.length < IV_LEN + TAG_LEN) return blob // legacy plaintext fallback
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(buf.length - TAG_LEN)
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/** Venues that can store credentials. Widen as new adapters land. */
export type CredentialedVenue = 'polymarket' | 'kalshi' | 'opinion'

export interface CredentialBundle {
  /** Polymarket: CLOB API key. Kalshi: access key ID (UUID). */
  apiKey: string
  /** Polymarket only — CLOB API secret. */
  apiSecret?: string
  /** Polymarket only — CLOB API passphrase. */
  passphrase?: string
  /**
   * Polymarket: 64-hex EOA private key for EIP-712 order signing.
   * Kalshi: RSA private key in PEM form for request signing.
   * Required for trade-scoped use; optional for read-only balance fetch
   * (Polymarket reads work with the API trio alone; Kalshi reads require
   * the PEM since every request is signed).
   */
  privateKey?: string
  /** Polymarket only — proxy/Safe funder address. */
  funderAddress?: string
}

export type CredentialScope = 'read' | 'trade'

export interface CredentialMeta {
  venue: string
  label: string | null
  scope: CredentialScope
  testConnectionOk: boolean
  testConnectionAt: string | null
  createdAt: string
  lastUsedAt: string | null
  hasPrivateKey: boolean
  funderAddress: string | null
}

/**
 * Encrypt + upsert. Resets test_connection_ok = false on every save —
 * caller must re-run testConnection() before treating creds as live.
 *
 * Service-role only. Never expose to user-facing API routes that
 * pass through unauthenticated arguments. Auth your caller first.
 */
export async function storeUserCredentials(
  userId: string,
  venue: CredentialedVenue,
  bundle: CredentialBundle,
  label?: string | null,
  scope: CredentialScope = 'trade',
): Promise<void> {
  const sb = getServerClient()
  const { error } = await sb.from('user_venue_credentials').upsert(
    {
      user_id: userId,
      venue,
      scope,
      api_key_encrypted: encrypt(bundle.apiKey),
      api_secret_encrypted: bundle.apiSecret ? encrypt(bundle.apiSecret) : null,
      passphrase_encrypted: bundle.passphrase ? encrypt(bundle.passphrase) : null,
      private_key_encrypted: bundle.privateKey ? encrypt(bundle.privateKey) : null,
      funder_address: bundle.funderAddress ?? null,
      label: label ?? null,
      test_connection_ok: false,
      test_connection_at: null,
    },
    { onConflict: 'user_id,venue' },
  )
  if (error) throw error
}

/**
 * Decrypt + return the live credential bundle. Service-role only.
 * Logs say "credentials loaded for user X" — never the values.
 */
export async function loadUserCredentials(
  userId: string,
  venue: CredentialedVenue,
): Promise<CredentialBundle | null> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('user_venue_credentials')
    .select(
      'api_key_encrypted, api_secret_encrypted, passphrase_encrypted, private_key_encrypted, funder_address',
    )
    .eq('user_id', userId)
    .eq('venue', venue)
    .maybeSingle()
  if (error) {
    console.error('[autotrade] loadUserCredentials failed', error)
    return null
  }
  if (!data) return null
  try {
    const privKeyBlob = data.private_key_encrypted as string | null
    const apiSecretBlob = data.api_secret_encrypted as string | null
    const passphraseBlob = data.passphrase_encrypted as string | null
    return {
      apiKey: decrypt(data.api_key_encrypted as string),
      apiSecret: apiSecretBlob ? decrypt(apiSecretBlob) : undefined,
      passphrase: passphraseBlob ? decrypt(passphraseBlob) : undefined,
      privateKey: privKeyBlob ? decrypt(privKeyBlob) : undefined,
      funderAddress: (data.funder_address as string | null) ?? undefined,
    }
  } catch (err) {
    console.error('[autotrade] decrypt failed for user', userId, err)
    return null
  }
}

/** Metadata only — safe to return to user-facing API routes. */
export async function getCredentialMeta(
  userId: string,
  venue: CredentialedVenue,
): Promise<CredentialMeta | null> {
  const sb = getServerClient()
  const { data } = await sb
    .from('user_venue_credentials')
    .select(
      'venue, label, scope, test_connection_ok, test_connection_at, created_at, last_used_at, private_key_encrypted, funder_address',
    )
    .eq('user_id', userId)
    .eq('venue', venue)
    .maybeSingle()
  if (!data) return null
  return {
    venue: data.venue as string,
    label: (data.label as string | null) ?? null,
    scope: ((data.scope as string | null) ?? 'trade') as CredentialScope,
    testConnectionOk: Boolean(data.test_connection_ok),
    testConnectionAt: (data.test_connection_at as string | null) ?? null,
    createdAt: data.created_at as string,
    lastUsedAt: (data.last_used_at as string | null) ?? null,
    hasPrivateKey: Boolean(data.private_key_encrypted),
    funderAddress: (data.funder_address as string | null) ?? null,
  }
}

export async function deleteUserCredentials(
  userId: string,
  venue: CredentialedVenue,
): Promise<void> {
  const sb = getServerClient()
  await sb
    .from('user_venue_credentials')
    .delete()
    .eq('user_id', userId)
    .eq('venue', venue)
}

export async function markTestConnection(
  userId: string,
  venue: CredentialedVenue,
  ok: boolean,
): Promise<void> {
  const sb = getServerClient()
  await sb
    .from('user_venue_credentials')
    .update({
      test_connection_ok: ok,
      test_connection_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('venue', venue)
}

export async function touchLastUsed(
  userId: string,
  venue: CredentialedVenue,
): Promise<void> {
  const sb = getServerClient()
  await sb
    .from('user_venue_credentials')
    .update({ last_used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('venue', venue)
}
