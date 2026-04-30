import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
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

// When the admin gate fails on the admin.* subdomain, redirecting to a
// path like /dashboard 404s — the proxy rewrites it to /admin/dashboard
// which doesn't exist. Use an absolute apex URL so the user lands on the
// actual dashboard host.
async function apexUrl(path: string): Promise<string> {
  const hdrs = await headers()
  const host = (hdrs.get('host') ?? '').toLowerCase()
  if (host.startsWith('admin.') || host.startsWith('app.')) {
    const apex = host.replace(/^(admin|app)\./, '')
    return `https://${apex}${path}`
  }
  return path
}

/**
 * Server-side admin guard for layouts and pages.
 * Redirects non-authed users to /login (with next= pointing back at the
 * page they tried to reach), non-admins to apex /dashboard.
 * Returns the admin user's email when the caller is authorized.
 */
export async function requireAdmin(): Promise<{ email: string }> {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    // The proxy sets x-pathname to the original request path on every
    // forwarded request, so we can preserve it through the redirect.
    // Falls back to /admin if the header isn't present (direct invocation).
    const hdrs = await headers()
    const path = hdrs.get('x-pathname') ?? '/admin'
    redirect(`/login?next=${encodeURIComponent(path)}`)
  }
  if (!isAdminEmail(user.email)) {
    redirect(await apexUrl('/dashboard?error=not_admin'))
  }
  return { email: user.email }
}
