import { getServerClient } from './supabase-server'

// Exclude visually ambiguous chars: 0/O, 1/I.
// Alphabet size 32 → 32^6 ≈ 1B codes. Collision-proof at our scale.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const MAX_ATTEMPTS = 10

function randomCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

/**
 * Generate a unique referral code not already present in waitlist.
 * Retries up to MAX_ATTEMPTS times on collision.
 */
export async function generateUniqueReferralCode(): Promise<string> {
  const supabase = getServerClient()
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode()
    const { data, error } = await supabase
      .from('waitlist')
      .select('referral_code')
      .eq('referral_code', code)
      .limit(1)
    if (error) {
      throw new Error(`referral code lookup failed: ${error.message}`)
    }
    if (!data || data.length === 0) {
      return code
    }
  }
  throw new Error('failed to generate unique referral code after max attempts')
}

export function isValidReferralCodeFormat(code: string): boolean {
  if (typeof code !== 'string') return false
  if (code.length !== CODE_LENGTH) return false
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false
  }
  return true
}
