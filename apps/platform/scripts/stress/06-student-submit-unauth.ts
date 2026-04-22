#!/usr/bin/env tsx
// Scenario 6: unauthenticated + garbage-input probes against /api/student/submit.
//
// Invariants verified:
//   1. Every request without a valid session returns 401 (no 200, no 500, no
//      400 that would leak "validation order" ahead of the auth gate).
//   2. No payload shape causes a 5xx — resilient to malformed JSON, wrong
//      types, oversized strings.
//   3. Bare GET returns 401/405, not 500.
//   4. Response body never echoes attacker input verbatim (prevents DOM-XSS
//      via error message routing).
//
// Creates no DB rows — the auth gate fires before any insert.

import { TARGET, timedFetch } from './utils'

const SUBMIT = `${TARGET}/api/student/submit`

const bigEmail = 'a'.repeat(10_000) + '@harvard.edu'
const bigLinkedIn = 'https://linkedin.com/in/' + 'a'.repeat(5_000)
const bigInsta = 'a'.repeat(5_000)

type Probe = {
  label: string
  body: unknown
  method?: string
}

// Probe matrix spans:
//  - every field missing / null / wrong-type
//  - oversized inputs (10KB+)
//  - foreign .edu, bogus .edu variants
//  - grad_year edge cases (NaN, Infinity, negatives, far past/future, strings)
//  - Instagram handles that try to smuggle URL parts or double-at-sign
//  - LinkedIn URLs with arbitrary subdomains
//  - stored-XSS payloads in fields that admin UI renders
//  - SQL-ish payloads (parameterized queries protect; still test resilience)
const probes: Probe[] = [
  // Empty and malformed bodies
  { label: 'empty body', body: {} },
  { label: 'only edu_email', body: { edu_email: 'foo@harvard.edu' } },
  { label: 'only instagram', body: { instagram_handle: 'foo' } },
  { label: 'only linkedin', body: { linkedin_url: 'https://linkedin.com/in/foo' } },
  { label: 'only grad_year', body: { grad_year: 2027 } },

  // Wrong types on edu_email
  { label: 'edu null', body: { edu_email: null, instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'edu number', body: { edu_email: 12345, instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'edu array', body: { edu_email: ['foo@harvard.edu'], instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'edu object', body: { edu_email: { toString: () => 'foo@harvard.edu' }, instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'edu boolean', body: { edu_email: true, instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'edu 10KB', body: { edu_email: bigEmail, instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'edu unicode', body: { edu_email: 'тест@пример.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },

  // Foreign / bogus .edu
  { label: 'edu foreign .edu.au', body: { edu_email: 'foo@sydney.edu.au', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'edu fake tld edu.co', body: { edu_email: 'foo@attacker.edu.co', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'edu subdomain .edu', body: { edu_email: 'foo@mail.harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'edu not .edu', body: { edu_email: 'foo@example.com', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'edu unknown .edu', body: { edu_email: 'foo@tinyschool.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },

  // grad_year edge cases
  { label: 'year NaN', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: NaN } },
  { label: 'year Infinity', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: Infinity } },
  { label: 'year negative', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: -2027 } },
  { label: 'year far past', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 1900 } },
  { label: 'year far future', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2100 } },
  { label: 'year string', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: '2027' } },
  { label: 'year boolean', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: true } },
  { label: 'year null', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: null } },

  // Instagram handle smuggling
  { label: 'ig url prefix', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'https://instagram.com/foo?ref=bar', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'ig double at', body: { edu_email: 'foo@harvard.edu', instagram_handle: '@@foo', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'ig consecutive dots', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'foo...bar', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'ig 5KB', body: { edu_email: 'foo@harvard.edu', instagram_handle: bigInsta, linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'ig empty', body: { edu_email: 'foo@harvard.edu', instagram_handle: '', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },

  // LinkedIn URL edge cases
  { label: 'li subdomain evil', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://evil.linkedin.com/in/foo', grad_year: 2027 } },
  { label: 'li feed url', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/feed/', grad_year: 2027 } },
  { label: 'li not linkedin', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://not-linkedin.com/foo', grad_year: 2027 } },
  { label: 'li http', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'http://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'li 5KB', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: bigLinkedIn, grad_year: 2027 } },

  // Stored-XSS payloads in rendered fields
  { label: 'xss in edu', body: { edu_email: '<script>alert(1)</script>@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'xss in insta', body: { edu_email: 'foo@harvard.edu', instagram_handle: '<img src=x onerror=alert(1)>', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'xss in linkedin', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/"><script>alert(1)</script>', grad_year: 2027 } },

  // SQL-ish (parameterized, but still test resilience)
  { label: 'sql in edu', body: { edu_email: "x'; drop table student_verification;--@harvard.edu", instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },
  { label: 'sql in insta', body: { edu_email: 'foo@harvard.edu', instagram_handle: "a' OR '1'='1", linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027 } },

  // Prototype-pollution attempts (just to verify the parser doesn't explode)
  { label: 'proto __proto__', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027, __proto__: { admin: true } } },
  { label: 'proto constructor', body: { edu_email: 'foo@harvard.edu', instagram_handle: 'a', linkedin_url: 'https://linkedin.com/in/a', grad_year: 2027, constructor: { prototype: { admin: true } } } },

  // Wrong methods
  { label: 'bare GET', body: null, method: 'GET' },
  { label: 'bare DELETE', body: null, method: 'DELETE' },
  { label: 'bare PUT', body: null, method: 'PUT' },
]

type Outcome = {
  label: string
  method: string
  status: number
  ms: number
  bodyShape: string
  echoesInput: boolean
}

async function main() {
  console.log(`[06] target=${SUBMIT} probes=${probes.length}`)
  console.log(`[06] invariant: every request is unauthenticated → every response must be 401`)
  console.log(``)

  const results: Outcome[] = []
  const issues: string[] = []

  for (const p of probes) {
    const init: RequestInit = {
      method: p.method ?? 'POST',
      headers: { 'content-type': 'application/json' },
    }
    if (p.body !== null && p.body !== undefined) {
      ;(init as { body?: string }).body = JSON.stringify(p.body)
    }
    const r = await timedFetch(SUBMIT, init)
    const bodyStr =
      typeof r.body === 'object' && r.body ? JSON.stringify(r.body) : String(r.body ?? '')
    const preview = bodyStr.slice(0, 80)

    // Information-leak check: if any probe returns a validation error message,
    // that means the endpoint did input validation before auth.
    const leaks =
      r.status === 400 ||
      bodyStr.toLowerCase().includes('edu_email_required') ||
      bodyStr.toLowerCase().includes('invalid_instagram') ||
      bodyStr.toLowerCase().includes('invalid_linkedin') ||
      bodyStr.toLowerCase().includes('invalid_grad_year') ||
      bodyStr.toLowerCase().includes('missing_fields')

    // Echo check: response body should not contain the raw input strings.
    const inputStrings: string[] = []
    if (p.body && typeof p.body === 'object') {
      const b = p.body as Record<string, unknown>
      for (const v of Object.values(b)) {
        if (typeof v === 'string' && v.length > 0 && v.length < 200) inputStrings.push(v)
      }
    }
    const echoes = inputStrings.some(
      (s) => s.length > 5 && bodyStr.toLowerCase().includes(s.toLowerCase()),
    )

    const tag =
      r.status >= 500
        ? '  5xx⚠️'
        : r.status === 401
          ? '  401 ✓'
          : r.status === 405
            ? '  405'
            : r.status === 200
              ? '  200⚠️'
              : `  ${r.status}`

    console.log(`  ${tag}  ${p.label.padEnd(24)} — ${preview}`)
    results.push({
      label: p.label,
      method: p.method ?? 'POST',
      status: r.status,
      ms: r.ms,
      bodyShape: preview,
      echoesInput: echoes,
    })

    if (r.status >= 500) issues.push(`${p.label}: 5xx (${r.status})`)
    if (r.status === 200) issues.push(`${p.label}: 2xx (auth bypass?) status=${r.status}`)
    if (leaks && r.status !== 401)
      issues.push(`${p.label}: leaked validation string before auth gate (status=${r.status})`)
    if (echoes)
      issues.push(`${p.label}: response body echoed raw input (potential reflection/XSS vector)`)
  }

  // Aggregate summary
  const byStatus = new Map<number, number>()
  for (const r of results) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1)

  console.log(``)
  console.log(`[06] summary:`)
  for (const [status, count] of [...byStatus.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${status}: ${count}`)
  }
  if (issues.length === 0) {
    console.log(`  ✓ all ${probes.length} probes handled cleanly`)
  } else {
    console.log(`  ${issues.length} issue(s):`)
    for (const i of issues) console.log(`    - ${i}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
