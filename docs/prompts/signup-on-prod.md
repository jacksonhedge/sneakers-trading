# Chrome prompt — sign up a fresh account on sneakersterminal.com

Walks through the production signup flow at `https://sneakersterminal.com/signup` with the user's email. The signup form is a 2-step flow that creates a real auth.users row and routes the user based on whether they had an access code, whether email confirmation is required, and whether they fall through to the waitlist.

This prompt is parametric — the user pastes their email/name/password into Claude Chrome before kicking off, and the agent handles the form interaction and post-signup branching.

---

Task: sign up a fresh account on Sneakers Terminal at `https://sneakersterminal.com/signup`. Walk through the 2-step form, handle the post-submit branching, verify the resulting state (signed-in dashboard, confirmation-required state, or waitlist), and report.

**Required inputs from the user before you start** — ask for these in chat first if they haven't been provided:

- `email` — the address to sign up with (must be a real inbox if email confirmation is required)
- `name` — at least 2 characters
- `password` — at least 8 characters
- `access_code` — OPTIONAL. An 8-character invite code if they have one (skips waitlist + grants immediate access)

If any of those are missing, STOP and ask. Don't guess.

---

## Step 1 — Navigate

1. Open `https://sneakersterminal.com/signup` in a fresh incognito tab.
2. Page should render with the dark/emerald terminal aesthetic, "SIGN UP · INDIVIDUAL" eyebrow, and the Step-1 form fields:
   - EMAIL field with `.edu preferred` hint
   - YOUR NAME field
   - PASSWORD field with show/hide toggle and `8+ characters` hint
   - `NEXT →` button (disabled until all three fields are filled with valid lengths)
3. Open DevTools → Network tab → Fetch/XHR filter → check Preserve log. We'll watch for the `/api/auth/signup` POST.

If the page 404s or 500s, screenshot it and STOP. Vercel deploy may not have finished or the route is broken.

## Step 2 — Fill Step 1

1. Type the email into the EMAIL field. If it ends in `.edu`, a small green `✓ .edu detected — 75% off + leaderboard access after verification` hint should appear under the field. Note whether it shows.
2. Type the name (≥ 2 characters) into YOUR NAME.
3. Type the password (≥ 8 characters) into PASSWORD. Click the SHOW button to toggle visibility — confirm the password is shown then click HIDE again before submitting (we don't want the password screenshotted later).
4. The `NEXT →` button should now be enabled.
5. Click `NEXT →`.

Expected: the form transitions to Step 2 (no network call yet — Step 1 is client-side validation only). If you see an error like "Fill in email, name, and a password of 8+ characters." check that all fields are filled and the password is exactly ≥ 8 chars.

## Step 3 — Step 2 (access code)

You should now see Step 2: an optional ACCESS CODE field with a `(optional)` label, plus two CTA buttons:
- `JOIN WITHOUT CODE →` (skip the code, fall through to waitlist or open signup)
- `SUBMIT WITH CODE →` (validate the code; if it matches the user's waitlist row, immediate access)

**Behavior depends on whether the user provided an access_code:**

**If access_code was provided:**
1. Type the 8-character code (uppercase) into ACCESS CODE.
2. Click `SUBMIT WITH CODE →`.

**If no access_code:**
1. Leave ACCESS CODE empty.
2. Click `JOIN WITHOUT CODE →`.

In both cases, the form fires `POST /api/auth/signup` with `{email, name, password, code?}`. Watch the Network tab for the request and capture:
- HTTP status (expect 200)
- Response body shape: `{ ok, hasAccess?, needsEmailConfirmation?, error?, message? }`

## Step 4 — Handle the response state

The form transitions to a success or error state based on the response. There are 4 outcomes — figure out which one:

### A. Success + immediate access (no email confirmation)
- Response: `{ ok: true, hasAccess: true, needsEmailConfirmation: false }`
- UI: success card "✓ ACCOUNT CREATED · You're in. Routing to your dashboard…"
- Browser auto-redirects to `/dashboard` within ~1s
- Report: signed in, on dashboard, can see the user's email in the topbar
- This happens when the access_code was valid and matched the waitlist row.

### B. Success + email confirmation required
- Response: `{ ok: true, hasAccess: true, needsEmailConfirmation: true }`
- UI: success card "✓ ACCOUNT CREATED · Check `<email>` for a confirmation email — click the link to activate your account, then sign in below."
- A confirmation email lands in the user's inbox (Resend-delivered). The user must click the link before sign-in works.
- Report: confirmation email sent. STOP and tell the user to check their inbox + click the link, then run the login prompt to verify.

### C. Success + waitlisted
- Response: `{ ok: true, hasAccess: false }`
- UI: success card "✓ ACCOUNT CREATED · You're on the waitlist. We'll email you when your spot opens up. Refer friends from your profile page to jump the line."
- Report: account created but waitlist-gated. User can sign in to see their position and grab their referral code, but full dashboard access waits for invite.

### D. Error
- Response: `{ ok: false, error: '...', message?: '...' }`
- UI: red error box at the bottom of the form with one of these messages:
  - `"That code is invalid, already used, or not for this email."` → bad access_code → STOP and tell the user
  - `"An account with that email already exists. Sign in instead."` → email already registered → STOP and direct them to /login
  - `"Password must be 8+ characters."` → password too short → re-prompt the user
  - `"Name too short."` → name too short → re-prompt
  - `"Check the email address."` → invalid email → re-prompt
  - generic `"Something went wrong. Try again."` → ambiguous; capture the response body and STOP
- Report: error code + message verbatim.

## Step 5 — Verify (only on outcome A or after the user clicks the confirmation email in B)

If you're signed in (outcome A, or B post-confirmation):

1. Confirm the URL is `/dashboard`.
2. Verify the user's email appears in the topbar / profile area.
3. Click into `/dashboard/profile`. The page should show:
   - The user's email
   - Their referral code
   - Their queue position (or "you're in" if hasAccess)
   - Direct + indirect referral counts (likely 0)
4. Note the tier badge if visible (Free for fresh signups).

For outcome C (waitlisted), the user CAN still navigate. Visit `/dashboard` — it may redirect or show a waitlist-themed view depending on the gate. Capture what's shown.

## Step 6 — Final report

Return as:

```
## Signup outcome
- Status code:
- Response body shape (redact email if sensitive):
- Outcome (A / B / C / D):

## If A or B-after-confirmation:
- URL after redirect:
- Email visible in UI: yes / no
- Profile page shows referral code: yes / no
- Queue position (if shown):
- Tier badge:

## If B (confirmation required):
- Confirmation message visible: yes / no
- User instructed to check inbox: yes / no

## If C (waitlist):
- Waitlist message visible: yes / no
- Profile/referral page accessible: yes / no

## If D (error):
- Error code from response:
- User-facing message verbatim:

## Anything weird
(free-form)
```

---

## Boundaries

- DO NOT submit the form repeatedly if the first attempt 5xx's — report and stop. Repeated submits could create duplicate users.
- DO NOT click the email confirmation link from the agent's browser — that's a single-use URL and the user needs to click it themselves from their inbox to land on their session.
- DO NOT navigate away from `*.sneakersterminal.com` during the flow.
- If you see `AUTH_DEV_RETURN_LINK` warnings or a `devLink` field in any API response — that's a misconfiguration; flag it. Production should NOT return dev-mode links.
- Capture the final URL + the response body (with email + password redacted) so the user can debug if needed.
