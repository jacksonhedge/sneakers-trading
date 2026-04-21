# Chrome prompt — Configure Supabase Auth for magic-link sign-in

Configures Supabase Auth for email OTP (magic-link) sign-in, with the redirect URLs the /signup → /auth/callback flow needs. No passwords; invite-code gating happens in our own /api/auth/request-link before we call Supabase.

---

Task: configure Supabase Auth on the Sneakers Terminal project for magic-link sign-in.

Prerequisites:
- Logged into supabase.com
- Project ref: ujfgtkebslesepbjrhyr

---

Step 1 — URL configuration

1. Go to https://supabase.com/dashboard/project/ujfgtkebslesepbjrhyr/auth/url-configuration
2. Set "Site URL" to:  https://sneakersterminal.com
3. In "Redirect URLs" (allow-list), add each of these on a new line (any already present can stay):
   - https://sneakersterminal.com/auth/callback
   - https://*.vercel.app/auth/callback
   - http://localhost:3000/auth/callback
4. Click Save.
5. Screenshot the saved state.

---

Step 2 — Providers: email config

1. Go to https://supabase.com/dashboard/project/ujfgtkebslesepbjrhyr/auth/providers
2. Expand "Email" (it should already be enabled by default).
3. Settings inside Email provider — confirm or adjust as follows:
   - Enable Email provider: ON
   - Confirm email: **OFF** (we're using magic link as the confirmation; we don't want a separate confirmation click required)
   - Secure email change: leave ON (default)
   - Secure password change: doesn't matter — we aren't using passwords
4. Click Save.
5. Screenshot the Email section.

---

Step 3 — Auth → Sign In / Providers → Sign Up settings

1. Go to https://supabase.com/dashboard/project/ujfgtkebslesepbjrhyr/auth/providers
2. Scroll to "User Signups" (might be under a separate Sign In / Providers tab).
3. Confirm:
   - Allow new users to sign up: **ON** (our API calls supabase.auth.signInWithOtp() which needs this)
   - Allow manual linking: OFF (default)
   - Allow anonymous sign-ins: OFF (default)
4. If any of those differ, fix and Save.

---

Step 4 — Email templates (optional, can defer)

1. Go to https://supabase.com/dashboard/project/ujfgtkebslesepbjrhyr/auth/templates
2. Look at "Magic Link" template. The default is usable; do NOT change the `{{ .ConfirmationURL }}` variable or any variable in curly braces.
3. If you want to customize the copy later, that's fine — for v1 the default template is good enough. Just make sure you DON'T change the URL variable.

Do NOT touch this template unless you're confident.

---

Step 5 — Report back

- Screenshot of URL Configuration page (Site URL + Redirect URLs list)
- Screenshot of Email provider settings (especially the Confirm Email toggle state)
- Screenshot of User Signups settings
- Confirm no errors at any step

Do NOT:
- Enable any third-party OAuth provider (Google, GitHub, etc.) — not needed for v1
- Change the Site URL away from sneakersterminal.com
- Disable the Email provider
- Touch SMTP settings (we're letting Supabase send auth emails; Resend is for our own confirmation emails and is unrelated)
- Remove existing redirect URLs in the allow-list unless duplicated

If any step fails or the UI is different than described, stop and screenshot what you see.
