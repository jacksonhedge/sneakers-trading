import { redirect } from 'next/navigation'
import { getAuthClient } from './supabase-auth'

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes('@'))
}

export function getAdminEmails(): string[] {
  return parseAllowlist(process.env.ADMIN_EMAILS)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = getAdminEmails()
  return allowed.includes(email.toLowerCase())
}

/**
 * Server-side admin guard for layouts and pages.
 * Redirects non-authed users to /signup, non-admins to /dashboard.
 * Returns the admin user's email when the caller is authorized.
 */
export async function requireAdmin(): Promise<{ email: string }> {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    redirect('/signup?next=/admin')
  }
  if (!isAdminEmail(user.email)) {
    redirect('/dashboard?error=not_admin')
  }
  return { email: user.email }
}
