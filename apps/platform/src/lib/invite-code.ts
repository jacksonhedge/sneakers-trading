import { getServerClient } from './supabase-server'

// 8-char codes (distinct from the 6-char referral codes).
// Same safe alphabet: no 0/O/I/1.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8
const MAX_ATTEMPTS = 10

function randomCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

export async function generateUniqueInviteCode(): Promise<string> {
  const supabase = getServerClient()
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode()
    const { data, error } = await supabase
      .from('waitlist')
      .select('invite_code')
      .eq('invite_code', code)
      .limit(1)
    if (error) {
      throw new Error(`invite code lookup failed: ${error.message}`)
    }
    if (!data || data.length === 0) {
      return code
    }
  }
  throw new Error('failed to generate unique invite code after max attempts')
}

export function isValidInviteCodeFormat(code: string): boolean {
  if (typeof code !== 'string') return false
  if (code.length !== CODE_LENGTH) return false
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false
  }
  return true
}
