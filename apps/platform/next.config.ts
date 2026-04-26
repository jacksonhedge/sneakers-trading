import type { NextConfig } from 'next'

// Security headers applied to every response. Closes audit LOW #5
// (no CSP / HSTS / clickjacking defense).
//
// CSP notes:
//   - script-src + style-src include 'unsafe-inline' / 'unsafe-eval' because
//     Next 16 + Tailwind emit inline scripts (hydration bootstrap) and inline
//     styles. Tightening to a nonce-based policy is a follow-up — would need
//     middleware to set a per-request nonce and the framework to honor it.
//   - connect-src is broad ('self' + https: + wss:) so Supabase realtime,
//     Stripe checkout redirect, and any Vercel-hosted backend calls just work.
//   - frame-ancestors 'none' blocks clickjacking. Combined with the legacy
//     X-Frame-Options: DENY this works across browser versions.
//   - form-action 'self' stops a phishing site from POSTing forms to our
//     domain to harvest sessions cross-origin.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  'upgrade-insecure-requests',
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },
}

export default nextConfig
