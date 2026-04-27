# Chrome prompt — full signup test after schema alignment

Paste to Claude Chrome. Tests the full signup surface against production now that:
- Migration 019 has applied (student_verification gained 7 review-related columns)
- All 4 broken endpoints rewrote to match the live table-per-concern schema
- Org signup writes to `organization_signups`
- Autotrade waitlist writes to `autotrade_waitlist` table
- Treasury writes to `safe_treasury` table
- Leaderboard join flips `user_profiles.joined_leaderboard`

Test against **production** at https://sneakersterminal.com.

---

I need you to validate the signup + downstream flows on Sneakers Terminal production after a schema-alignment refactor. Run each phase, mark PASS / FAIL with one line of detail, finish with a short summary.

## Setup

- Use a fresh incognito/private browser window so cookies don't pollute
- Use disposable emails: `chrome-aligned-1@example.com`, `chrome-aligned-2@example.com`, etc.
- Do NOT use real personal emails
- Do NOT submit forms with admin emails
- Take screenshots only on FAILs
- For DB checks, use the Supabase SQL Editor with the SELECTs I provide — do not run any other SQL

## Phase 1 — Landing page college-first state

1. Open https://sneakersterminal.com in fresh incognito
2. Verify the hero section in this exact order top-to-bottom:
   - Eyebrow: `SNEAKERS TERMINAL · FOR COLLEGE STUDENTS`
   - Logo
   - Headline: "The prediction terminal for college."
   - Subtitle mentioning Kalshi, Polymarket, NoVig, Opinion + "ranked against your classmates"
   - **Two Sign Up buttons immediately under the subtitle** — emerald "Sign up as an individual →" and outlined "Sign up your organization →"
   - 3 pillar cards (75% OFF / LEADERBOARDS / GROUPS)
   - Stats strip ("N venues tracked · N+ live markets · 10m refresh cadence")
   - Queue counter ("> N STUDENTS ON THE LIST")
3. Top-right nav has: Connect Wallet · Recent grad? · Sign Up as Organization · Sign Up as Individual

PASS criteria: all 8 elements present in this order, no overlapping nav obscuring the eyebrow.

## Phase 2 — Individual signup → /signup with terminal backdrop

1. Click the emerald "Sign up as an individual →" button (either nav or hero)
2. Verify URL navigates to `https://sneakersterminal.com/signup` — NOT a modal opening over the landing
3. Confirm visual:
   - Background shows a dimmed/blurred dashboard mock (sidebar with "Dashboard / Markets / Leaderboard / O'Toole / Settings", dashboard tiles with placeholder content). Should be visibly there, not pure black.
   - Form sits in a glass card with emerald glow behind it
   - Eyebrow: `SIGN UP · INDIVIDUAL`
   - Headline: "Get your access."
   - Two fields: EMAIL (.edu preferred) and ACCESS CODE
   - Button: "ENTER TERMINAL →"
4. **Do NOT actually submit.** Just verify the screen renders correctly.

PASS criteria: navigated to /signup (not modal), terminal backdrop visible, form rendered.

## Phase 3 — Organization signup (the big fix)

This is the path that was 500-ing before the schema-alignment refactor. Should now succeed end-to-end.

1. Go back to https://sneakersterminal.com
2. Click the outlined "Sign up your organization →" button (nav or hero)
3. Verify a MODAL opens (not navigation):
   - Eyebrow: `SNEAKERS TERMINAL · FOR COLLEGE ORGS`
   - Headline: "Get your org in early."
   - 5 fields: ORGANIZATION NAME, TYPE (dropdown), SCHOOL, LEADER/ADMIN NAME, LEADER EMAIL
4. Fill out a fake org:
   - Org name: `Chrome Aligned SAE`
   - Type: select `Fraternity`
   - School: `University of Florida`
   - Leader name: `Chrome Aligned`
   - Leader email: `chrome-aligned-1@example.com`
5. Click "SUBMIT ORG →"
6. **Verify success card appears** with:
   - "> Your org is on the list."
   - The org name "Chrome Aligned SAE" displayed
   - Hardware promo tile linking to /hardware
   - "CONTINUE TO SIGN IN →" button at the bottom
7. **Critical DB check**: open Supabase → SQL Editor → New query and run exactly:
   ```sql
   SELECT id, org_name, org_type, org_leader_name, org_leader_email, org_college, status
   FROM organization_signups
   WHERE org_leader_email = 'chrome-aligned-1@example.com'
   ORDER BY created_at DESC LIMIT 1;
   ```
8. Confirm the result shows:
   - org_name: `Chrome Aligned SAE`
   - org_type: `fraternity`
   - org_leader_name: `Chrome Aligned`
   - org_college: `University of Florida`
   - status: `pending`

PASS criteria: form submission succeeds (no "Something broke"), success card renders, DB row exists with all fields populated.

## Phase 4 — /hardware page (split pricing)

1. Navigate to https://sneakersterminal.com/hardware
2. Verify:
   - Hero: "Bring the terminal home." + Mac Studio image (with sneaker decal)
   - Two side-by-side device cards: Mac Studio + MacBook Pro
   - "What's Included" 4-card row
   - **Pricing section: TWO cards side-by-side** —
     - Left: `FOR ORGANIZATIONS · LIVE` badge, +$199/mo, "Sign up your org →"
     - Right: `FOR INDIVIDUALS · COMING SOON` badge, +$—/mo (greyed), "Notify me →"
   - 5-item FAQ (click one to verify it expands via native `<details>`)
3. Click "Notify me →" on the Individuals card — should open a mailto to `desk@sneakersterminal.com`

PASS criteria: all elements render; the two-card pricing split is visible (this was added late and could have regressed).

## Phase 5 — Mobile hamburger nav

1. Resize browser to 375px width (or use devtools mobile emulation)
2. Reload `/`
3. Verify the top-right nav now shows a **hamburger icon** (not 4 stacked buttons)
4. Click the hamburger
5. Verify a slide-down panel opens with:
   - "Sign up as individual" + "Sign up your organization" buttons
   - "Recent grad?", "Hardware", "Venues we track", "Pricing" links
6. Click outside the panel (or Esc) — panel should close

PASS criteria: hamburger replaces the 4-button stack on mobile, panel opens/closes cleanly, all links visible.

## Phase 6 — Public marketing pages

1. https://sneakersterminal.com/students — confirm:
   - Headline: "2 weeks free, then 75% off."
   - At the bottom there's an `#alumni` section: "Just graduated? You're still in." with the recent-grad explainer
2. https://sneakersterminal.com/college — loads without errors
3. https://sneakersterminal.com/pricing — confirm:
   - Headline: "Built for college."
   - Fraternity tier shows $799/mo (NOT $149)

PASS criteria: all 3 pages load, copy is current.

## Phase 7 — DB sanity (no actions, just SELECTs)

In Supabase SQL Editor, run these and report row counts:

```sql
SELECT 'waitlist' AS t, COUNT(*) FROM waitlist
UNION ALL SELECT 'organization_signups', COUNT(*) FROM organization_signups
UNION ALL SELECT 'student_verification', COUNT(*) FROM student_verification
UNION ALL SELECT 'autotrade_waitlist', COUNT(*) FROM autotrade_waitlist
UNION ALL SELECT 'safe_treasury', COUNT(*) FROM safe_treasury
UNION ALL SELECT 'user_profiles', COUNT(*) FROM user_profiles;
```

Just paste back the row counts. PASS = the query runs without error (which proves all 6 tables exist + are queryable).

## Final report

For each phase:
- ✅ PASS items (one line each)
- ❌ FAIL items (with specific error message and what was expected)
- 🟡 ANYTHING WEIRD that's not a clear pass/fail

Keep total report under 30 lines. Screenshot only on FAILs.

## Boundaries

- Do NOT submit student verification forms (would create real DB rows tied to a real email — skip Phase 6 student-form interaction, just verify the page renders)
- Do NOT click any "Sign up as Individual" final submission — Phase 2 verifies the screen renders only
- Do NOT modify any Supabase data — only SELECT queries from this prompt
- Do NOT run admin endpoints
- If any URL returns 500, report once and stop testing that path — do not refresh-bomb

Single submission allowed: the org signup in Phase 3, since that's the specific endpoint we're verifying works end-to-end after the rewrite.
