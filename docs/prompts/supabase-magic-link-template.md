# Chrome prompt — Brand the Supabase magic-link email

Replaces Supabase's default plain magic-link email with a Sneakers Terminal–branded HTML template that matches the invite email we already send via Resend. The email your users get when they hit **/login** → "SIGN IN" will stop looking like a bare Supabase stock template.

---

Task: update the "Magic Link" email template in the Supabase Auth dashboard.

Prerequisites:
- Logged into supabase.com
- Project ref: **ujfgtkebslesepbjrhyr**

---

Step 1 — Open the template editor

1. Go to https://supabase.com/dashboard/project/ujfgtkebslesepbjrhyr/auth/templates
2. In the left list, click **Magic Link**.
3. There are three fields to update: **Subject**, **Message body (HTML)**, and (optional) the plain-text fallback if shown. Paste the blocks below into each.

---

Step 2 — Subject

Paste this into the **Subject** field (replacing any existing value):

```
> Your Sneakers Terminal sign-in link
```

---

Step 3 — Message body (HTML)

Paste this into the **Message body** field (replacing any existing value). Note the `{{ .ConfirmationURL }}` token — Supabase fills it in at send time.

```html
<div style="font-family: ui-monospace, 'SF Mono', Menlo, monospace; background: #fff; color: #1a1f2c; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb;">
  <div style="font-size: 11px; color: rgba(0,66,37,0.6); margin-bottom: 16px; letter-spacing: 0.05em;">SNEAKERS TERMINAL / SIGN IN</div>
  <div style="font-size: 16px; color: #004225; margin-bottom: 8px; font-weight: 600;">&gt; Your one-time sign-in link.</div>
  <div style="font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
    Click the button below to sign in. This link is single-use and expires in an hour.
  </div>

  <div style="text-align: center; margin-bottom: 24px;">
    <a href="{{ .ConfirmationURL }}" style="display: inline-block; background: #00703c; color: #ffffff; padding: 14px 36px; text-decoration: none; font-weight: 600; letter-spacing: 0.05em;">
      SIGN IN →
    </a>
  </div>

  <div style="background: #f8f5ee; border: 1px solid rgba(0, 112, 60, 0.2); padding: 14px; text-align: center; margin-bottom: 24px;">
    <div style="font-size: 11px; color: #6b7280; letter-spacing: 0.15em; margin-bottom: 6px;">OR PASTE THIS URL</div>
    <a href="{{ .ConfirmationURL }}" style="font-size: 11px; color: #00703c; word-break: break-all; text-decoration: none;">{{ .ConfirmationURL }}</a>
  </div>

  <div style="font-size: 12px; color: #6b7280; line-height: 1.6; margin-bottom: 16px;">
    If you didn&apos;t request this email, you can ignore it — nothing will happen until the link is clicked.
  </div>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 11px; color: #9ca3af;">
    — Sneakers Terminal
    <br>
    <a href="https://sneakersterminal.com" style="color: #00703c; text-decoration: none;">sneakersterminal.com</a>
  </div>
</div>
```

---

Step 4 — Save + screenshot

1. Click **Save** at the bottom of the template editor.
2. Screenshot the saved template so we know the new version is live.

---

Step 5 — (Optional) Repeat for the "Invite user" + "Confirm signup" templates

If you want the same brand across all Auth emails, the two other templates worth aligning are:
- **Invite user** — triggered by `admin.inviteUserByEmail()`. We don't currently call this (we issue our own invite codes via Resend), so low priority.
- **Confirm signup** — triggered if "Confirm email" is ON in Auth → Providers → Email. We have that **off** (magic link is the confirmation), so low priority.

Only tackle these if you turn on email confirmation later.

---

Step 6 — End-to-end test

1. Open a private/incognito tab.
2. Go to **https://sneakersterminal.com/login** (or the preview deploy).
3. Enter **jacksonfitzgerald25@gmail.com** and click **SIGN IN →**.
4. Open the email in Gmail — the styling should match the invite emails we send via Resend (white bg, Wimbledon green button and accents, monospace font).
5. Click **SIGN IN →** in the email — you should land on **/admin** (since `ADMIN_EMAILS` is set) authenticated.
6. Screenshot both the email and the logged-in admin page.

---

If the template editor rejects the HTML with "Unknown template variable" or similar, the only tokens we use here are:
- `{{ .ConfirmationURL }}` — the link the user clicks

Supabase templates also support `{{ .Email }}`, `{{ .Token }}`, `{{ .SiteURL }}`, `{{ .RedirectTo }}` if you want to add them. None are required for this template to render.
