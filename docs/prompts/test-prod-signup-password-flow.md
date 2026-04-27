# Production: new password-based signup flow

Paste to Claude Chrome. Verifies the 2-step email+name+password signup
form just shipped to `https://sneakersterminal.com`. Quick focused test —
not a full-site walkthrough.

---

I need to verify the new signup flow on production at
`https://sneakersterminal.com/signup`. Just shipped: 2-step form (email +
name + password, then optional access code). Walk through the cases below
and mark **PASS** / **FAIL** / 🟡 per phase. Report under 25 lines.

## Setup

1. Fresh incognito window — no cookies.
2. Have a real email you control ready. Use Gmail aliases for the multiple
   accounts: `<your-base>+pwtest1@gmail.com`, `+pwtest2@gmail.com`,
   `+pwtest3@gmail.com`. All deliver to one inbox.
3. Pick a real password to use across the test (e.g. `Test1234abcd!`).
4. Have devtools open: Console + Network.

If the page still shows old copy ("JOIN THE LIST" / "claim a spot on the
waitlist") instead of "NEXT →" / 2-step form, the Vercel build is still
in progress. Wait 60s and refresh once. If still old copy, STOP and tell
the user "Vercel build hasn't finished".

---

## Phase 1 — Page renders correctly

Visit `https://sneakersterminal.com/signup`. Confirm:

- Glass card with logo + "SIGN UP · INDIVIDUAL" eyebrow
- Headline: "Create your account."
- Subhead: "Email, name, password — then your access code (or join the waitlist)."
- Three input fields: EMAIL, YOUR NAME, PASSWORD
- Password field has a "SHOW" / "HIDE" toggle on the right side
- Submit button reads "NEXT →" and is **disabled** until all fields are valid
- Footer: "Already have an account? Sign in"
- Below the card: ".edu student? See your discount →"

**PASS criteria**: form renders, NEXT button disabled until fields valid.

🟡 If you see "Get your access." headline + only email + access-code
fields, the deploy hasn't gone through yet. STOP.

## Phase 2 — Step 1 validation

Try to enable NEXT under each broken condition:

| Input | Expected NEXT state |
|---|---|
| Empty email | disabled |
| `not-an-email` (no `@`) | disabled |
| `+pwtest1@gmail.com` only (no name) | disabled |
| `+pwtest1@gmail.com` + name `J` (1 char) | disabled |
| `+pwtest1@gmail.com` + `Jane Doe` + password `short` (5 chars) | disabled |
| All three: email + `Jane Doe` + `Test1234abcd!` | **enabled** |

Also confirm: typing a `.edu` email shows the green ✓ ".edu detected" hint.

**PASS criteria**: validation gates correctly, NEXT enables only at the end.

## Phase 3 — Step 2 — JOIN WAITLIST path

Step 1 with `+pwtest1@gmail.com`, name `Test One`, password `Test1234abcd!`,
click NEXT.

Step 2 should show:
- "STEP 2 OF 2 · ACCESS" eyebrow
- ACCESS CODE input field (optional)
- Two buttons: "ENTER TERMINAL →" (disabled when code empty) + "NO CODE — JOIN THE WAITLIST"
- "← back to step 1" link

Click "NO CODE — JOIN THE WAITLIST" without entering a code.

Expected:
- Button says "…" while submitting
- Success card appears: "✓ ACCOUNT CREATED" + "You're on the waitlist..."
- "GO TO SIGN IN →" button below

**PASS criteria**: account created, waitlist message shown, no errors.

## Phase 4 — Sign in with the new account (password)

Click "GO TO SIGN IN →" or visit `/login` directly.

The login form should now have:
- EMAIL field
- PASSWORD field with SHOW/HIDE toggle
- "SIGN IN →" button
- Below: "Forgot your password? Sign in via email link instead"

Sign in with `+pwtest1@gmail.com` + the password from Phase 3.

Expected:
- Click SIGN IN → button shows "SIGNING IN…"
- Success → routes somewhere (either `/dashboard` if user has access, or
  back to `/login` with a "you're on the waitlist" state since this user
  joined as waitlist in Phase 3)

🟡 If the user joined as waitlist, the dashboard may redirect them out
since they don't have access yet. Note where they actually land.

**PASS criteria**: password sign-in succeeds (no "invalid credentials"
error). Final destination depends on access state — note it.

## Phase 5 — Wrong password

Sign out (if signed in) — top right "SIGN OUT" button on dashboard, or
just visit `/login` in fresh incognito.

Try to sign in with `+pwtest1@gmail.com` + a wrong password like `WrongPw123`.

Expected:
- Error appears: "Email or password didn't match. Try again, or reset via
  the magic-link option below."
- Stays on `/login`, no redirect.

**PASS criteria**: clean error message, no leak about whether the email exists.

## Phase 6 — Email-link fallback (forgot password)

On `/login`, click the "Sign in via email link instead" link.

Expected:
- Routes to `/login?email=<email>` (server-rendered page with state)
- Shows the user's status with a SEND MAGIC LINK button

Click SEND MAGIC LINK. Check your inbox within 60s for an email from
`noreply@sneakersterminal.com` with subject "Your Sneakers Terminal
sign-in link".

🟡 Don't actually click the magic-link URL during this test — single-use,
and we don't need to consume it.

**PASS criteria**: magic-link email arrives from the verified domain.

## Phase 7 — Duplicate email signup attempt

Fresh incognito (or sign out). Visit `/signup`.

Try to sign up again with `+pwtest1@gmail.com` (the email used in Phase 3).
Use any name + any password. Click through Step 1 to Step 2, then click
"NO CODE — JOIN THE WAITLIST".

Expected:
- Error appears in step 2: "An account with that email already exists. Sign in instead."

**PASS criteria**: duplicate email rejected with clear copy.

## Phase 8 — Console + Network check

- Browser Console: no red errors during any phase.
- Network tab: `/api/auth/signup` POST should return 200 on Phase 3,
  409 on Phase 7. `/api/auth/signin` POST should return 200 on Phase 4,
  401 on Phase 5.

**PASS criteria**: status codes match, no console red.

---

## Final report

Per-phase verdict (one line each), then:
- ✅ list of what works
- ❌ specific failures with the URL + symptom
- 🟡 anything notable

Total: under 20 lines.

## Boundaries

- Production only (`sneakersterminal.com`).
- Don't actually pay through Stripe.
- Don't consume the Phase 6 magic link unless you need to test the full
  loop.
- If a phase 5xx's with a Resend or Supabase error, copy the response
  body — don't get stuck retrying.
