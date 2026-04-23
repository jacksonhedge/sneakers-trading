# Get me into sneakersterminal.com — no email required

For Claude Chrome. The human needs to sign into the live site NOW without waiting for magic-link email delivery (which is broken in test-mode Resend). Generate the link straight from the Supabase dashboard and hand it back.

**Target email:** `jacksonfitzgerald25@gmail.com` (the human's admin email — already in `ADMIN_EMAILS` for the app).

## Step 1 — open the Supabase project

1. Go to **supabase.com/dashboard** and log in.
2. Open the **Sneakers** project. It's the one with project ref `ujfgtkebslesepbjrhyr` in the URL — if the human has multiple Supabase projects, pick the one whose URL contains that string.

## Step 2 — find or create the user

1. Left sidebar → **Authentication → Users**.
2. Search the table for `jacksonfitzgerald25@gmail.com`.
3. If the row **exists**: click it. Skip to Step 3.
4. If the row does **NOT exist**:
   - Click **"Add user"** (top-right) → **"Create new user"**.
   - Email: `jacksonfitzgerald25@gmail.com`
   - Password: leave blank / auto-generate (we won't use it)
   - **Auto Confirm User**: checked ✅
   - Save. Then click the new row.

## Step 3 — generate the magic link inline

1. On the user detail view, look for a **`…` menu** (three dots) or a **"Send magic link"** button. Exact UI varies by Supabase version, but one of these two paths exists:
   - **Option A — inline URL**: "Send magic link" reveals the URL right in the dashboard. Copy it.
   - **Option B — email only**: "Send magic link" dispatches an email. If that's all we can do, fall back to Step 4.

2. If you got a URL from Option A, paste it into a fresh browser tab. It starts with `https://sneakersterminal.com/auth/callback?code=...`. Hit Enter. That lands on the dashboard.

3. **Done.** Report the URL you used (partial — first 80 chars is fine) so the human has a record.

## Step 4 — fallback if dashboard only sends email, no inline URL

1. Open **SQL Editor** in the left sidebar.
2. Run this to confirm the user exists:
   ```sql
   select id, email, created_at from auth.users
   where email = 'jacksonfitzgerald25@gmail.com';
   ```
3. If there's a row, open a terminal and run this one-liner (the human has Supabase service-role key in `apps/platform/.env.local`):
   ```bash
   cd ~/sneakers-trading/apps/platform
   pnpm exec tsx -e "
   import { createClient } from '@supabase/supabase-js';
   import { config } from 'dotenv'; config({ path: '.env.local' });
   const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
   const { data, error } = await sb.auth.admin.generateLink({
     type: 'magiclink',
     email: 'jacksonfitzgerald25@gmail.com',
     options: { redirectTo: 'https://sneakersterminal.com/auth/callback' },
   });
   if (error) { console.error(error); process.exit(1); }
   console.log(data.properties.action_link);
   "
   ```
4. That prints the magic-link URL. Click it.

## Step 5 — once signed in, report

Paste back:

```
Path used: Step 3 (dashboard inline) / Step 4 (admin API fallback)
Landed at: <final URL after clicking the magic link>
Session cookie present: yes / no  (DevTools → Application → Cookies, look for sb-*-auth-token)
Dashboard loaded: yes / no  (any 500s in DevTools Network?)
```

## What NOT to do

- Don't add the user via the `auth` schema in SQL editor — use the dashboard's "Add user" button so Supabase handles confirmation properly.
- Don't change any existing user's email or password.
- Don't paste the generated magic-link URL anywhere public (it's single-use, but still — treat like a password for the next 60 minutes).
