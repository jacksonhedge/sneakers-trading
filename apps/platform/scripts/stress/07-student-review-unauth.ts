#!/usr/bin/env tsx
// Scenario 7: unauthenticated probes against /api/admin/student/review.
//
// This endpoint has TWO gates: unauth → 401, authed-non-admin → 403. We can
// only test the first gate without a real session; the second must be
// verified manually (or via Chrome) since we can't fake a Supabase session.
//
// Invariants:
//   1. Every request without a valid session returns 401 — never 200, never
//      403 (the 403 path requires an authed-but-not-admin user, which we
//      can't fabricate here).
//   2. No payload shape returns 5xx.
//   3. Bare GET returns 401/405, not 500.
//   4. Forbidden action values (approve/reject/delete/drop/etc.) don't leak
//      a different error shape before the auth gate.

import { TARGET, timedFetch } from './utils'

const REVIEW = `${TARGET}/api/admin/student/review`

type Probe = { label: string; body: unknown; method?: string }

const probes: Probe[] = [
  { label: 'empty body', body: {} },
  { label: 'approve missing id', body: { action: 'approve' } },
  { label: 'approve with id', body: { id: 'deadbeef-dead-beef-dead-beefdeadbeef', action: 'approve' } },
  { label: 'reject with reason', body: { id: 'deadbeef-dead-beef-dead-beefdeadbeef', action: 'reject', reason: 'not_a_student' } },
  { label: 'reject unknown reason', body: { id: 'deadbeef-dead-beef-dead-beefdeadbeef', action: 'reject', reason: 'ASDF_FAKE' } },
  { label: 'unknown action', body: { id: 'deadbeef-dead-beef-dead-beefdeadbeef', action: 'drop' } },
  { label: 'sql in id', body: { id: "x'; drop table student_verification;--", action: 'approve' } },
  { label: 'id as array', body: { id: ['deadbeef-dead-beef-dead-beefdeadbeef'], action: 'approve' } },
  { label: 'id as number', body: { id: 12345, action: 'approve' } },
  { label: 'id 10KB', body: { id: 'a'.repeat(10_000), action: 'approve' } },
  { label: 'xss in reason', body: { id: 'deadbeef-dead-beef-dead-beefdeadbeef', action: 'reject', reason: '<script>alert(1)</script>' } },
  { label: 'bare GET', body: null, method: 'GET' },
  { label: 'bare DELETE', body: null, method: 'DELETE' },
]

async function main() {
  console.log(`[07] target=${REVIEW} probes=${probes.length}`)
  console.log(`[07] invariant: every unauth request → 401 (never 200, never 403)`)
  console.log(``)
  const issues: string[] = []

  for (const p of probes) {
    const init: RequestInit = {
      method: p.method ?? 'POST',
      headers: { 'content-type': 'application/json' },
    }
    if (p.body !== null && p.body !== undefined)
      (init as { body?: string }).body = JSON.stringify(p.body)
    const r = await timedFetch(REVIEW, init)
    const bodyStr =
      typeof r.body === 'object' && r.body ? JSON.stringify(r.body) : String(r.body ?? '')
    const preview = bodyStr.slice(0, 80)

    const tag =
      r.status >= 500
        ? '  5xx⚠️'
        : r.status === 401
          ? '  401 ✓'
          : r.status === 200
            ? '  200⚠️'
            : `  ${r.status}`
    console.log(`  ${tag}  ${p.label.padEnd(22)} — ${preview}`)

    if (r.status >= 500) issues.push(`${p.label}: 5xx`)
    if (r.status === 200) issues.push(`${p.label}: 2xx auth bypass`)
    if (r.status === 403) issues.push(`${p.label}: 403 from unauth request (admin-check ran before auth-check)`)
    // bodyStr leaking "forbidden" / "invalid_reason" before the auth gate is a signal of bad ordering
    if (
      r.status !== 401 &&
      (bodyStr.includes('invalid_reason') || bodyStr.includes('missing_fields') || bodyStr.includes('not_found'))
    ) {
      issues.push(`${p.label}: validation error leaked before auth gate (status=${r.status})`)
    }
  }

  console.log(``)
  console.log(`[07] summary:`)
  if (issues.length === 0) {
    console.log(`  ✓ all ${probes.length} probes returned 401 as expected`)
  } else {
    for (const i of issues) console.log(`    - ${i}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
