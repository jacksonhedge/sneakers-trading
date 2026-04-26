import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// AES-256-GCM envelope encryption for at-rest secrets (provider API keys
// today; can host other column-encrypted values later). Output format is
// base64-encoded:  iv (12B) || ciphertext (var) || authTag (16B).
//
// Key source: PROVIDER_KEY_ENCRYPTION_KEY env var, must decode to exactly
// 32 bytes. Accepts either base64 or hex. Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// If the env var is unset, encrypt/decrypt are pass-through identity. This
// keeps existing dev environments working without coordinated env-var
// rollout, but we log a loud warning so prod misconfig is caught fast.
// Once the env var ships everywhere, remove the pass-through fallback in
// a follow-up.

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

let warnedNoKey = false

function getKey(): Buffer | null {
  const raw = process.env.PROVIDER_KEY_ENCRYPTION_KEY
  if (!raw) {
    if (!warnedNoKey) {
      console.warn(
        '[secrets] PROVIDER_KEY_ENCRYPTION_KEY unset — secrets stored as plaintext. ' +
          'Set this to a 32-byte random value (base64 or hex) before relying on at-rest encryption.',
      )
      warnedNoKey = true
    }
    return null
  }
  // Try base64 first (more compact), fall back to hex.
  let buf: Buffer
  try {
    buf = Buffer.from(raw, 'base64')
    if (buf.length !== 32) buf = Buffer.from(raw, 'hex')
  } catch {
    buf = Buffer.from(raw, 'hex')
  }
  if (buf.length !== 32) {
    throw new Error(
      `PROVIDER_KEY_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length}). ` +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    )
  }
  return buf
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  if (!key) return plaintext // pass-through fallback — dev only
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ct, tag]).toString('base64')
}

export function decryptSecret(blob: string): string {
  const key = getKey()
  if (!key) return blob // pass-through — input was plaintext
  const buf = Buffer.from(blob, 'base64')
  if (buf.length < IV_LEN + TAG_LEN) {
    // Probably a plaintext value from before encryption was wired up.
    return blob
  }
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(buf.length - TAG_LEN)
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

export function previewSecret(plaintext: string): string {
  if (!plaintext || plaintext.length < 12) return '••••'
  return `${plaintext.slice(0, 4)}…${plaintext.slice(-4)}`
}
