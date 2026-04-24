# Apply Supabase migration backlog (13 migrations)

Tested 2026-04-24 against production Supabase. **13 migrations are missing** and need to be applied in one shot. The bundle is at `/tmp/sneakers-migrate/backlog.sql` (~886 lines of SQL, all idempotent).

## What's missing + why it matters

| # | Migration | Blocks |
|---|---|---|
| 002 | referrals | Referral program attribution |
| 006 | user_credits | O'Toole credit balance |
| 007 | stripe_subscriptions | **Paid signup — webhook crashes without this** |
| 008 | otoole_daily_usage | Free-tier O'Toole rate limit |
| 009 | user_provider_keys | BYOK LLM keys |
| 010 | student_verification | **Student discount flow 500s without this** |
| 011 | enterprise_hardware_requests | Enterprise intake |
| 012 | alerts | Alert subscriptions |
| 014 | user_profiles | Onboarding answers, leaderboard join, treasury, autotrade waitlist |
| 015 | leaderboard | College leaderboard MVP |
| 016 | autotrade_waitlist | Autotrade feature waitlist |
| 017 | organization_signup | **Full org data capture (currently fails silently)** |
| 018 | safe_treasury | Chapter multisig treasury |

**Already applied in prod** (don't need to rerun): 001, 003, 004, 005, 013.

## Option A — paste into Supabase SQL Editor (fastest, ~2 min)

1. Open TextEdit with the bundled SQL (command below) and copy the entire contents
2. Go to your Supabase project dashboard
3. SQL Editor (left sidebar) → New query
4. Paste the entire bundle
5. Click **Run** (bottom right, or ⌘+⏎)
6. Watch the results panel — should say `Success. No rows returned` for each statement
7. Any `ERROR: permission denied` on auth.users / auth.uid() means the SQL needs to run as the `postgres` role; Supabase SQL Editor runs as `postgres` by default so this shouldn't happen, but if it does flag it

**Open the SQL bundle in TextEdit:**

```bash
open -e /tmp/sneakers-migrate/backlog.sql
```

## Option B — hand to a Chrome agent

Paste the following prompt into Claude Chrome:

---

I need you to apply a bundled SQL migration to our Supabase project. The SQL is at `/tmp/sneakers-migrate/backlog.sql` on my machine — I'll paste its contents directly into the chat when you're ready. All statements are idempotent (IF NOT EXISTS), so re-running is safe.

**Execute these steps in order:**

1. Navigate to https://supabase.com/dashboard — confirm you have access to the project `sneakers-terminal` (or whatever the project name is). Tell me the project name you see.
2. Click the project → left sidebar → **SQL Editor**
3. Click **New query** (or **+** icon)
4. Tell me when you're on an empty SQL editor window, and I'll paste the full bundle.
5. After I paste, click **Run** (or ⌘+⏎). Tell me the result — expected is a series of `Success. No rows returned` messages, one per statement.
6. If any statement fails, paste me the exact error and the line of SQL it failed on. Do not proceed past the failure.
7. After success, open a new SQL Editor query tab and run this verification:
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
   ```
   Paste the result back — I expect to see all of: waitlist, referrals, venue_access_requests, user_credits, stripe_subscriptions, otoole_daily_usage, user_provider_keys, student_verification, enterprise_hardware_requests, alerts, user_profiles, leaderboard_positions.

**Boundaries:**
- Do not modify any other Supabase settings
- Do not run any SQL other than the bundle I paste + the verification SELECT
- If you're prompted for destructive confirmations (DROP, TRUNCATE), STOP — nothing in this bundle should trigger those

---

## Option C — I run it myself (if you paste the Postgres URI)

Supabase → Project Settings → **Database** → **Connection string** → **URI** tab → copy. Paste in chat, I apply + verify in ~30 seconds.

## After migrations are applied

Immediately do these sanity checks via prod:

1. **Org signup**: fill out the org form on `/` — success card should now show full org name, and the DB row will have `org_type`, `org_leader_name`, `org_college` populated (previously these silently dropped).
2. **Student verification flow**: `/students` → submit the form → no 500.
3. **Pricing page**: `/pricing` should render all tiers (was potentially crashing on missing `stripe_subscriptions` queries).

If any of those still fail, paste me the Vercel function logs and I diagnose.

## Security note

The bundle contains no secrets, only schema. Safe to leave in `/tmp/sneakers-migrate/` or delete after:

```bash
rm -rf /tmp/sneakers-migrate
```
