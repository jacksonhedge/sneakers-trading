import { getAuthClient } from '@/lib/supabase-auth'

// POST /api/auth/reset-password
//
// Body: { password }
//
// Updates the signed-in user's password. The user must have an active
// session — they reach this route via the recovery email link, which
// /auth/callback exchanges for a session before redirecting to
// /reset-password where the form lives.

const PASSWORD_MIN = 8
const PASSWORD_MAX = 200

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) {
    return Response.json(
      { error: 'no_session', message: 'Your reset link expired — request a fresh one.' },
      { status: 401 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as { password?: unknown }
  const password = typeof body.password === 'string' ? body.password : null
  if (!password || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return Response.json(
      {
        error: 'invalid_password',
        message: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`,
      },
      { status: 400 },
    )
  }

  const { error } = await sb.auth.updateUser({ password })
  if (error) {
    console.error('[auth/reset-password] updateUser failed', error)
    return Response.json(
      { error: 'update_failed', message: error.message },
      { status: 500 },
    )
  }

  return Response.json({ ok: true })
}
