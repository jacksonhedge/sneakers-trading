# Chrome prompt — test college rebrand + signup flows

Paste to Claude Chrome. Tests everything pushed in the last few hours: college-first rebrand, individual/org signup split, immersive /signup screen, /hardware page, dashboard O'Toole spotlight, admin signup-config, and the new 1-invite scarcity flow.

Test against **production** at https://sneakersterminal.com (not localhost).

---

I need you to test the recently-shipped Sneakers Terminal changes on production. Visit each URL listed, do the action, and report PASS / FAIL with a one-line note. At the end, summarize anything broken.

## Setup
- Browser: a fresh window (private/incognito preferred so cookies don't pollute test)
- Don't actually submit forms with my real email — use disposable variants like `test+chrome1@example.com`, `test+chrome2@example.com` etc.
- Take screenshots of any visual issues you spot
- If a step asks "verify X is visible" and X is not visible, that's a FAIL — report what you saw instead

## Phase 1 — Landing page (`/`)

1. Open https://sneakersterminal.com — confirm:
   - Eyebrow reads `SNEAKERS TERMINAL · FOR COLLEGE STUDENTS` (not "PRE-LAUNCH" or "COLLEGE ACCESS")
   - Headline: "The prediction terminal for college."
   - Subtitle mentions Kalshi, Polymarket, NoVig, Opinion + "ranked against your classmates"
   - **Sign Up CTAs are immediately below the subtitle** (NOT below the pillar cards or queue counter)
   - Two buttons visible: bright emerald "Sign up as an individual →" and outlined white "Sign up your organization →"
   - Below the CTAs: 3 pillar cards in a row (75% OFF, LEADERBOARDS, GROUPS)
   - Stats strip with numbers: "N venues tracked · N+ live markets · 10m refresh cadence"
   - Top-right nav has: Connect Wallet · Recent grad? · Sign Up as Organization (outlined) · Sign Up as Individual (emerald pill)

## Phase 2 — Individual signup flow

2. Click "Sign up as an individual →" (either the hero CTA or the nav pill)
3. Confirm:
   - URL changes to `/signup` (NOT a modal opening over the landing)
   - Background shows a dimmed/blurred dashboard mock (you should see faint outlines of dashboard tiles, sidebar, topbar — not pure black)
   - Form sits in a glass card with emerald glow behind it
   - Eyebrow: `SIGN UP · INDIVIDUAL`
   - Headline: "Get your access."
   - Form fields: EMAIL (.edu preferred), ACCESS CODE
   - Button label: "ENTER TERMINAL →"
4. Type a fake .edu email like `chrome-test@stanford.edu` — confirm a green ".edu detected" hint appears under the email field. (If the form on /signup doesn't have that hint, that's OK — the hint lives on the landing form, not /signup. Note which one it is.)
5. Submit form WITHOUT a code (leave code field empty if possible, or with a fake code). Note what happens — should fall back to waitlist signup OR error gracefully. Don't actually complete the signup.

## Phase 3 — Organization signup flow

6. Go back to `/`. Click "Sign up your organization →" (either hero or nav)
7. Confirm a MODAL opens (not navigation):
   - Eyebrow: `SNEAKERS TERMINAL · FOR COLLEGE ORGS`
   - Headline: "Get your org in early."
   - Form fields: ORGANIZATION NAME, TYPE (dropdown: Fraternity/Sorority/Dorm/Club/Class/Other), SCHOOL, LEADER/ADMIN NAME, LEADER EMAIL
   - Button: "SUBMIT ORG →"
8. Submit a fake org: name "Chrome Test SAE", type "Fraternity", school "University of Florida", leader "Chrome Test", email `chrome-org@stanford.edu`
9. Confirm success card shows:
   - Green "> Your org is on the list."
   - Name "Chrome Test SAE" appears in the card
   - Hardware promo tile: "OPTIONAL · LOOK AT THIS" + "A Mac, set up by us, shipped to your house →"
   - "CONTINUE TO SIGN IN →" button at the bottom

## Phase 4 — Hardware page (`/hardware`)

10. Navigate to https://sneakersterminal.com/hardware
11. Confirm:
    - Hero: "Bring the terminal home." + Mac Studio image with sneaker decal
    - Two side-by-side cards: Mac Studio + MacBook Pro with their respective images
    - "What's included" 4-card row: Pre-loaded software, Free shipping + setup, 1-on-1 onboarding, Hardware support
    - **Pricing section has TWO cards side-by-side**:
      - Left: "FOR ORGANIZATIONS · LIVE" badge, $199/mo, "Sign up your org →" button
      - Right: "FOR INDIVIDUALS · COMING SOON" badge, "+$—/mo" greyed out, "Notify me →" button
    - "Not a fraternity?" B2B tease section with 3 customer types
    - FAQ with 5 collapsible items (click one to verify it expands)
    - Footer breadcrumb back to /pricing + /

12. Click the "Notify me →" button on the Individuals card → should open a mailto to `desk@sneakersterminal.com`

## Phase 5 — Public marketing pages

13. Visit `/students` — confirm:
    - "2 weeks free, then 75% off." headline
    - At the BOTTOM there's a section anchored at `#alumni` titled "Just graduated? You're still in." with the recent-grad explainer (LinkedIn verification, 50% off for 2 years post-grad)

14. Visit `/college` — confirm it loads without errors. Should show the college landing.

15. Visit `/pricing` — confirm:
    - Headline "Built for college."
    - Subtitle mentions ".edu students get 2 weeks free + 75% off forever"
    - Fraternity tier shows $799/mo (NOT $149) — note: this depends on Stripe-side updates which may still be at $149
    - Mention of "/hardware" in the Fraternity highlights

## Phase 6 — Mobile viewport sanity check

16. Resize the browser to 375px wide (iPhone size) — or use devtools mobile emulation
17. Reload `/` — confirm:
    - Top-right nav doesn't horizontally scroll the page
    - Pillar cards stack vertically (1 column, not 3)
    - Sign Up CTAs stack vertically
    - Hero text is readable (not truncated)
    - No element overflows the viewport horizontally

## Phase 7 — Skip if not admin

If you have admin credentials (the testing email is in the ADMIN_EMAILS env var), navigate to:

18. `/admin/signup-config` — confirm:
    - Top status card shows green "All signups open" (or amber/red if any flag is disabled)
    - Two flag rows: Individual signups + Organization signups, each with ENABLED/DISABLED pill
    - Banner row showing "ACTIVE" or "NONE"
    - "Common operations" section at bottom with copy-pastable vercel env commands

## Final report

For each phase, summarize:
- ✅ PASS items
- ❌ FAIL items (with one line on what was wrong)
- 🟡 ANYTHING WEIRD that's not a clear pass/fail

Keep the report to under 30 lines. Screenshot only the FAIL items.

## Boundaries

- Do not actually create real waitlist entries with real emails
- Do not submit the autotrade waitlist or treasury form on dashboard pages (those mutate state)
- Do not test admin pages without admin credentials — just skip Phase 7
- If a page returns a 500 or 404, report and stop testing that URL — don't refresh-bomb
