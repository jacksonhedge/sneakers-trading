# Sign-up flow test — 4 user personas

## Goal

End-to-end walk of four distinct sign-up paths to catch the stuff that typechecks but doesn't actually work for a real user. Target `https://sneakersterminal.com`. Report what you see vs what's expected.

## Pre-test setup (once)

1. **Inbox to watch for magic links.** Resend is in test mode, so every magic-link email is delivered to `jackson@hedgepayments.com`. Open that inbox in a separate tab.
2. **Four throwaway emails** for the tests — use `jackson+normal@hedgepayments.com`, `+student`, `+frat`, `+biz`. Gmail's plus-addressing routes them all to the same inbox so you can pick them out.
3. **Four distinct browser contexts** (incognito windows, or Chrome profiles) so sessions don't bleed between flows.
4. **Check that `/api/student/submit` exists on prod.** `curl -X POST https://sneakersterminal.com/api/student/submit -d '{}' -H 'content-type: application/json'`. If it returns `404`, stop — the student feature isn't deployed yet and Flow B will fail. Report that and skip B.

## Flow A — normal user (waitlist → magic-link → Free dashboard)

**Persona:** someone who clicked an X link, knows nothing about the product.

1. Open `https://sneakersterminal.com` in a fresh incognito window.
2. Verify the landing page renders: hero logo, "Lace 'Em Up" tagline, waitlist form, operator-count strip, venue ticker at the bottom. **Screenshot.**
3. Submit `jackson+normal@hedgepayments.com` via the waitlist form.
4. Expected: green success state, queue position shown. Record the number.
5. Check the Jackson inbox for a magic-link email within 1 minute. Record the sender, subject, and whether the email renders in Gmail's safe-HTML mode.
6. Click the magic link. Expected: lands on `/dashboard` with the stone-50 Bloomberg-style UI, topbar + sidebar + category cards + panels all populated.
7. From `/dashboard`, open the Arbitrage panel. Expected for Free tier: either a paywall-ish upgrade CTA, or top 3 cross-book pairs with book names redacted on sub-1.00 arbs.
8. Click the "Cross-Book Spread" / "Upgrade" link. Expected: lands on `/dashboard/billing` or `/pricing`. Report which.
9. Open `/markets` from the sidebar. Expected: grid of market cards, per-book freshness strip at top with green/amber/red chips.

**Report checklist for Flow A:**
- [ ] Waitlist POST succeeded (2xx)
- [ ] Magic-link email arrived and clicking it landed on `/dashboard` (not an error)
- [ ] Dashboard renders with no 500s in DevTools Network tab
- [ ] Freshness strip on `/markets` shows data (not all red)
- [ ] Any console errors or broken images? Paste them.

## Flow B — student (75% off, verification required)

**Persona:** Harvard junior, wants Pro tier at discount.

1. Fresh incognito. Open `https://sneakersterminal.com/students`.
2. Verify the page renders: "75% off." hero, verification-requires list (edu email / Instagram / LinkedIn), waitlist form. Screenshot.
3. Submit `jackson+student@hedgepayments.com`. Follow the magic-link flow as in A steps 3-6.
4. On `/dashboard`, find the Student Discount card (likely in the sidebar or on `/dashboard/billing`). Click "Get verified" or similar.
5. Submit the verification form with:
   - edu_email: `student@harvard.edu`
   - instagram_handle: `testaccount_ig`
   - linkedin_url: `https://linkedin.com/in/test-student-2027`
   - grad_year: `2027`
6. Expected response: `200 {ok: true, status: "pending"}`. Verify the form shows a "pending review" state.
7. **Stress check — oversized inputs.** In a second submission (resubmit to same row), try:
   - edu_email: 400-character string ending in `@harvard.edu` — **expected: `400 invalid_edu_email`**. If this returns 200, flag as a regression (length-cap bypass).
8. **Admin-side verification (requires admin session — skip if not admin).** If you have `jackson@hedgepayments.com` in `ADMIN_EMAILS`, open `/admin/students` in a separate tab. The submission should appear. Approve it. Return to Flow B's dashboard — Student Discount card should flip to "Approved" state with the expiry date shown.
9. Click through to `/dashboard/billing` → Subscribe to Pro. Expected: Stripe Checkout session shows a discounted price (~$10/mo instead of $39/mo). **Do not complete checkout** — screenshot the discounted price and close.

**Report checklist for Flow B:**
- [ ] `/students` page renders cleanly
- [ ] Verification form POST returned 200 + `status: pending`
- [ ] Oversized-input test returned 400 (or flag if 200)
- [ ] Admin approval flow worked (or skipped)
- [ ] Stripe Checkout showed the 75%-off coupon (if admin approval done)

## Flow C — fraternity (Business tier sub-flavor, 5 seats + Mac Studio request)

**Persona:** Phi Delt social chair trying to get a group subscription for 5 members.

1. Fresh incognito. Open `https://sneakersterminal.com/pricing`.
2. Verify the page renders with all tiers (Free, Pro, Elite, Business, Fraternity, Enterprise). The Fraternity card should show ~$149/mo with a "For college fraternities only" note. Screenshot the whole pricing grid.
3. Sign up `jackson+frat@hedgepayments.com` via any sign-up surface (landing or /pricing "Sign up to start" button on the Fraternity card).
4. Magic-link → `/dashboard`.
5. Open `/dashboard/billing`. Find the Fraternity plan card. **Note:** your `account_type` may default to `individual`, which will disable Fraternity. If disabled, look for an account-type switcher (probably `/dashboard/settings` — if not found, flag it).
6. Subscribe to Fraternity. Expected: Stripe Checkout session with a 7-day trial and `$149/mo` or `$1,490/yr`. Do NOT complete — screenshot the checkout page with the self-declaration language visible.
7. **Seat management — test inviting 5 members.** After (or without) completing checkout, look for a seat-invite UI in `/dashboard/settings` or `/dashboard/billing`. Attempt to invite 5 throwaway addresses (`jackson+frat-member1@…` through `+member5@…`). **If no UI exists, flag it clearly** — the fraternity plan advertises 30 seats but the invite mechanism may not be built yet.
8. **Mac Studio hardware request.** Sneakers admin tooling references a "Mac Studio / MacBook hardware-bundle calculator" for Business/Enterprise prospects. From `/pricing`, scroll to the Enterprise card → click "Contact Sales". A modal should appear. In the `use_case` textarea, write: `Phi Delt chapter at Williams — 30 members, interested in Mac Studio bundle on top of Fraternity tier. Can you price the hardware?` Submit the form. Expected: `/api/enterprise/inquiry` returns 200, modal shows "Thanks" state.

**Report checklist for Flow C:**
- [ ] `/pricing` renders all tiers, Fraternity is clearly labeled
- [ ] Account-type switcher found (or flagged as missing)
- [ ] Stripe Checkout showed $149/mo Fraternity with trial
- [ ] Seat-invite UI found (or flagged as missing)
- [ ] Enterprise Contact Sales modal submitted successfully
- [ ] Any dead/404 paths encountered? List them.

## Flow D — business (standard Business tier, ~$399/mo)

**Persona:** hedge-fund junior analyst setting up a desk subscription for 5 traders.

1. Fresh incognito. Open `https://sneakersterminal.com/pricing`.
2. Sign up `jackson+biz@hedgepayments.com`.
3. Magic-link → `/dashboard`.
4. Before subscribing, go to `/dashboard/settings` (or whatever switches account-type). Flip `account_type` from `individual` to `business`. If there's no UI, flag it — the Business tier requires this flip to be purchasable per the pricing-table code.
5. Back to `/dashboard/billing`, subscribe to Business (standard, NOT Fraternity). Expected: Stripe Checkout with a 2-day trial (note: Business gets 2 days per `stripe-checkout.ts`, different from Pro/Elite/Fraternity's 7).
6. Screenshot the Business checkout page. Close without completing.
7. **Seat management** — same check as Flow C. If Business advertises multi-seat, verify an invite UI exists.

**Report checklist for Flow D:**
- [ ] Account-type switcher works (`individual` → `business`)
- [ ] Stripe Checkout opened at the Business price with a 2-day trial (not 7)
- [ ] Seat-invite UI matches the seat count advertised on the pricing card
- [ ] No account-type gate misfired (e.g., Fraternity subscribe button should still be grey once account is business)

## Report format

Return one section per flow. Inside each, list:

1. **Status**: pass / partial / fail
2. **What you saw** — bullet log of each step with timestamps and status codes where observable
3. **What broke** — any 4xx/5xx responses, missing UI, broken links, console errors
4. **Screenshots** — embed or describe each
5. **Decisions needed** — anything that looks intentional but feels wrong (e.g., "Fraternity tier accepted my individual account with no switch required — is that intentional?")

End with a single "CRITICAL-PATH SUMMARY" paragraph: would a real tester complete each flow without help?

## Things to explicitly flag (these are known open questions)

- **Bulk-fraud log-only behavior** on student submit (6+ from same university domain in 24h) — we don't expect you to exercise this with 6 accounts; just note whether `/admin/students` surfaces a "high volume" badge if you spot one.
- **Resubmit-over-approved** behavior on student verification — we're considering whether re-submitting should reset an approved user's status. If you submit twice with the same account, report what happened to the row's status field (visible on `/admin/students`).
- **Unicode email acceptance** — if you try a non-ASCII email and it gets in, flag it.

## Cleanup

After finishing all four flows:
1. From your admin console at `/admin/system` (if you have admin access), run the stress-test cleanup — it deletes any `stress+` rows. The `jackson+*@hedgepayments.com` rows here are real test rows, not `stress+` tagged, so you'll need to either (a) manually wipe them from `/admin/users`, or (b) leave them and flag to the team.
2. Cancel any Stripe trials you started during checkout screenshots so they don't bill.
