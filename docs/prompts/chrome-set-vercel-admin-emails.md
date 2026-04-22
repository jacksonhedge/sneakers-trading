# Chrome prompt — set ADMIN_EMAILS on Vercel + redeploy

Adds `ADMIN_EMAILS=jacksonfitzgerald25@gmail.com` to the Sneakers Terminal Vercel project's Production + Preview environment variables, then triggers a redeploy so the `/admin` bypass starts working on `https://sneakersterminal.com`.

Without this, admin emails on prod fall through to the normal waitlist path — the admin bypass code only triggers when `ADMIN_EMAILS` is set in the Vercel runtime env.

---

Task: add the `ADMIN_EMAILS` environment variable to the Sneakers Terminal Vercel project and redeploy.

Prerequisites:
- Logged into vercel.com with access to the project that deploys `sneakersterminal.com`

---

Step 1 — Open the Vercel dashboard and find the project

1. Navigate to: https://vercel.com/dashboard
2. Find the project that deploys the Sneakers Terminal site (name probably contains "sneakers" or "platform"). The production URL is `https://sneakersterminal.com` — you can also confirm by looking at the project's "Domain" column in the dashboard list.
3. Click into the project.
4. Screenshot the project overview so we know which project was modified.

If you can't tell which project is the right one, stop and ask me.

---

Step 2 — Go to Environment Variables

1. In the project sidebar, click **Settings**.
2. In the settings sub-nav, click **Environment Variables**.
3. Screenshot the current list of environment variables (values can stay redacted — we just want to know which names are already set).

Confirm these are already present (don't change them — we're only adding):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

---

Step 3 — Add the new variable

1. Click **Add New** (or similar — the button label may be "Add Another" depending on the Vercel UI version).
2. Fill in:
   - **Key**: `ADMIN_EMAILS`
   - **Value**: `jacksonfitzgerald25@gmail.com`
   - **Environments**: check **Production** and **Preview** (leave Development unchecked unless you know you want it).
3. Click **Save**.
4. Confirm the new row appears in the list, labeled for Production + Preview.
5. Screenshot the saved state.

---

Step 4 — Redeploy the latest commit

Env var changes in Vercel don't affect running deployments — a new build is required to pick up the new value.

1. In the project sidebar, click **Deployments**.
2. Find the most recent Production deployment (sorted top).
3. Click the **⋯** (three-dot) menu on that row → click **Redeploy**.
4. In the dialog, leave **"Use existing Build Cache"** unchecked (optional — either works, uncached is safer for env changes but slower).
5. Click **Redeploy** to confirm.
6. Wait for the build to finish (typically ~30-90 seconds for this project). Watch the status indicator flip from "Building" → "Ready".
7. Screenshot the final "Ready" status.

---

Step 5 — Verify the env var is live

1. Open a new tab to **https://sneakersterminal.com/login**.
2. Type `jacksonfitzgerald25@gmail.com` in the email field.
3. Click **SIGN IN →**.
4. Expected: the green **"Magic link sent. Check jacksonfitzgerald25@gmail.com for a sign-in link. You'll land on /admin."** card appears inline.
5. If instead you see a state card for "You're on the waitlist" or "Welcome back" (with a POSITION shown), the env var isn't taking effect — tell me, don't retry blindly. Likely causes: build still deploying, wrong project, or variable saved for a different environment.
6. Screenshot the "Magic link sent" success card.

Don't click the link in the email — we want the user's personal Chrome to do that, since the PKCE verifier cookie is set per-browser.

---

Step 6 — Report

Summarize:
- Which Vercel project was modified (name + URL)
- That `ADMIN_EMAILS` was added for Production + Preview
- That a redeploy ran to "Ready" state
- Outcome of the Step 5 verification (magic-link card seen, or unexpected state)
- Screenshots at each step

Do NOT paste the full env-var VALUE in your report — the value (`jacksonfitzgerald25@gmail.com`) isn't secret but the convention is to redact env values in logs.
