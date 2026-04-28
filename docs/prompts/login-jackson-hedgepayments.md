# Chrome prompt — sign in jackson@hedgepayments.com on prod

Logs into an EXISTING account on `https://sneakersterminal.com/login` and verifies it lands on the gated dashboard (not the waitlist) — the invite code was already burned server-side by ops, so this account is fully provisioned.

Don't try the signup flow on this email — `auth.users` already has a row from 2026-04-21, so `/signup` will 409 every time.

---

**Required inputs from the user before you start** — ask in chat first if missing:

- `password` — the password the user set for `jackson@hedgepayments.com` when they signed up earlier this week. If they've forgotten it, STOP and tell them to use the magic-link path on /login (`Sign in via email link instead`) — don't guess.

If missing, STOP and ask. Don't try a guess.

---

## Step 1 — Navigate

1. Open `https://sneakersterminal.com/login` in a fresh incognito tab (no leftover Chrome debugging session — if you see a "started debugging this browser" banner, click Cancel before proceeding).
2. Page should render with the dark/emerald terminal aesthetic and the email + password inputs.
3. Open DevTools → Network → Fetch/XHR → Preserve log. We'll watch for `POST /api/auth/signin`.

If the page 404s/500s, screenshot and STOP.

## Step 2 — Sign in

1. Email field → `jackson@hedgepayments.com`
2. Password field → the password from inputs.
3. Click `SIGN IN →`.

Expected: `POST /api/auth/signin` returns 200 with `{ ok: true }`, then the browser navigates to `/dashboard`.

If you see `"Email or password didn't match…"` — stop, capture the response status, tell the user. Do NOT retry more than twice (rate-limit).

## Step 3 — Verify full access (this is the important bit)

The reason we're testing: ops just burned the invite code (`MARRT4D7`) for this email so the user should land on the FULL dashboard, NOT the waitlist-gated view.

After redirect:

1. Confirm URL is `/dashboard` (not `/dashboard/waitlist` or similar).
2. Confirm the topbar/profile area shows `jackson@hedgepayments.com` (or its display name).
3. Confirm the dashboard renders LIVE market widgets (BiggestVolume, BigMovers, market cards) — NOT a "you're on the waitlist · position #X" banner.
4. Click into `/dashboard/profile`. Verify:
   - Email visible
   - Referral code visible
   - Tier badge (likely Free for fresh accounts)
   - **Access status: granted / in / not waitlisted** — whatever copy the page uses for the post-graduation state
5. Click into `/dashboard/markets`. Confirm market detail pages load with the Robinhood-style charts.
6. Click into `/dashboard/alerts` and `/dashboard/otoole` (or wherever O'Toole chat lives). Confirm both render — these are gated routes that 302 to /login if the session isn't valid.

## Step 4 — Final report

Return as:

```
## Login outcome
- /api/auth/signin status:
- Final URL after redirect:
- Email visible in topbar: yes / no

## Access status
- Dashboard rendered: full / waitlist / other (describe)
- Profile page accessible: yes / no
- Profile shows referral code: yes / no
- Tier badge:
- /dashboard/markets accessible: yes / no
- /dashboard/alerts accessible: yes / no
- /dashboard/otoole accessible: yes / no

## Anything weird
(free-form — any console errors, layout glitches, banners about waitlist when there shouldn't be one, etc.)
```

---

## Boundaries

- DO NOT retry the password more than twice — rate-limit avoidance.
- DO NOT navigate away from `*.sneakersterminal.com`.
- DO NOT submit the signup form on this email — it will 409 every time.
- If `/dashboard` redirects to `/dashboard/waitlist` (or shows the waitlist banner), that means the code-burn didn't take effect — capture URL + page content and STOP. Do NOT click around trying to fix it; that's an ops issue.
- Redact the password from any screenshots or logs.
