#!/usr/bin/env tsx
// Scenario 1: concurrent waitlist POSTs with same email, different referrer codes.
// Tests: unique-constraint race, silent duplicate handling, referrer attribution
// when two requests land within the same tick.
//
// Runs 5 email pairs by default. Emails are stress+dup-N@sneakersterminal.com.
// Clean up via /admin/system after.

import { TARGET, stressEmail, timedFetch } from './utils'

const PAIRS = Number(process.env.PAIRS ?? 5)

async function doublePost(email: string) {
  const body1 = { email, source: 'stress-1a', referralCode: 'AAAAAA' }
  const body2 = { email, source: 'stress-1b', referralCode: 'BBBBBB' }
  return Promise.all([
    timedFetch(`${TARGET}/api/waitlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body1),
    }),
    timedFetch(`${TARGET}/api/waitlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body2),
    }),
  ])
}

async function main() {
  console.log(`[01] target=${TARGET} pairs=${PAIRS}`)
  console.log(`[01] scenario: concurrent POST /api/waitlist with same email, different referralCodes`)
  let successBoth = 0
  let oneFailed = 0
  let bothFailed = 0

  for (let i = 0; i < PAIRS; i++) {
    const email = stressEmail('dup', i)
    const [a, b] = await doublePost(email)
    const okA = a.status === 200
    const okB = b.status === 200
    const tag = okA && okB ? '2xx/2xx' : okA || okB ? 'mixed' : 'both-failed'
    console.log(
      `  ${email}  A=${a.status} ${Math.round(a.ms)}ms  B=${b.status} ${Math.round(b.ms)}ms  [${tag}]`,
    )
    if (okA && okB) successBoth++
    else if (okA || okB) oneFailed++
    else bothFailed++
  }

  console.log(`\n[01] result: both-2xx=${successBoth} mixed=${oneFailed} both-failed=${bothFailed}`)
  console.log(
    `[01] note: endpoint silently swallows unique-constraint violation (returns 200). Expected: both-2xx=${PAIRS}, one row per email in DB, only first referralCode attribution persists.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
