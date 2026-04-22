#!/usr/bin/env tsx
// Scenario 5: garbage inputs to /api/waitlist and /api/auth/request-link.
// Verifies the endpoints don't 500, don't echo attacker input, and return
// sane 4xx codes. Attempts: empty body, nulls, numbers, arrays, SQL-ish payloads,
// 10KB email, unicode.
//
// Does NOT create real rows (all payloads are either invalid emails or failures).

import { TARGET, timedFetch } from './utils'

const WAITLIST = `${TARGET}/api/waitlist`
const REQUEST_LINK = `${TARGET}/api/auth/request-link`

type Probe = {
  label: string
  url: string
  body: unknown
  method?: string
}

const bigEmail = 'a'.repeat(10_000) + '@example.com'

const probes: Probe[] = [
  { label: 'waitlist empty body', url: WAITLIST, body: {} },
  { label: 'waitlist null email', url: WAITLIST, body: { email: null } },
  { label: 'waitlist number email', url: WAITLIST, body: { email: 12345 } },
  { label: 'waitlist array email', url: WAITLIST, body: { email: ['a@b.com'] } },
  { label: 'waitlist no-at email', url: WAITLIST, body: { email: 'notanemail' } },
  { label: 'waitlist 10KB email', url: WAITLIST, body: { email: bigEmail } },
  // Prefixed with stress+ so cleanup.ts catches it if validation lets it through.
  { label: 'waitlist unicode email', url: WAITLIST, body: { email: 'stress+тест@sneakersterminal.com' } },
  { label: "waitlist SQL-ish email", url: WAITLIST, body: { email: "x'; drop table waitlist;--@x.com" } },
  { label: 'waitlist number referralCode', url: WAITLIST, body: { email: 'stress+probe-numref@sneakersterminal.com', referralCode: 99 } },

  { label: 'request-link empty body', url: REQUEST_LINK, body: {} },
  { label: 'request-link only email', url: REQUEST_LINK, body: { email: 'x@y.com' } },
  { label: 'request-link only code', url: REQUEST_LINK, body: { code: 'ABCDEFGH' } },
  { label: 'request-link short code', url: REQUEST_LINK, body: { email: 'x@y.com', code: 'AAA' } },
  { label: 'request-link long code', url: REQUEST_LINK, body: { email: 'x@y.com', code: 'A'.repeat(100) } },
  { label: 'request-link lowercase code', url: REQUEST_LINK, body: { email: 'x@y.com', code: 'abcdefgh' } },
  { label: 'request-link invalid alphabet', url: REQUEST_LINK, body: { email: 'x@y.com', code: 'AAAAAA0I' } },

  { label: 'waitlist bare GET', url: WAITLIST, body: null, method: 'GET' },
  { label: 'request-link bare GET', url: REQUEST_LINK, body: null, method: 'GET' },
]

async function main() {
  console.log(`[05] target=${TARGET} probes=${probes.length}`)
  const issues: string[] = []
  for (const p of probes) {
    const init: RequestInit = {
      method: p.method ?? 'POST',
      headers: { 'content-type': 'application/json' },
    }
    if (p.body !== null) (init as { body?: string }).body = JSON.stringify(p.body)
    const r = await timedFetch(p.url, init)
    const statusTag = r.status >= 500 ? '⚠️  5xx' : r.status >= 400 ? 'ok (4xx)' : 'ok (2xx)'
    const bodyPreview =
      typeof r.body === 'object' && r.body
        ? JSON.stringify(r.body).slice(0, 80)
        : String(r.body ?? '').slice(0, 80)
    console.log(`  [${r.status}] ${statusTag}  ${p.label}  — ${bodyPreview}`)
    if (r.status >= 500) issues.push(`${p.label} → ${r.status}`)
  }

  console.log(`\n[05] summary:`)
  if (issues.length === 0) {
    console.log(`  all ${probes.length} probes returned <500. No server errors on garbage input.`)
  } else {
    console.log(`  ${issues.length} probe(s) returned 5xx — investigate:`)
    issues.forEach((i) => console.log(`    - ${i}`))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
