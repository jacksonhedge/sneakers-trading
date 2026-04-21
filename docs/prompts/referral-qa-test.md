# Chrome prompt — Referral flow QA

Full QA pass on sneakersterminal.com after the referral Phase 1 deploy. Covers the organic signup path, the referred signup path, edge cases, visual/responsive checks, and basic perf/security observations.

---

Task: full QA pass on sneakersterminal.com. You're testing a pre-launch marketing + waitlist site with a brand-new referral flow we just shipped. Treat this like a first-time-tester engagement — don't assume anything works, probe aggressively, record everything.

Context you can use:
- Site is a waitlist-only landing page for a product called "Sneakers Terminal" — a trading terminal for prediction markets (Kalshi, Polymarket, etc.)
- Stack: Next.js on Vercel, Supabase as the database, Resend for emails
- Two flows exist today:
  (a) ORGANIC SIGNUP — visitor enters email → lands on waitlist → gets a confirmation email with their own referral link
  (b) REFERRED SIGNUP — visitor arrives at https://sneakersterminal.com/r/<CODE>, cookie is set, they submit email, their signup is attributed to that referrer
- Expected referral code format: exactly 6 characters, uppercase letters + digits, excluding 0/O/I/1 for readability (so e.g. ABC234, XKR7Q9 — not ABC123 since 1 is excluded)
- No user login, no dashboard, no other pages. Just "/" and the referral redirect route "/r/[code]".

Prerequisites:
- Gmail signed in for receiving emails
- An email that supports + aliases, e.g. yourname+anything@gmail.com (Gmail does this by default). If yours doesn't, use 3 separate real addresses you can check.
- DevTools you can open (we want Console + Network tab observations)

---

PHASE 1 — DISCOVERY (don't interact yet)

1. Navigate to https://sneakersterminal.com/ in a fresh tab with DevTools open.

2. OBSERVATIONAL CHECKS — record whether each of these is present / broken / anomalous:
   (a) Page loads without errors (check Network tab for 4xx/5xx, Console for red errors/warnings)
   (b) Browser tab title + favicon render (expected: "Sneakers Terminal" + the sneakers logo)
   (c) Logo image loads (should be a cartoon of blue high-top sneakers hanging by laces with "Sneakers" in red-outlined baseball-script below)
   (d) Headline/tagline text: expected to include "Lace 'Em Up." somewhere
   (e) A descriptive paragraph mentioning prediction market platforms (Kalshi, Polymarket, ProphetX, CDNA)
   (f) A line showing current queue size: "> N OPERATORS IN QUEUE" where N is some number ≥ 56
   (g) An email input + a button labeled "REQUEST ACCESS"
   (h) A disclaimer at the bottom about not being an investment advisor
   (i) No referral banner visible (this is the organic view — no cookie set)
   (j) Rough visual impression: green-on-black terminal aesthetic. Note anything that looks broken, misaligned, or off-palette (the colorful logo vs green chrome is intentional; flag anything else).

3. RESPONSIVE CHECK — resize the viewport to mobile width (~375px). Does the layout break? Does the logo scale? Does the form stay usable?

4. METADATA CHECK — view page source (right-click → View Page Source, or Cmd+U). Look for:
   - `<title>` tag: should say "Sneakers Terminal" or similar
   - `<meta name="description">` with some product copy
   - `<meta property="og:image">` pointing to an opengraph-image URL
   - Confirm no secret-looking strings (no raw API keys, no service_role JWTs)

Screenshot the landing page and the mobile view.

---

PHASE 2 — ORGANIC SIGNUP (happy path, no referrer)

1. Still in a fresh-cookies tab (no prior visits to /r/...).

2. Try each of these INVALID inputs in sequence and record the response:
   (a) Leave the email blank and submit. Expected: browser's native "please fill out this field" validation blocks it.
   (b) Enter "notanemail" (no @) and submit. Expected: either native validation blocks it, OR the API returns something like `{error: "invalid_email"}`.
   (c) Enter "@noatfirst.com" (malformed) and submit. Record what happens.

3. Now submit a VALID email. Use one of these formats (pick whichever your inbox supports):
   - Gmail alias: yourname+sneakers-qa-a@gmail.com
   - Any fresh address you can check
   Record:
   - The HTTP status and response body in Network tab (expected: 200 with `{ok: true}`)
   - Whether the page transitions to a success card showing "> Access requested."
   - Whether there's any follow-up copy suggesting to check the inbox

4. Go to the inbox of the email you used. Within 2 minutes, there should be an email from "Sneakers Terminal <onboarding@resend.dev>" (may land in Promotions/Updates tab). Check:
   (a) Subject line is present and sensible
   (b) Body mentions your queue position (some number)
   (c) Body explains the referral reward structure (should mention "+5" and "+2" or "direct" and "indirect")
   (d) Body contains a referral link of the form https://sneakersterminal.com/r/<CODE>
   (e) The CODE is exactly 6 characters from the approved alphabet (no 0/O/I/1)
   (f) Styling: is the HTML rendering readable, or does it look broken?

5. COPY A's referral code. We need it for Phase 3.

6. Screenshot: success card, full email.

---

PHASE 3 — REFERRED SIGNUP (1st-degree via A's code)

1. In a new tab, navigate to:  https://sneakersterminal.com/r/<A's code>
   Watch the Network tab. You should see a 302 redirect back to /, AND a Set-Cookie header for "sneakers_ref" with A's code as the value.

2. On the landing page now, check:
   (a) A green-bordered banner appeared saying "> Referred by operator <A's code>" with copy about boosting their position
   (b) All the other landing-page elements still render correctly
   (c) The code in the banner matches EXACTLY what you put in the URL
   (d) No JS console errors

3. Submit a DIFFERENT email (e.g. yourname+sneakers-qa-b@gmail.com).

4. Observe:
   (a) Network tab: the POST to /api/waitlist should include a "referralCode" in the JSON body with A's code
   (b) Response: 200, `{ok: true}`
   (c) Success card: should mention the referrer, something like "Operator <A's code> just moved up."

5. Check B's inbox for the confirmation email. Extract B's own referral code.

6. Screenshot: the banner, the Network request body, the success card, B's email.

---

PHASE 4 — EDGE CASES (expected to handle gracefully)

1. In a new tab, try https://sneakersterminal.com/r/FAKE99 (invalid code — wrong length, and contains 9 which IS in the alphabet, but the code doesn't exist).
   - Does it redirect you to / anyway? (Expected: yes)
   - Does the referral banner appear? FAKE99 is 6 chars all-alphabet/digit — format is valid, so the banner SHOULD show. But if you submitted, the server would silently drop the attribution since the code doesn't exist in the DB.
   - Record what happens.

2. Try https://sneakersterminal.com/r/NO  (too short, 2 chars).
   - Does it redirect to /? Does the banner appear?
   - Expected: no banner (invalid format).

3. Try https://sneakersterminal.com/r/lowercase (lowercase, wrong alphabet).
   - Note our handler uppercases incoming codes, so "LOWERCASE" = 9 chars, invalid. Expected: no banner.

4. Try submitting the SAME email you used in Phase 2 (A's email) again.
   - Expected: server treats it as idempotent. Response should still be 200 with `ok:true`. You should see the success card. But no new email should arrive (duplicate signups skip the email send to avoid spam).
   - Wait 2 minutes — did a second email arrive? (Expected: NO)

---

PHASE 5 — SHARE / SOCIAL PREVIEW

1. Open https://www.opengraph.xyz/ (or any OG preview tool). Paste in https://sneakersterminal.com/
2. Report:
   - Does the title, description, image all resolve?
   - Is the image the Sneakers logo?
   - Any errors?

3. Alternative: try pasting the URL in a Slack DM to yourself (don't send, just watch the preview generate). Screenshot what Slack shows.

---

PHASE 6 — PERFORMANCE + SECURITY (light observations)

1. In DevTools → Network → open the initial / request. Check:
   - HTTP status 200
   - Response time (fast? slow? > 1s concerning?)
   - TLS certificate valid (lock icon in address bar; click it, check issuer)
   - Response headers: does "strict-transport-security" appear?

2. In DevTools → Application → Cookies, inspect "sneakers_ref" after Phase 3:
   - Value = A's code
   - SameSite: Lax
   - Secure: true
   - Expires: ~30 days out
   - HttpOnly: false (intentional — the server needs to read it, but since the code is public, not a security concern)

---

PHASE 7 — REPORT

Give me a structured report:

1. **Blocking issues** (anything that fails the happy path): prioritized list with reproduction steps
2. **Functional issues** (things work but weirdly): list
3. **UI / visual issues**: list
4. **Edge-case surprises**: what happened vs expected for each of the Phase 4 tests
5. **Nitpicks**: things that aren't broken but could be better
6. **Codes captured**:
   - A's code (from Phase 2)
   - B's code (from Phase 3)
7. **Screenshots**: landing page (desktop + mobile), success cards (both), referral banner, both emails, Network tab showing referralCode in POST body, OG preview

If ANY of the following happen, STOP immediately and report:
- The page returns 500 or crashes
- A signup appears to succeed but no email arrives within 5 minutes (could be Resend quota, DNS, or a bug)
- A secret-looking string (e.g. JWT starting with "eyJ") appears anywhere in the page source, cookies, or localStorage
- The referral banner shows a code you didn't put in the URL
- Submitting A's email returns an error instead of treating it as idempotent

Do NOT:
- Submit more than the 2 intended signups in Phases 2–3 (A and B) plus the one duplicate re-try in Phase 4
- Try SQL injection or other security probes beyond passive observation
- Attempt to access Supabase or Vercel directly — we already know those are configured correctly
- Sign up more than 10 total times (Resend free tier is 100/day but we want to leave headroom)
