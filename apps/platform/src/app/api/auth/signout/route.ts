import { getAuthClient } from '@/lib/supabase-auth'

// POST /api/auth/signout
//
// Clears the user's session by calling supabase.auth.signOut() — this
// removes the auth cookie. Returns { ok: true } on success. Used by the
// admin nav (and eventually the user dashboard) to power a sign-out
// button.

export async function POST() {
  const auth = await getAuthClient()
  await auth.auth.signOut()
  return Response.json({ ok: true })
}
