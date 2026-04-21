import { createClient } from '@supabase/supabase-js'
import { getServerClient } from '@/lib/supabase-server'
import { isValidInviteCodeFormat } from '@/lib/invite-code'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown
    code?: unknown
  }
  const { email, code } = body

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return Response.json({ error: 'invalid_email' }, { status: 400 })
  }
  if (!code || typeof code !== 'string' || !isValidInviteCodeFormat(code.toUpperCase())) {
    return Response.json({ error: 'invalid_code' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()
  const normalizedCode = code.toUpperCase()

  // Look up the waitlist row via service_role (RLS blocks anon reads).
  const admin = getServerClient()
  const { data: row, error: lookupErr } = await admin
    .from('waitlist')
    .select('email, invite_code, invite_used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (lookupErr) {
    console.error('[request-link] waitlist lookup failed', lookupErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  // Intentionally vague error for all invite-validation failures — don't
  // leak whether an email is on the waitlist or whether a code exists.
  const reject = () => Response.json({ error: 'invite_invalid' }, { status: 400 })

  if (!row) return reject()
  if (!row.invite_code || row.invite_code !== normalizedCode) return reject()
  if (row.invite_used_at) return reject()

  // Trigger Supabase magic link. Uses the anon client — signInWithOtp is a
  // public auth operation.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })

  const { error: otpErr } = await anon.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${SITE_URL}/auth/callback`,
      shouldCreateUser: true,
    },
  })

  if (otpErr) {
    console.error('[request-link] signInWithOtp failed', otpErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
