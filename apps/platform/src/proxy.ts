import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Next 16 calls this "Proxy" (was "Middleware" in 15 and earlier). Same file
// contract — single file at the project root, exported function handles every
// matched request.
//
// Purpose: subdomain-based routing for sneakersterminal.com.
//
//   admin.sneakersterminal.com/foo  →  /admin/foo
//   app.sneakersterminal.com/foo    →  /dashboard/foo
//   sneakersterminal.com/foo        →  /foo   (unchanged, landing app)
//
// This keeps the dashboard (operator-facing, Bloomberg terminal) and admin
// console on isolated hostnames while sharing one Next.js build. Local dev
// is untouched — on localhost the proxy no-ops and path-based routing works
// as before (use /admin and /dashboard directly).

const APEX_HOSTS = new Set([
  'sneakersterminal.com',
  'www.sneakersterminal.com',
])

const SUBDOMAIN_MAP: Record<string, string> = {
  admin: '/admin',
  app: '/dashboard',
}

function stripPort(host: string): string {
  return host.split(':')[0]
}

export function proxy(request: NextRequest) {
  const host = stripPort(request.headers.get('host') ?? '').toLowerCase()
  if (!host) return NextResponse.next()

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

  // Prepend the rewrite root to the incoming pathname. The proxy rewrite is
  // internal (URL stays as the subdomain host for the user).
  const url = request.nextUrl.clone()
  if (url.pathname === '/') {
    url.pathname = rewriteRoot
  } else {
    url.pathname = rewriteRoot + url.pathname
  }
  return NextResponse.rewrite(url)
}

export const config = {
  // Match everything except Next internals + static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
