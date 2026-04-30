import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Next 16 calls this "Proxy" (was "Middleware" in 15 and earlier). Same file
// contract — single file at the project root, exported function handles every
// matched request.
//
// Two responsibilities:
//
// 1. Subdomain rewrites:
//      admin.sneakersterminal.com/foo  →  /admin/foo
//      app.sneakersterminal.com/foo    →  /dashboard/foo
//      sneakersterminal.com/foo        →  /foo   (unchanged, landing app)
//
// 2. CSRF defense for state-changing /api/* calls:
//    SameSite=Lax cookies block most cross-origin form posts but NOT
//    cross-subdomain ones (admin.* ↔ app.* share a registrable domain).
//    Reject POST/PUT/PATCH/DELETE to /api/* unless the Origin header
//    matches a known-safe host. Server-to-server callers (Stripe webhooks,
//    Vercel cron) don't send Origin and have separate signature/bearer
//    auth — those paths are exempt.
//
// Local dev is untouched — on localhost the proxy no-ops and path-based
// routing works as before.

const APEX_HOSTS = new Set([
  'sneakersterminal.com',
  'www.sneakersterminal.com',
])

const SUBDOMAIN_MAP: Record<string, string> = {
  admin: '/admin',
  app: '/dashboard',
}

// Paths that are SHARED across all subdomains and the apex — auth UI, auth
// callbacks, API routes, and Next internals. The proxy must not prepend the
// subdomain's rewrite root to these, or admin.*/login becomes /admin/login
// (which doesn't exist) and the whole subdomain breaks.
//
// Order matters: longer prefixes first so /api/auth/callback matches /api,
// not /auth.
const SHARED_PATH_PREFIXES = [
  '/api/',
  '/auth/',
  '/_next/',
  '/login',
  '/signup',
  '/r/', // referral redirector — same on every host
  '/favicon',
  '/robots.txt',
  '/sitemap.xml',
]

function isSharedPath(pathname: string): boolean {
  for (const p of SHARED_PATH_PREFIXES) {
    if (pathname === p || pathname.startsWith(p)) return true
  }
  return false
}

// Allowed Origin hostnames for state-changing /api/* requests. Any caller
// presenting an Origin outside this set on a mutating method is rejected.
const CSRF_ALLOWED_ORIGINS = new Set([
  'sneakersterminal.com',
  'www.sneakersterminal.com',
  'admin.sneakersterminal.com',
  'app.sneakersterminal.com',
])

// Routes we skip CSRF on. Either they have signature-based auth (Stripe)
// or bearer-token auth (cron) or are intentionally public read endpoints.
const CSRF_EXEMPT_PREFIXES = [
  '/api/stripe/webhook',
  '/api/credits/webhook',
  '/api/cron/',
]

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function stripPort(host: string): string {
  return host.split(':')[0]
}

function isCsrfSafeOrigin(originHeader: string | null, hostHeader: string): boolean {
  // No Origin header at all → request didn't come from a browser fetch/form.
  // Server-to-server callers (Stripe, cron) and same-origin server actions
  // both fall here. Trust them; they have other auth (signature, bearer).
  if (!originHeader) return true

  let originHost: string
  try {
    originHost = new URL(originHeader).host.toLowerCase()
  } catch {
    return false
  }

  // Strip the port so localhost:3000 origins are recognized as 'localhost'.
  const originHostNoPort = stripPort(originHost)
  const hostNoPort = stripPort(hostHeader.toLowerCase())

  // Allow exact host match (covers preview URLs and any host the request
  // legitimately came from).
  if (originHostNoPort === hostNoPort) return true

  if (CSRF_ALLOWED_ORIGINS.has(originHostNoPort)) return true

  // Vercel preview deployments (*.vercel.app) — accept self-served previews.
  if (originHostNoPort.endsWith('.vercel.app') && hostNoPort.endsWith('.vercel.app')) {
    return true
  }

  // Local dev origins.
  if (originHostNoPort === 'localhost' || originHostNoPort.endsWith('.localhost')) {
    return true
  }

  return false
}

export default function proxy(request: NextRequest) {
  const host = stripPort(request.headers.get('host') ?? '').toLowerCase()
  if (!host) return NextResponse.next()

  // CSRF gate — runs BEFORE the subdomain rewrite so we reject early on
  // cross-origin mutating calls regardless of which host they target.
  const path = request.nextUrl.pathname
  if (
    path.startsWith('/api/') &&
    MUTATING_METHODS.has(request.method) &&
    !CSRF_EXEMPT_PREFIXES.some((p) => path.startsWith(p))
  ) {
    const origin = request.headers.get('origin')
    const hostHeader = request.headers.get('host') ?? ''
    if (!isCsrfSafeOrigin(origin, hostHeader)) {
      return new NextResponse(
        JSON.stringify({ error: 'csrf_origin_rejected' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      )
    }
  }

  // localhost + Vercel preview domains (*.vercel.app) skip subdomain rewriting.
  // On local dev, visit /admin and /dashboard directly; on prod, use the
  // subdomain hostnames.
  if (host.endsWith('.vercel.app') || host === 'localhost' || host.endsWith('.localhost')) {
    return NextResponse.next()
  }

  // Landing on the apex domain — leave it alone.
  if (APEX_HOSTS.has(host)) {
    return NextResponse.next()
  }

  // Only touch *.sneakersterminal.com subdomains.
  if (!host.endsWith('.sneakersterminal.com')) {
    return NextResponse.next()
  }

  const subdomain = host.slice(0, -'.sneakersterminal.com'.length)
  const rewriteRoot = SUBDOMAIN_MAP[subdomain]
  if (!rewriteRoot) {
    // Unknown subdomain — fall through (could 404 if you want, but passing
    // through lets you add a subdomain in DNS + Vercel without redeploying).
    return NextResponse.next()
  }

  // Shared paths (auth UI, auth callbacks, API, Next internals) keep their
  // pathname. Without this, admin.*/login rewrites to /admin/login which
  // doesn't exist, breaking sign-in on every subdomain.
  if (isSharedPath(path)) {
    return NextResponse.next()
  }

  // Prepend the rewrite root to the incoming pathname. The proxy rewrite is
  // internal (URL stays as the subdomain host for the user).
  //
  // Idempotency: if the path ALREADY starts with the rewrite root, don't
  // double-prepend. Lets `<Link href="/admin/users">` and `<Link href="/users">`
  // both work on admin.* — the first because it already maps to the right
  // route file, the second because we add the prefix here. Without this the
  // huge existing pile of /admin/* hrefs would all 404 on the subdomain.
  const url = request.nextUrl.clone()
  if (url.pathname === '/') {
    url.pathname = rewriteRoot
  } else if (url.pathname === rewriteRoot || url.pathname.startsWith(rewriteRoot + '/')) {
    // Already correctly prefixed — no rewrite needed, the path resolves directly.
    return NextResponse.next()
  } else {
    url.pathname = rewriteRoot + url.pathname
  }
  return NextResponse.rewrite(url)
}

export const config = {
  // Match everything except Next internals + static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
