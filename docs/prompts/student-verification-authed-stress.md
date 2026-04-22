# Authed stress test — student verification flow

## Context

The `/api/student/submit` endpoint is auth-gated — a stress script without a session can only verify that unauthed requests get rejected. The actual input-validation logic only runs after auth. This prompt walks a real user session through every edge case so we can see what the endpoint does with each malformed body.

**Target:** `https://sneakersterminal.com` (swap to preview URL if student feature isn't on prod yet)

**Throwaway account:** use `stresstest+student-<random6>@sneakersterminal.com` so the admin cleanup button can wipe it after.

## Setup — one time

1. Go to `https://sneakersterminal.com/signup`. Paste `stresstest+student-<random6>@sneakersterminal.com`, submit.
2. Wait for magic-link email (delivered to `jackson@hedgepayments.com` in test mode). Click it.
3. Land on `/dashboard`. Open DevTools → Application → Cookies. Copy the `sb-<project>-auth-token` cookie value.
4. Keep that tab open for session cookies to stay valid. Alternatively: use DevTools → Network → copy any authenticated request as cURL to get the right headers.

## Probes to run

For each row below, POST to `/api/student/submit` with the given JSON body. Record the exact HTTP status + response body.

**Content-type:** `application/json`. Include the Supabase auth cookie on every request.

### A — valid baseline (sanity check)

| # | body | expected |
|---|---|---|
| A1 | `{"edu_email": "stresstest@harvard.edu", "instagram_handle": "testuser", "linkedin_url": "https://linkedin.com/in/testuser", "grad_year": 2027}` | 200 `{ok: true, status: "pending"}` |

If A1 doesn't return 200, stop and report — the endpoint is broken or auth isn't attaching.

### B — input validation

| # | body | expected | what we're testing |
|---|---|---|---|
| B1 | `{"edu_email": "foo@example.com", ...}` | 400 `edu_email_required` | Reject non-.edu |
| B2 | `{"edu_email": "foo@sydney.edu.au", ...}` | 400 `edu_email_required` | Reject foreign .edu.xx |
| B3 | `{"edu_email": "foo@fake.edu.co", ...}` | 400 `edu_email_required` | Reject attacker-controlled .edu.co |
| B4 | `{"edu_email": "foo@tinyschool.edu", ...}` | 200 `flaggedDomain: true` | Unknown .edu → accepted + flagged |
| B5 | `{"edu_email": "foo@mail.harvard.edu", ...}` | 200 (subdomain of known .edu) | Accepts subdomains |
| B6 | `{"edu_email": "` + "a".repeat(10000) + `@harvard.edu", ...}` | **400 or 413** — should NOT be 200 | Length cap missing today, per code inspection |
| B7 | `{..., "instagram_handle": "https://instagram.com/foo?ref=bar"}` | 200, `instagram_handle` stored as `foo` | URL → handle normalization |
| B8 | `{..., "instagram_handle": "@@foo"}` | 400 `invalid_instagram` | Double-at rejected |
| B9 | `{..., "instagram_handle": ""}` | 400 `invalid_instagram` | Empty rejected |
| B10 | `{..., "instagram_handle": "` + "a".repeat(5000) + `"}` | 400 `invalid_instagram` | Length check (regex caps at 30) |
| B11 | `{..., "linkedin_url": "https://evil.linkedin.com/in/foo"}` | 200 (regex permits any subdomain) | Document the subdomain-wildcard behavior |
| B12 | `{..., "linkedin_url": "https://not-linkedin.com/foo"}` | 400 `invalid_linkedin` | Reject non-LinkedIn host |
| B13 | `{..., "grad_year": "2027"}` | 200 (string coerced) | Tolerates stringified numbers |
| B14 | `{..., "grad_year": 1900}` | 400 `invalid_grad_year` | Far past rejected |
| B15 | `{..., "grad_year": 2100}` | 400 `invalid_grad_year` | Far future rejected |
| B16 | `{..., "grad_year": NaN}` | 400 `invalid_grad_year` | NaN handled |
| B17 | omit any one field | 400 `missing_fields` with `required` list | Missing-field message |

### C — stored-XSS payloads (admin UI renders these)

After running each of C1–C3, open `/admin/students` in a separate tab and verify the row renders as plain text, not as active HTML/JS. **This is the highest-severity test** — if the admin UI renders user input as HTML, an attacker compromises any admin who opens the review queue.

| # | field to exploit | payload |
|---|---|---|
| C1 | edu_email | `<script>alert('xss-edu')</script>@harvard.edu` |
| C2 | instagram_handle | `<img src=x onerror=alert('xss-ig')>` |
| C3 | linkedin_url | `https://linkedin.com/in/"><script>alert('xss-li')</script>` |

Each should either be rejected at the API (ideal — C2 will fail the Instagram regex) OR stored and rendered as escaped text in the admin UI (acceptable). If ANY of them executes in the browser when you open `/admin/students`, it's a critical bug. Screenshot.

### D — concurrency + idempotency

D1. Submit A1's body twice rapidly (within 500ms). Verify: one row in `student_verification`, `submitted_at` reflects the second submission (upsert working).

D2. Have admin approve the row via `/admin/students` UI. Then resubmit A1's body. Verify: row's `status` flips back to `pending`, `verified_at` and `expires_at` reset to null. **This is worth flagging — the code resets approval on resubmit; if that's not intentional, an approved user clicking the form again loses their discount.**

### E — bulk-fraud flag

Only run this if you want to exercise the bulk-flag log path. Requires 6 throwaway accounts.

E1. Sign up 6 separate accounts with distinct `stresstest+student-bulk<N>@sneakersterminal.com` addresses.
E2. Submit each with a DIFFERENT edu_email but the SAME university domain (e.g., `a@harvard.edu`, `b@harvard.edu`, ..., `f@harvard.edu`).
E3. After the 6th submission, check prod logs for `[student/submit] bulk-flag:` warning line.
E4. **Expected today:** warning is logged but each submission still returns 200 — bulk-flag is log-only. Confirm or escalate.

### F — auth bypass sanity

F1. Clear cookies entirely. POST A1's body. Expected: 401 `unauthenticated`. If it's anything else, critical bug.

F2. Paste a fake JWT as the `sb-*-auth-token` cookie. POST A1's body. Expected: 401.

## Report format

Return the results as a markdown table:

| probe | expected | actual status | actual body (first 120 chars) | pass/fail | notes |

Plus:
- Any XSS payload that executed in `/admin/students` (screenshot if possible)
- Whether D2's approval-reset behavior seems intentional or like a UX bug
- Confirmation that 6 bulk submissions log the warning line on the server

## Cleanup

After you're done, have the user run `pnpm admin:stress:cleanup` (only catches `stress+*` rows; student rows are on a different table and need manual deletion via `/admin/students` → Reject each, or direct SQL on `student_verification` table).
