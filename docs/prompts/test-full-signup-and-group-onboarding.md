# Chrome prompt — full signup + group onboarding test

Paste to Claude Chrome. Tests the complete signup surface end-to-end on
production, plus the new group-onboarding flow (captain → roster → member
joins via /join link).

Test against **production** at https://sneakersterminal.com.

---

I need a comprehensive test of the Sneakers Terminal signup + group
onboarding flow on production. Several things just shipped that should now
work without any waitlist gating, without email-send dependency, and
without manual admin approval. Run each phase, mark PASS / FAIL with one
line, end with a summary table. Total target: 10–15 minutes.

## Setup

- **Fresh incognito window for each test** (clears cookies between)
- Disposable emails: `chrome-full-1@example.com`, `chrome-full-2@example.com`,
  `chrome-full-3@school.edu`, `chrome-full-cap@example.com` etc.
- Don't actually submit forms with a real personal email
- Screenshot ONLY on FAILs
- For DB-verification phases, run the SELECTs in Supabase SQL Editor
  (not the browser) and paste back the results

## Phase 1 — Open individual signup (no code, instant access)

1. Open https://sneakersterminal.com in fresh incognito
2. Click **Sign up as an individual** (either nav pill or hero CTA)
3. URL should change to `/signup` (NOT a modal)
4. Confirm form has:
   - Eyebrow `SIGN UP · INDIVIDUAL`
   - Headline "Get your access."
   - EMAIL field (with .edu preferred hint)
   - **ACCESS CODE field labeled `(optional)`**
5. Type `chrome-full-1@stanford.edu` in EMAIL, leave ACCESS CODE empty
6. Verify ✓ .edu detected hint appears
7. Submit button should read `JOIN THE LIST` (no code) → click it
8. Expect redirect to a magic-link URL → then to `/auth/callback` → then
   to `/dashboard`. The full chain should auto-execute.

PASS criteria: end up on `/dashboard` as an authenticated user.
No "you're on the waitlist" page appears. No errors.

🟡 If you land on `/onboarding/about-you` instead of `/dashboard` that's
also OK — first-time-user routing is intentional.

## Phase 2 — Profile page for individual user

While still authenticated as `chrome-full-1@stanford.edu`:

1. Click the profile avatar (top-right circle with the user's initial OR
   the sidebar profile pill)
2. URL should be `/dashboard/profile`
3. Confirm the page shows:
   - Big circle avatar with initial
   - Email displayed (or display_name if set)
   - 6 cards: EMAIL (with `✓ .EDU DETECTED` if applicable), PLAN (free),
     STUDENT VERIFICATION (Not submitted + verify-for-75%-off link),
     UNIVERSITY (Not set), REFERRALS (0/0), BOT & WALLET (3 join-status
     rows)
   - Quick links footer
   - **NO captain card** — this user isn't a captain

PASS criteria: profile renders with 6 cards + quick links, no captain
card visible.

## Phase 3 — Code-based signup (regression check)

1. Fresh incognito. Visit `https://sneakersterminal.com/signup`
2. Type `chrome-full-2@example.com` in EMAIL
3. Type `BADCODE9` in ACCESS CODE (button label should flip to
   `ENTER TERMINAL →`)
4. Submit
5. Expect inline error: `> That code is invalid, already used, or not for
   this email.` Stays on /signup, no redirect.

PASS criteria: code path still rejects invalid codes gracefully.
Confirms the open-signup change didn't break the code-required path.

## Phase 4 — Org signup wizard (3 steps)

1. Fresh incognito. Visit `/`. Click **Sign up your organization**.
2. Modal opens with progress bar showing 3 segments. STEP 1 of 3 visible.
3. **Step 1**: confirm 3 tier cards visible:
   - Software only (top, full width, $799/mo + 14-DAY FREE TRIAL)
   - Mac Studio (left of bottom row, image visible, +$199/mo)
   - MacBook Pro (right of bottom row, image visible, +$199/mo)
4. Verify the local-AI callout: `✦ Local AI tools embedded. Llama 3 70B
   + Qwen run on-device...`
5. Click the Mac Studio card → it should highlight with emerald ring
6. Click `NEXT →`
7. **Step 2**: form with 4 fields. Submit button should be DISABLED until
   all are filled.
   - Org name: `Chrome Full Theta`
   - Type dropdown: `Sorority`
   - School: `UCLA`
   - Leader: `Chrome Full`
   - Email: `chrome-full-cap@example.com`
8. Click `NEXT →`
9. **Step 3**: review card showing all 6 fields. Tier should display as
   `Mac Studio · $799 + $199/mo` highlighted in emerald.
10. Click `SUBMIT ORG →`
11. Expect success card with:
    - "> Your org is on the list."
    - Org name visible
    - HARDWARE SHIPMENT callout (because Mac Studio was chosen)
    - CONTINUE TO SIGN IN button

PASS criteria: 3-step wizard completes, tier choice persists across BACK
navigation if user had clicked back, success card branches correctly to
hardware messaging.

## Phase 5 — Captain authenticates + sees captain card on profile

This is the new big-flow check. Same incognito window from Phase 4 (or
fresh incognito + sign-in).

1. Click `CONTINUE TO SIGN IN` on the success card → lands on `/login`
2. Fill email = `chrome-full-cap@example.com`
3. **DO NOT click the "send magic link" button** — that triggers Resend
   which may not be production-verified yet
4. Instead: visit `/signup` directly in this same incognito, fill
   `chrome-full-cap@example.com` with empty code, submit. This uses the
   open-signup path (no email send) and creates the auth session
   immediately.
5. After redirect chain finishes, you should be on `/dashboard`
6. Click profile avatar → `/dashboard/profile`
7. Confirm at the TOP of the profile page:
   - **Gradient (dark stone-950 + emerald) "captain" hero card**
   - Eyebrow: `YOU'RE THE CAPTAIN OF`
   - Big name: `Chrome Full Theta`
   - Sub-line: `sorority · UCLA`
   - Status pill: `PENDING REVIEW` (amber)
   - 3-stat grid: ACCEPTED 0, PENDING 0, TOTAL 0
   - `ADD MEMBERS →` (emerald) + `MANAGE ORG` (white-outlined) buttons
   - Footer line: `QUICK ROSTER: text your join link to the chapter →
     sneakersterminal.com/join/<truncated-uuid>...`

PASS criteria: captain card appears with all elements. The org just
created in Phase 4 is now visible on the captain's profile.

## Phase 6 — Captain copies the join link

Same authenticated session (the captain).

1. Click `ADD MEMBERS →` on the captain card
2. URL should be `/dashboard/org?tab=members`
3. Confirm the page shows:
   - Header: org name + status pill
   - Tab nav with Members tab active (other tabs greyed/disabled or
     showing 'SOON')
   - **Top section**: emerald-tinted "Your join link · FASTEST" card
     with the copyable URL
4. Click `COPY` button → button should briefly read `COPIED ✓`
5. Note the full join URL for Phase 7 (you can paste it from clipboard)

PASS criteria: join URL is visible, copyable, of the form
`https://sneakersterminal.com/join/<full-uuid>`.

## Phase 7 — Member taps the join link (the magic moment)

**OPEN A FRESH INCOGNITO WINDOW** so the captain's session doesn't
interfere.

1. Paste the join URL from Phase 6 into the fresh window's address bar
2. URL is `/join/<orgId>`
3. Confirm the page shows:
   - Stone-950 dark background with emerald glow
   - Logo in glowing emerald ring
   - Eyebrow: `YOU'RE INVITED TO`
   - Big org name: `Chrome Full Theta`
   - Sub-line: `sorority · UCLA`
   - Captain line: `Captain: Chrome Full`
   - Amber pill: `ORG PENDING REVIEW · YOU'LL JOIN AUTOMATICALLY ON
     APPROVAL` (because the org is still pending)
   - Single email input
   - Submit button reads: `JOIN CHROME FULL THETA →` (uppercased)
   - Helper: "We'll create your account + add you to Chrome Full Theta's
     roster. No password — sign back in via magic link."
4. Type `chrome-full-3@school.edu` in the EMAIL field
5. Verify ✓ .edu detected hint appears
6. Click `JOIN CHROME FULL THETA →`
7. Expect redirect chain → `/auth/callback` → `/dashboard`
8. End up authenticated on `/dashboard` as the new member

PASS criteria: page renders branded org info, signup completes
cleanly, member ends up on /dashboard.

## Phase 8 — Captain refreshes Members tab, sees the new member

Switch back to the **captain's incognito window** (from Phase 6).

1. Refresh `/dashboard/org?tab=members`
2. Scroll down to the "Roster" table
3. Confirm a new row appears:
   - Email: `chrome-full-3@school.edu`
   - Status pill: `ACCEPTED` (emerald)
   - Added: today's date
4. Stat counts at the top of the page should now read: 1 accepted ·
   0 pending

PASS criteria: member shows up as ACCEPTED in the captain's roster
without any manual approval, no email-send required.

## Phase 9 — Pre-invite by email path (regression check)

Same captain session.

1. On the Members tab, scroll to the second card: "Or pre-invite by
   email"
2. In the textarea, paste:
   ```
   alice@school.edu, bob@school.edu
   carol@school.edu
   ```
3. Click `ADD FROM TEXT →`
4. Confirm the green parse summary line: "3 new, 0 already pending..."
5. Pending pills section should show 3 emails as deletable pills
6. Click `INVITE 3 MEMBERS →`
7. Refresh the Roster table → should now show 4 rows total (1 accepted +
   3 pending)

PASS criteria: bulk invite via paste-list works, persists to DB,
roster table reflects.

## Phase 10 — DB verification (run in Supabase SQL Editor)

Run this single query and paste back the result:

```sql
SELECT
  os.org_name,
  os.status AS org_status,
  COUNT(omi.id) AS total_invites,
  COUNT(omi.id) FILTER (WHERE omi.status = 'accepted') AS accepted,
  COUNT(omi.id) FILTER (WHERE omi.status = 'pending') AS pending
FROM organization_signups os
LEFT JOIN organization_member_invitations omi ON omi.org_id = os.id
WHERE os.org_leader_email = 'chrome-full-cap@example.com'
GROUP BY os.id, os.org_name, os.status;
```

Expected:
- 1 row
- `org_name`: Chrome Full Theta
- `org_status`: pending
- `total_invites`: 4
- `accepted`: 1
- `pending`: 3

PASS criteria: matches expected.

## Final report

For each phase:
- ✅ PASS items (one line each)
- ❌ FAIL items (specific symptom + what you expected)
- 🟡 ANYTHING WEIRD that's not pass/fail

Total: target under 30 lines. Screenshot only on FAILs.

## Boundaries

- Do NOT submit `/login` magic-link forms (would hit Resend with bouncy
  emails — protects sender reputation)
- Do NOT submit student verification forms
- Do NOT modify Supabase data — SELECTs only
- Submit signup forms strictly per the test (max 4 individual + 1 org +
  3 pre-invites = 8 total state changes; do not exceed)
- If any URL returns 500, paste me the URL + first line of the error and
  STOP testing that path

If everything passes, the signup → group onboarding loop is fully
production-ready.
