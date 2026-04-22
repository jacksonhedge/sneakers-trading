#!/usr/bin/env tsx
// Scenario 4: self-referral.
// 1. POST /api/waitlist with an email to create row + referral_code.
// 2. Read that row's referral_code from the admin/DB (skipped here — we can't
//    reach DB from outside, so we derive the referral_code indirectly by
//    re-POSTing with the same email and a junk code, then verify via DB after
//    via /admin/users search).
//
// Simplified version: POST with email=stress+self-N, referralCode=<fake>.
// Then POST with email=stress+selfchild-N referring to a code we just looked up.
// Since we can't read DB here, this script just exercises the app-layer
// self-check: POST with the SAME email as the owner of a given referral_code.
//
// To actually verify: after running, open /admin/users/<row>/ and confirm
// referred_by_code is null (if self-referred) or correct (if cross-referred).

import { TARGET, stressEmail, timedFetch } from './utils'

async function waitlistPost(email: string, referralCode?: string) {
  return timedFetch(`${TARGET}/api/waitlist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, source: 'stress-self', referralCode }),
  })
}

async function main() {
  console.log(`[04] target=${TARGET}`)
  console.log(`[04] scenario: self-referral attempts + cross-referral sanity`)

  // Create an initial row so we have a real referral_code in the DB.
  const anchor = stressEmail('self', 'anchor')
  const r0 = await waitlistPost(anchor)
  console.log(`  [step 1] signup ${anchor} — status ${r0.status} ${Math.round(r0.ms)}ms`)

  // Self-referral attempt: POST with the same email AND a fake referralCode.
  // We can't know the real referral_code for `anchor` without DB access, but
  // we can test that random invalid codes don't attach. The real self-loop
  // test requires DB inspection post-run via /admin.
  const r1 = await waitlistPost(anchor, 'ZZZZZZ')
  console.log(`  [step 2] re-POST same email with fake ref — status ${r1.status} ${Math.round(r1.ms)}ms (duplicate expected, silent 200)`)

  // Cross-referral: different email, uses an invalid code (should not attribute).
  const child = stressEmail('self', 'child')
  const r2 = await waitlistPost(child, 'NOTREAL')
  console.log(`  [step 3] signup ${child} with invalid ref — status ${r2.status} ${Math.round(r2.ms)}ms`)

  console.log(`\n[04] verify manually at /admin/users (search "stress+self"):`)
  console.log(`  - anchor row should exist with referred_by_code = null`)
  console.log(`  - anchor row should NOT have double-counted any referrals`)
  console.log(`  - child row should exist with referred_by_code = null (invalid code rejected)`)
  console.log(`  - if anchor.referred_by_code == anchor.referral_code, the self-ref check FAILED`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
