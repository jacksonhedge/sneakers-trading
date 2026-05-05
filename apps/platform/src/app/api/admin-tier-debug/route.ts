import { getAuthClient } from '@/lib/supabase-auth'
import { isAdminEmail as isAdminEmailFromAdminAuth } from '@/lib/admin-auth'

// Debug endpoint: pinpoints where the admin-tier disagreement comes from.
//
// Background: the admin nav at /admin/* uses `requireAdmin()` →
// `isAdminEmail()` from lib/admin-auth.ts, while the cost-cap tier in
// /api/otoole/chat uses a private `isAdminEmail()` inside
// lib/otoole-usage.ts. Both functions parse `process.env.ADMIN_EMAILS`
// the same way, so they should agree. Prod evidence shows they don't.
//
// This endpoint runs both signals against the calling user's email and
// returns enough metadata to tell us which side disagrees, WITHOUT
// leaking the actual emails or env contents. Hit it as the affected
// admin user, eyeball the JSON response.
//
// Auth-only (not admin-only) — gating behind requireAdmin would defeat
// the purpose if the admin gate itself is what's broken.

export async function GET() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }

  // Inline the otoole-usage version of isAdminEmail so we don't need to
  // export the private function. Same parser modulo the trailing filter
  // (otoole-usage uses Boolean, admin-auth requires '@' to be present).
  const rawEnv = process.env.ADMIN_EMAILS ?? ''
  const allowlist = rawEnv
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const isAdminUsage = allowlist.includes(user.email.toLowerCase())

  return Response.json({
    user: {
      id: user.id,
      // Don't echo the email — just enough to verify identity in the
      // response without leaking it to console screenshots.
      emailLen: user.email.length,
      emailDomain: user.email.split('@')[1] ?? null,
      emailFirstChar: user.email[0] ?? null,
    },
    env: {
      isSet: rawEnv.length > 0,
      rawLen: rawEnv.length,
      parsedCount: allowlist.length,
      // Domains only — confirms which list the runtime sees without
      // leaking individual addresses.
      entryDomains: allowlist.map((e) => e.split('@')[1] ?? '?').sort(),
    },
    signals: {
      isAdminAuthLib: isAdminEmailFromAdminAuth(user.email),
      isAdminOtooleUsage: isAdminUsage,
      // True iff the two libraries disagree.
      mismatch:
        isAdminEmailFromAdminAuth(user.email) !== isAdminUsage,
    },
  })
}
