# Chrome prompt — verify Resend domain for sneakersterminal.com

Paste to Claude Chrome. This unblocks returning-user login (currently broken in prod because Resend is in test mode).

---

I need to set up Resend email delivery for my production domain `sneakersterminal.com`. Please execute and report back.

## Phase 1 — Add the domain in Resend

1. Navigate to https://resend.com/domains
2. If `sneakersterminal.com` is already listed, note its current status (Verified / Pending / Not started) and skip to Phase 2
3. If not listed, click **Add Domain** → type `sneakersterminal.com` → pick region closest to me (most likely `us-east-1`) → Add
4. Resend will show a list of DNS records I need to add (typically 3: one `TXT` for SPF, one `TXT` for DKIM/return-path, and one `MX` or `CNAME`)
5. Copy each DNS record verbatim — record type, host/name, and value — and paste them back to me in a code block. I'll need to add them at my domain registrar.

## Phase 2 — (after I add DNS records)

I'll tell you when DNS is added. Then:

1. Back on https://resend.com/domains → click `sneakersterminal.com`
2. Click **Verify DNS records** (or whatever the equivalent button is)
3. Report whether it says Verified or still Pending. DNS propagation can take up to 48 hours but usually completes in minutes.
4. Once verified, navigate to https://resend.com/api-keys
5. Confirm there's a production API key. If `RESEND_API_KEY` on Vercel starts with `re_` it's real; if it starts with `re_xxx` test pattern, it may need replacing with a production key.

## Phase 3 — Test delivery

Once the domain shows Verified:
1. In a new browser tab, go to https://sneakersterminal.com/login
2. Type my email: `jacksonfitzgerald25@gmail.com`
3. Submit. Watch the response — should be "Magic link sent."
4. Open my Gmail. Within 60 seconds an email from `hi@sneakersterminal.com` (or whatever the WAITLIST_FROM_EMAIL env var is set to) should arrive.
5. Report PASS or FAIL. If FAIL, paste the Resend dashboard's delivery logs from https://resend.com/emails — the most recent send should show success/failure reason.

## Boundaries

- Do not change anything about the sending domain besides verification
- Do not rotate API keys unless the current one is demonstrably invalid
- Report rather than guess if any step's UI differs from what's described
