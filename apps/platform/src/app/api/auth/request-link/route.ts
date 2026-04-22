import { getServerClient } from '@/lib/supabase-server'
import { getAuthClient } from '@/lib/supabase-auth'
import { isValidInviteCodeFormat } from '@/lib/invite-code'
import { normalizeEmail } from '@/lib/email-validation'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown
    code?: unknown
  }
  const { code } = body

  // Collapsed error for all early-validation failures: don't leak whether the
  // email or the code was the problem, don't leak whether the email exists.
  const reject = () => Response.json({ error: 'invite_invalid' }, { status: 400 })

  const normalizedEmail = normalizeEmail(body.email)
  if (!normalizedEmail) return reject()
  if (!code || typeof code !== 'string' || !isValidInviteCodeFormat(code.toUpperCase())) {
    return reject()
  }
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

  if (!row) return reject()
  if (!row.invite_code || row.invite_code !== normalizedCode) return reject()
  if (row.invite_used_at) return reject()

  // IMPORTANT: use the SSR auth client so the PKCE code-verifier gets written
  // to the response cookies. The /auth/callback handler reads the verifier
  // back from cookies when it calls exchangeCodeForSession. If we use a plain
  // anon client here, the verifier lives in memory and is lost by the time
  // the user clicks the magic-link email, so the exchange fails silently.
  const supabase = await getAuthClient()

  const { error: otpErr } = await supabase.auth.signInWithOtp({
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
