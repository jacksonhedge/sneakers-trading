// Tighter email validation than the previous `email.includes('@')` check.
// Stress test (2026-04-21) found that the old check accepted 10KB strings,
// SQL-ish payloads, and IDN unicode — all created real rows on prod.
//
// Rules:
//   1. Max 254 chars total (RFC 5321: 64 local + @ + 253 domain = 321 in theory,
//      but most MTAs cap at 254). Prevents DB bloat.
//   2. Shape: one or more non-space/non-@ chars, exactly one @, then a domain
//      with at least one dot. This is deliberately simple — not a full RFC
//      5322 validator. Supabase / Resend reject malformed addresses anyway.
//   3. No leading/trailing whitespace (callers should trim first but we check).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_LEN = 254

export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false
  if (email.length === 0 || email.length > MAX_LEN) return false
  if (email !== email.trim()) return false
  return EMAIL_RE.test(email)
}

/**
 * Normalize + validate in one step. Returns the lowercased-trimmed email on
 * success, or null if the input fails validation.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toLowerCase()
  if (!isValidEmail(normalized)) return null
  return normalized
}
