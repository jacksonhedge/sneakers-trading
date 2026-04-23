# Onboarding V2 — Plan

**Status:** proposed
**Prereqs (met):** Supabase auth live, `/dashboard` shipped, ≥1 scraper flowing (5 live)
**Related:** memory `project_onboarding_v2.md` set the original scope; this doc makes it concrete.

---

## Goal

After invite → magic link → account creation, collect enough about each user to personalize the terminal. Currently we know only their email.

Budget for onboarding: 5 screens, 60 seconds end-to-end, skippable per step but `/dashboard` keeps nagging until complete.

---

## Route shape (locked)

Full-page `/onboarding` route — NOT a modal. Each step is its own path so:
- Refresh-safe
- Progress-bar-friendly
- Works with browser back/forward
- Deep-linkable (support can say "open /onboarding/platforms")

```
/onboarding/about-you       ← state + use-case
/onboarding/platforms       ← checklist + affiliate CTAs
/onboarding/invite-friends  ← email-invite step (contacts-adjacent)
/onboarding/location-check  ← geolocation permission (AFTER invite step by user decision)
/onboarding/done            ← "welcome to the terminal"
```

Each screen has a persistent header showing `Step N of 5` + progress bar + "Skip for now" link. A dedicated `/onboarding/layout.tsx` handles the chrome so step pages stay lean.

## Step detail

### 1. `/about-you` — state + use-case
Two short fields on one screen:
- **US state** — dropdown (50 states + DC). Required.
- **Use case** — radio group: Hobbyist / Semi-pro / Arb hunter / Analyst. Required. Affects which widgets we default the dashboard to.

### 2. `/platforms` — where do you already trade?
Checklist of supported platforms, grouped. Check = "I have an account." For any unchecked platform, show a subtle "Open account" button linking to the WINDAILY affiliate URL (from `reference_windaily_affiliate_links.md`).

Grouping:
- Prediction markets: Polymarket, Kalshi, ProphetX, NoVig, OG Markets, Limitless (marked COMING SOON), Opinion, Gemini
- DFS / Pick'em: PrizePicks, Underdog, Sleeper Picks, DraftKings Pick 6
- Sportsbooks: DraftKings, FanDuel, Fanatics
- Sweeps & Social: Thrillz, Fliff, Stake.us

### 3. `/invite-friends` — the contacts-sync step (web-native v1)
Since there's no standard web Contacts API, v1 is a **paste-emails-to-invite** step. User types or pastes up to 5 email addresses. Backend:
- Checks which are already Sneakers users → shows "Already on Sneakers — follow them?" for each match
- Sends waitlist invites with the user's `referral_code` for the rest
- Attribution counts toward their `direct_referrals` when invitees sign up

Web-only v1. iOS gets native Contacts integration later (which was the pushback from earlier — iOS CNContactStore + hash-match, but that's a whole milestone of its own).

### 4. `/location-check` — geolocation (paired after invite per user decision)
Placed here so we're not blocking signup behind a permission prompt — user has already committed (seen their 3-invite budget on the V2 success card, picked state, selected platforms, invited friends).

Flow:
- Show "Quick check — we need to confirm your location" with a "Check now" button
- Button triggers `navigator.geolocation.getCurrentPosition` (one-shot, low accuracy — city-level is fine)
- Also read IP country server-side from `x-vercel-ip-country` / `cf-ipcountry`
- Reverse-geocode browser coords to US state via Mapbox or Nominatim
- Compare to their claimed state from step 1

**Mismatch handling (decided):** log-only, no blocking. We're not the exchange; Kalshi/Polymarket do their own state verification. We surface a soft warning: *"Your location looks different from the state you entered. You may see different markets than expected."* Still mark `profile_complete_at`.

User can decline the geo prompt — we save whatever we got from IP and continue.

### 5. `/done` — welcome
Confetti-ish terminal message: "Setup complete. Your personalized dashboard is ready." Big button → `/dashboard`.

---

## Data model

New migration `014_user_profiles.sql`:

```sql
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- step 1
  state text,
  use_case text check (use_case in ('hobbyist','semi_pro','arb_hunter','analyst')),

  -- step 2
  platforms_connected text[] not null default '{}',

  -- step 3
  invites_sent_emails text[] not null default '{}',

  -- step 4
  geo_country text,          -- IP-derived, server-side
  geo_state text,             -- browser-derived, reverse-geocoded
  geo_matches_claim boolean,

  -- bookkeeping
  current_step text,                      -- so we can resume
  profile_complete_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_profiles_complete_idx
  on public.user_profiles (profile_complete_at)
  where profile_complete_at is not null;

-- RLS: user can only see/edit their own profile
alter table public.user_profiles enable row level security;

create policy user_profiles_select_own on public.user_profiles
  for select to authenticated using (auth.uid() = user_id);
create policy user_profiles_insert_own on public.user_profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy user_profiles_update_own on public.user_profiles
  for update to authenticated using (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.tg_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

create trigger user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.tg_user_profiles_updated_at();
```

---

## API

- **`POST /api/onboarding/step`** — body: `{ step: 'about-you'|'platforms'|'invite-friends'|'location-check', data: {...} }`. Server upserts the user's `user_profiles` row with the relevant fields and sets `current_step` to the NEXT step. RLS-protected via JWT session.
- **`POST /api/onboarding/invite-emails`** — body: `{ emails: string[] }`. Server validates (≤5, valid format, not self), checks existence in waitlist, sends invites for non-members via the existing Resend pipeline with the user's referral code.
- **`POST /api/onboarding/complete`** — called from `/location-check` or `/done` after geo check. Sets `profile_complete_at = now()`.
- **`GET /api/me/profile`** — returns current user profile row. Used by `/dashboard` to decide whether to redirect to onboarding.

---

## Dashboard gate

`/dashboard/page.tsx` server component reads `user_profiles` for the signed-in user.
- If no row OR `profile_complete_at IS NULL`: redirect to `user_profiles.current_step` (or `/onboarding/about-you` if fresh).
- If complete: render dashboard as today.

Add a "Continue setup" banner as a fallback for anyone who completed partially and dismissed the redirect.

---

## Out of scope (deliberately)

Carrying forward from `project_onboarding_v2.md`:
- Real KYC (name, DOB, SSN) — we're not a broker
- Payment info — we're not charging yet
- Actual platform credentials — too much liability; we only collect "do you have an account"
- Native iOS Contacts integration — iOS-specific, lands in the iOS app M3+

---

## Milestones

- **M1 — Schema + skeleton** (1 day). Migration 014. Layout with progress bar. Empty step pages that save `current_step`.
- **M2 — Step 1 + 2** (1 day). `/about-you` and `/platforms` wired up, affiliate CTAs live.
- **M3 — Step 3 (invites)** (1 day). Email-invite step + `/api/onboarding/invite-emails`.
- **M4 — Step 4 (geo)** (1 day). Browser geolocation + IP cross-check + reverse geocode.
- **M5 — Dashboard gate + /done** (half day). Gate logic, "Continue setup" banner, done screen.

~4.5 days end-to-end.

---

## Decisions before M1 kicks off

1. **Reverse-geocoding provider** — Mapbox (~paid, accurate), Nominatim (OpenStreetMap, free, rate-limited), or Vercel Geolocation edge helper (only city-level but zero integration). I'd default to Nominatim for v1 with a Mapbox upgrade path.
2. **Invite-email cap** — 5 per onboarding step? 10? Higher = more viral, more abuse surface. 5 feels right as an "inner circle" signal.
3. **Can users finish without granting geolocation?** I'd say yes (decline → save IP-only → continue). Otherwise Safari's permission-deny-by-accident kills signups.
4. **Skip link severity** — let every step be skippable (dashboard nag persists until complete) OR require state + use-case as mandatory with rest optional? Mandatory state is reasonable since so many markets depend on it.

Answer any subset + "start M1" and I build.
