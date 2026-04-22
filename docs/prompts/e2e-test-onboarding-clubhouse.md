# Claude Code prompt — E2E test onboarding + Clubhouse auto-invite

Paste this whole block into a fresh Claude Code session (`cd ~/sneakers-trading && claude`) and let it rip. It exercises everything we shipped in the 2026-04-22 session: admin bypass, `/login` flow, tighter email validation, Clubhouse graduation, admin console, and stress-cleanup.

The test uses tagged test emails (`stress+etoe-*@sneakersterminal.com`) and cleans up at the end. It hits **production** by default (`https://sneakersterminal.com`), but swap `TARGET` at the top if you want to run against a preview or localhost.

---

You are testing the Sneakers Terminal onboarding + admin flow end-to-end. The goal is to confirm every path works as designed and to surface any regressions. Report findings in a punch list at the end — fail any scenario that produces unexpected output.

## Setup

```bash
cd ~/sneakers-trading/apps/platform
export TARGET="${TARGET:-https://sneakersterminal.com}"
echo "Testing against $TARGET"
```

Make sure `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (you'll need direct DB access for verification). If not present, stop and tell the user.

Also confirm the deployed branch includes the Clubhouse commit (it should be at or past `00258c1` on `feat/platform-scaffold`).

```bash
git log origin/feat/platform-scaffold --oneline -5
```

## Reference data

- **Admin email:** `jacksonfitzgerald25@gmail.com` (will take the admin-bypass path; don't use it for referral tests)
- **Test emails:** `stress+etoe-1@sneakersterminal.com` through `stress+etoe-6@sneakersterminal.com`
- **Referral code alphabet:** `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I)
- All rows matching `stress+%` get wiped at the end via `pnpm admin:stress:cleanup`.

## Test scenarios

For each, write what you did, the observed response, and PASS / FAIL / INVESTIGATE.

### 1. Email validation (fast negative-case sweep)

Curl each of these to `$TARGET/api/waitlist` and verify **every one returns HTTP 400 with `{"error":"invalid_email"}`**. None should create DB rows.

```bash
for payload in \
  '{}' \
  '{"email":null}' \
  '{"email":12345}' \
  '{"email":["a@b.com"]}' \
  '{"email":"notanemail"}' \
  '{"email":" spaces@x.com"}' \
  '{"email":"nodot@hostonly"}' \
  "{\"email\":\"$(python3 -c 'print("a"*260)')@x.com\"}" \
  '{"email":"x'"'"'; drop table waitlist;--@x.com"}' ; do
  echo "---"
  echo "POST: $payload"
  curl -sS -X POST "$TARGET/api/waitlist" -H 'content-type: application/json' -d "$payload" -w "\nHTTP %{http_code}\n"
done
```

Then verify DB has **zero** rows matching any of those emails:

```bash
pnpm exec tsx -e "
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data } = await s.from('waitlist').select('email').or(\"email.ilike.%notanemail%,email.ilike.%nodot%,email.ilike.%drop table%,email.ilike.%aaaaaaaaaa%\")
console.log('leaked rows:', data?.length ?? 0, data)
"
```

Expected: `leaked rows: 0`.

### 2. Landing form — new email path

Direct POST:
```bash
curl -sS -X POST "$TARGET/api/waitlist" \
  -H 'content-type: application/json' \
  -d '{"email":"stress+etoe-1@sneakersterminal.com","source":"etoe"}' \
  -w "\nHTTP %{http_code}\n"
```

Expect `{"ok":true,"existing":false}` and HTTP 200.

Verify DB row exists with a 6-char `referral_code`, `referred_by_code` null, counters 0, `invite_code` null.

### 3. Landing form — existing email path

POST the **same** email again:
```bash
curl -sS -X POST "$TARGET/api/waitlist" \
  -H 'content-type: application/json' \
  -d '{"email":"stress+etoe-1@sneakersterminal.com","source":"etoe"}' \
  -w "\nHTTP %{http_code}\n"
```

Expect `{"ok":true,"existing":true}`. The DB should still have exactly one row for that email. Note: landing page JS would redirect the user to `/login?email=...` on this response; we're just verifying the server contract here.

### 4. `/login` page — waitlist state renders Clubhouse progress

Fetch the HTML for `$TARGET/login?email=stress+etoe-1@sneakersterminal.com` and grep for key strings:

```bash
html="$(curl -sS "$TARGET/login?email=stress%2Betoe-1%40sneakersterminal.com")"
for snippet in "You&#x27;re on the waitlist" "UNLOCK ACCESS" "Refer 1 person" "Refer 2 people" "You have" "referral" ; do
  grep -q "$snippet" <<< "$html" && echo "FOUND: $snippet" || echo "MISSING: $snippet"
done
```

All snippets must be FOUND. (Note the HTML-entity-encoded apostrophe in `You're`.)

### 5. Admin bypass

```bash
curl -sS -X POST "$TARGET/api/waitlist" \
  -H 'content-type: application/json' \
  -d '{"email":"jacksonfitzgerald25@gmail.com","source":"etoe"}' \
  -w "\nHTTP %{http_code}\n"
```

Expect `{"ok":true,"admin":true}`. No new DB row should appear for this email beyond what's already there. Check:

```bash
pnpm exec tsx -e "
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { count } = await s.from('waitlist').select('*', { count: 'exact', head: true }).eq('email', 'jacksonfitzgerald25@gmail.com')
console.log('admin rows:', count)
"
```

`admin rows` should be 0 or 1, not 2 (the bypass skips the insert). Also check the server logs or Supabase Auth audit for a magic-link request firing on that email.

**If** `ADMIN_EMAILS` is not yet set in Vercel Production, this scenario will FAIL — the response will be `{"ok":true,"existing":true|false}` and no admin path triggers. Flag it but continue.

### 6. `/api/auth/login` — state resolution

Hit `/api/auth/login` for each scenario:

```bash
# Admin
curl -sS -X POST "$TARGET/api/auth/login" -H 'content-type: application/json' -d '{"email":"jacksonfitzgerald25@gmail.com"}'
# Waitlist-only (no invite)
curl -sS -X POST "$TARGET/api/auth/login" -H 'content-type: application/json' -d '{"email":"stress+etoe-1@sneakersterminal.com"}'
# Not on waitlist
curl -sS -X POST "$TARGET/api/auth/login" -H 'content-type: application/json' -d '{"email":"stress+etoe-never@sneakersterminal.com"}' -w "\nHTTP %{http_code}\n"
# Malformed
curl -sS -X POST "$TARGET/api/auth/login" -H 'content-type: application/json' -d '{"email":"notanemail"}' -w "\nHTTP %{http_code}\n"
```

Expected responses:
- Admin → `{"ok":true,"status":"magic_link_sent","to":"/admin"}`
- Waitlist-only → `{"status":"waitlist_only"}`
- Not on waitlist → HTTP 404, `{"status":"not_found"}`
- Malformed → HTTP 400, `{"status":"invalid_email"}`

**Crucially**, the waitlist-only response must NOT contain the user's `invite_code` field. We collapsed that in a recent fix.

### 7. Clubhouse auto-invite — next-day tier

This needs a referred signup where the referrer's row is older than 24h. In production we probably don't have such a test setup; **skip the 24h test**, note it in the report as "not tested without manual setup", and move to the instant tier.

### 8. Clubhouse auto-invite — instant tier (refer 2 → invite)

Set up the chain:
1. Create referrer row `stress+etoe-referrer@sneakersterminal.com` — expect `invite_code=null`, `direct_referrals=0`.
2. Read its `referral_code` from DB.
3. Sign up two new emails with that referral code:
   - `stress+etoe-child-1@sneakersterminal.com`
   - `stress+etoe-child-2@sneakersterminal.com`
4. After the second child's signup, the referrer's `direct_referrals` should be 2 and the auto-invite should have fired (fire-and-forget, so it may take a second or two).
5. Re-read the referrer's row — `invite_code` should now be non-null, `invited_at` recent.

Script:

```bash
pnpm exec tsx -e "
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const TARGET = process.env.TARGET ?? 'https://sneakersterminal.com'
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Step 1: create referrer
await fetch(TARGET + '/api/waitlist', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'stress+etoe-referrer@sneakersterminal.com', source: 'etoe' }),
})
await new Promise(r => setTimeout(r, 500))

// Step 2: read the referral code
const { data: refRow } = await s.from('waitlist').select('referral_code, direct_referrals, invite_code').eq('email', 'stress+etoe-referrer@sneakersterminal.com').single()
console.log('referrer after signup:', refRow)
const code = refRow.referral_code

// Step 3: two referred signups
for (const child of ['stress+etoe-child-1@sneakersterminal.com', 'stress+etoe-child-2@sneakersterminal.com']) {
  const res = await fetch(TARGET + '/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: child, source: 'etoe', referralCode: code }),
  })
  console.log('child', child, 'status', res.status)
  await new Promise(r => setTimeout(r, 500))
}

// Step 4-5: wait for fire-and-forget, then re-read referrer
await new Promise(r => setTimeout(r, 2000))
const { data: after } = await s.from('waitlist').select('referral_code, direct_referrals, invite_code, invited_at, invite_used_at').eq('email', 'stress+etoe-referrer@sneakersterminal.com').single()
console.log('referrer after 2 referrals:', after)
if (after.direct_referrals !== 2) console.error('FAIL: direct_referrals should be 2, got', after.direct_referrals)
if (!after.invite_code) console.error('FAIL: invite_code should be set (auto-invite), got null')
if (after.invite_used_at) console.error('FAIL: invite_used_at should be null (not burned yet)')
"
```

PASS criteria: `direct_referrals=2`, `invite_code` is non-null 8-char code, `invite_used_at=null`.

### 9. `/login` page picks up auto-invite on page load

After Scenario 8 ran, fetch `/login?email=stress+etoe-referrer@sneakersterminal.com` and grep for "off the waitlist" (the invited-state card header):

```bash
html="$(curl -sS "$TARGET/login?email=stress%2Betoe-referrer%40sneakersterminal.com")"
grep -q "off the waitlist" <<< "$html" && echo "PASS: shows invited card" || echo "FAIL: still shows waitlist card"
grep -q "CONTINUE TO SIGN IN" <<< "$html" && echo "PASS: has signup CTA" || echo "FAIL: no signup CTA"
```

### 10. Cap enforcement (conceptual — don't actually max it)

The code caps at `MAX_AUTO_INVITES` (default 100, counts all invites including admin-issued). Don't run this against prod — just verify the code path:

```bash
grep -n "MAX_AUTO_INVITES\|cap_reached" src/lib/auto-invite.ts
```

Confirm both references exist in the file.

### 11. Self-referral defense

```bash
# Get referrer's referral_code first
pnpm exec tsx -e "
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data } = await s.from('waitlist').select('referral_code').eq('email', 'stress+etoe-1@sneakersterminal.com').single()
console.log('stress+etoe-1 code:', data.referral_code)
"
```

Take that code and try to self-refer:

```bash
# Replace <CODE> with the code from the step above
curl -sS -X POST "$TARGET/api/waitlist" \
  -H 'content-type: application/json' \
  -d '{"email":"stress+etoe-1@sneakersterminal.com","referralCode":"<CODE>"}' \
  -w "\nHTTP %{http_code}\n"
```

Then verify the row's `referred_by_code` is still null:

```bash
pnpm exec tsx -e "
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data } = await s.from('waitlist').select('referred_by_code').eq('email', 'stress+etoe-1@sneakersterminal.com').single()
console.log('referred_by_code (should be null):', data.referred_by_code)
"
```

### 12. `/admin` guards non-admin

Hit `/admin` unauthenticated:

```bash
curl -sS -I "$TARGET/admin" | grep -i location
```

Expect a 307/302 redirect to `/signup?next=/admin` (unauth path). We can't easily test the authed-but-not-admin path from curl without a session cookie — note in the report as "manual-check: log in as non-admin, visit /admin, expect redirect to /dashboard?error=not_admin".

### 13. Cleanup

```bash
pnpm admin:stress:cleanup
```

Confirm output shows the deleted rows:
- `stress+etoe-1@sneakersterminal.com`
- `stress+etoe-referrer@sneakersterminal.com`
- `stress+etoe-child-1@sneakersterminal.com`
- `stress+etoe-child-2@sneakersterminal.com`

Any other test rows from scenarios 1/5 should also be deleted (the cleanup matches `stress+%` or `stress-%`). Verify DB has zero matching rows:

```bash
pnpm exec tsx -e "
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { count } = await s.from('waitlist').select('*', { count: 'exact', head: true }).or('email.like.stress+%,email.like.stress-%,email.like.%etoe%')
console.log('remaining stress rows (expect 0):', count)
"
```

## Manual steps to finish the report

The parts a browser-less Claude Code can't do on its own — include these as "needs-human" items in your report:

1. **Magic-link email delivery** — Sign in as `jacksonfitzgerald25@gmail.com` via `/login` UI, click the link in Gmail. Confirm:
   - Email is styled (Wimbledon green, not the plain Supabase default) — only if `docs/prompts/supabase-magic-link-template.md` has been applied
   - Clicking the link lands on `/admin` authenticated
2. **Admin console UI** — log in as admin, click through Overview / Users / Invites / Analytics / System tabs. Verify the `stress+etoe-*` referrer shows up on Users with their invite code in the Invites tab before cleanup runs.
3. **Stress-cleanup button** on `/admin/system` — alternative to the CLI; confirm it deletes the same rows.

## Report format

At the end, write a punch list:

```
SCENARIO                           | STATUS       | NOTES
-----------------------------------+--------------+-------------------------------
 1. Email validation sweep         | PASS / FAIL  | ...
 2. New-email waitlist insert      | PASS / FAIL  | ...
 3. Existing-email dedup           | PASS / FAIL  | ...
 4. /login Clubhouse UI renders    | PASS / FAIL  | ...
 5. Admin bypass                   | PASS / FAIL  | ADMIN_EMAILS in Vercel? y/n
 6. /api/auth/login state resolve  | PASS / FAIL  | invite_code leaked? y/n
 7. Auto-invite next-day tier      | SKIP         | needs >24h-old row setup
 8. Auto-invite instant tier       | PASS / FAIL  | direct_referrals + invite_code
 9. /login auto-invite pickup      | PASS / FAIL  | ...
10. Cap enforcement code path      | PASS / FAIL  | grep hits present
11. Self-referral defense          | PASS / FAIL  | referred_by_code still null
12. /admin unauth redirect         | PASS / FAIL  | ...
13. Cleanup                        | PASS / FAIL  | 0 rows remain
```

Report FAIL for anything that doesn't match expected output. For each FAIL, include the actual response body/DB state so the issue can be debugged without re-running.

Under the punch list, list any **unexpected** behaviors you saw during testing (silent 500s, unexpected 2xx on what should be 4xx, weird response bodies, etc.).
