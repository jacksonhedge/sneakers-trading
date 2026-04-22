# Notifications setup — VAPID + Resend + Vercel cron

Companion to `docs/HANDOFF_NOTIFICATIONS.md`. Runnable checklist for the
human steps that the code can't do.

## 1. Generate VAPID key pair

VAPID is the auth scheme for the Web Push API. Push services (Apple, Google,
Mozilla) require server requests be signed with a key registered for the
sending application. One key pair per environment.

```bash
npx web-push generate-vapid-keys
```

Output:

```
=======================================
Public Key:
BL...   ← 87-char base64url

Private Key:
B-...   ← 43-char base64url
=======================================
```

Paste into `apps/platform/.env.local`:

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BL...
VAPID_PRIVATE_KEY=B-...
VAPID_SUBJECT=mailto:support@sneakersterminal.com
```

The `VAPID_SUBJECT` is the contact email shown to push services if our
sending behaviour ever needs investigation. Use a real, monitored address.

For Vercel: add the same three env vars in **Project Settings → Environment
Variables** for both Production and Preview environments. The PUBLIC key
gets embedded in the client bundle; the PRIVATE key stays server-only.

**Don't regenerate.** If you regenerate, every browser that subscribed
under the old public key needs to re-subscribe (the subscription endpoints
become invalid). Treat VAPID keys as forever per environment.

## 2. CRON_SECRET for Vercel cron auth

Vercel cron POSTs to your route with a fixed `Authorization: Bearer <secret>`
header. The header value is the env var named `CRON_SECRET`. Generate any
random 32+ char string:

```bash
openssl rand -hex 32
```

Set as:

```bash
CRON_SECRET=<the-hex-string>
```

Both the cron handler and Vercel's cron infra read from this var. Don't
rotate without a synchronous redeploy — a mismatch silently kills all
notifications.

## 3. Vercel cron config

Already in `apps/platform/vercel.json` (created by this PR):

```json
{
  "crons": [
    { "path": "/api/cron/evaluate-standard", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/evaluate-business", "schedule": "* * * * *" }
  ]
}
```

After deploy, verify in **Vercel Dashboard → Project → Settings → Cron Jobs**
that both schedules show as registered. Both routes return 401 without the
correct `CRON_SECRET` so it's safe to leave them on a public URL.

## 4. Resend (already configured)

Email dispatch reuses the existing Resend client wired in `lib/email.ts`
for the waitlist confirmation flow. The `RESEND_API_KEY` env var should
already be set. No additional configuration here.

If Resend has not been configured yet, see Resend's docs and set:

```bash
RESEND_API_KEY=re_...
EMAIL_FROM=alerts@sneakersterminal.com    # must be a domain you've verified in Resend
```

## 5. iOS Safari caveat

iOS Safari (16.4+) supports the Web Push API **only for installed PWAs**.
A user visiting sneakersterminal.com on iPhone Safari without "Add to Home
Screen" first will get a "permission denied" or "subscribe failed" — this
is expected. The settings UI surfaces a tooltip about this. The iOS native
app (apps/ios/) uses Apple's APNs separately and is not part of this brief.

## 6. Testing locally

Browser push works against `http://localhost:3000` only if the browser
treats it as a secure context (Chrome does for localhost; some others
require HTTPS).

The CRON routes can be hit manually:

```bash
curl -X POST http://localhost:3000/api/cron/evaluate-standard \
  -H "Authorization: Bearer $CRON_SECRET"
```

Look for the summary log line: `[cron:standard] rules=N fired=N delivered=N skipped_quiet=N errors=N ms=N`.
