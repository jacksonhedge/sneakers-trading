import { getAuthClient } from '@/lib/supabase-auth'
import { normalizeEmail } from '@/lib/email-validation'

// POST /api/auth/signin
//
// Body: { email, password }
//
// Email/password sign-in via Supabase. Returns { ok: true } on success
// (session cookie set by the SSR client adapter); the client then routes
// to /dashboard. Magic-link sign-in lives at /api/auth/login as a fallback
// for users who forgot their password.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown
    password?: unknown
  }

  const email = normalizeEmail(body.email)
  if (!email) return Response.json({ error: 'invalid_credentials' }, { status: 400 })

  const password = typeof body.password === 'string' ? body.password : null
  if (!password) return Response.json({ error: 'invalid_credentials' }, { status: 400 })

  const auth = await getAuthClient()
  const { error } = await auth.auth.signInWithPassword({ email, password })
  if (error) {
    // Map Supabase's "Invalid login credentials" to a uniform error so
    // we don't differentiate "no such user" from "wrong password" (avoids
    // user enumeration via the sign-in form).
    return Response.json({ error: 'invalid_credentials' }, { status: 401 })
  }

  return Response.json({ ok: true })
}
