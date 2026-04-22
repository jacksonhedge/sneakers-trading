#!/usr/bin/env tsx
// Scenario 3: probe /api/auth/request-link with random invite codes.
// Measures: response-time distribution for (email-doesn't-exist) vs
// (email-exists-but-bad-code) vs (malformed-code). If the service differentiates
// timing, an attacker can enumerate waitlist emails. Spec says all failures
// return `invite_invalid` — we want the wall-clock times also indistinguishable.
//
// Uses stress+probe-*@sneakersterminal.com (does not exist on waitlist).
// NO rows are created — /api/auth/request-link only reads, then triggers OTP only on valid invite.

import { TARGET, stressEmail, timedFetch, summarize } from './utils'

const N = Number(process.env.N ?? 20)

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomCode(len = 8): string {
  let s = ''
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

async function probe(email: string, code: string) {
  return timedFetch(`${TARGET}/api/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
}

async function main() {
  console.log(`[03] target=${TARGET} n=${N}`)
  console.log(`[03] scenario: probe /api/auth/request-link with random 8-char codes`)

  const bucketNoEmail: number[] = []
  const bucketMalformed: number[] = []
  const statuses = new Map<number, number>()
  const errors = new Map<string, number>()

  for (let i = 0; i < N; i++) {
    const email = stressEmail('probe', i)
    const code = randomCode()
    const r = await probe(email, code)
    statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1)
    bucketNoEmail.push(r.ms)
    const errTag = typeof r.body === 'object' && r.body && 'error' in r.body
      ? String((r.body as { error: unknown }).error)
      : 'no-body'
    errors.set(errTag, (errors.get(errTag) ?? 0) + 1)
  }

  for (let i = 0; i < N; i++) {
    const email = stressEmail('probe', `mal-${i}`)
    const r = await probe(email, 'XX')
    bucketMalformed.push(r.ms)
    statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1)
  }

  const sumEmail = summarize(bucketNoEmail)
  const sumMal = summarize(bucketMalformed)

  console.log(`\n[03] timing — random 8-char code, nonexistent email:`)
  console.log(`  n=${sumEmail.n}  p50=${sumEmail.p50}ms  p95=${sumEmail.p95}ms  max=${sumEmail.max}ms`)
  console.log(`[03] timing — malformed code (fails format check first):`)
  console.log(`  n=${sumMal.n}  p50=${sumMal.p50}ms  p95=${sumMal.p95}ms  max=${sumMal.max}ms`)

  console.log(`\n[03] status distribution:`)
  for (const [s, n] of [...statuses.entries()].sort()) {
    console.log(`  ${s}: ${n}`)
  }
  console.log(`[03] error codes returned:`)
  for (const [e, n] of [...errors.entries()].sort()) {
    console.log(`  ${e}: ${n}`)
  }

  console.log(`\n[03] leak signal:`)
  const gap = Math.abs(sumEmail.p50 - sumMal.p50)
  if (gap > 50) {
    console.log(`  p50 gap is ${gap}ms — exploitable oracle if the pattern holds.`)
  } else {
    console.log(`  p50 gap is ${gap}ms — negligible, no timing-oracle signal.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
