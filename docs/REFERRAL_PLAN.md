# Referral Program — Plan

**Status:** proposed, not started
**Prerequisite:** Resend wired up (needed for "you got a referral" emails — can start building without it, but launching without email is pointless)

---

## Goal

Turn the waitlist into a viral growth loop: every person who signs up gets a unique shareable link, and referring someone moves them up the queue. Pre-launch waitlist → post-launch user base without paid acquisition.

Target behavior: most signups share the link at least once before leaving the site. 2–3 referrals per signup would be a big win.

---

## User-facing mechanics (the default I'm proposing)

**Hybrid position-jump + tier rewards model.** (This is the Robinhood / Superhuman pattern; it works because it gives both a real-time dopamine hit *and* concrete rewards.)

**Per-referral:** each confirmed referral bumps the referrer **5 positions up** the queue.

**Tier unlocks:**
- **1 referral** → *Early Access* (first wave at launch)
- **3 referrals** → *Priority Access* (private beta before public launch, discounted first-year pricing)
- **10 referrals** → *Founder Tier* (lifetime discount or equivalent — nail down at launch)

**What a new signup sees:**
1. Submit email → get the same `> Access requested.` confirmation
2. Card below it shows: "You're #57 in the queue. Here's your link: `sneakersterminal.com/r/A7X9F2`. Every signup moves you up 5."
3. Copy-button + native share menu on mobile + pre-composed tweet
4. Live counter of how many they've referred ("0 of 1 for Early Access, 0 of 3 for Priority")

**What a referral sees:** when someone clicks `sneakersterminal.com/r/A7X9F2`, the landing page shows a small banner — "Referred by an operator. Sign up to give them a boost." Otherwise identical flow.

**Confirmation email update** (extends tonight's email): includes the referral link + tier progress.

**Notification email (new):** when a referral of yours signs up, send "Referral confirmed. You're now #52 in the queue, 1 of 3 for Priority Access."

---

## Data model

Extend `waitlist` table (migration `002_referrals.sql`):

```sql
alter table waitlist
  add column referral_code text unique,
  add column referred_by_code text references waitlist(referral_code),
  add column confirmed_referral_count int not null default 0;

create index waitlist_referral_code_idx on waitlist (referral_code);
create index waitlist_referred_by_code_idx on waitlist (referred_by_code);
```

**`referral_code`**: generated at insert time, 6-char alphanumeric (uppercase, no 0/O/I/1 for readability). Space = ~30M, collision-proof at our scale. Generated app-side (not DB) so we can retry on collision before insert.

**`referred_by_code`**: nullable FK (self-referential) to the referrer's row.

**`confirmed_referral_count`**: denormalized counter to avoid `count(*)` on every page load. Updated via SQL trigger or via app after insert — trigger is cleaner.

**Attribution rules:**
- Only one referrer per signup (first-click wins, tracked via `?ref=CODE` query param → cookie → used on form submit)
- Self-referral blocked (referrer.email != new signup email)
- If referral code is invalid, signup still succeeds, just without attribution

---

## API + route changes

- **`GET /r/[code]`** — new route. Sets a `ref` cookie (30-day TTL), redirects to `/`. Landing page reads the cookie and shows the "referred by an operator" banner + carries the code into the form submission.
- **`POST /api/waitlist`** — accepts optional `referralCode` field. On valid non-self code: store `referred_by_code` and increment the referrer's `confirmed_referral_count`. Fire the referral-notification email to the referrer.
- **`GET /status/[code]`** — personal status page. Shows queue position, tier progress, referral count, and a copy-ready share link. Accessible via the confirmation email.
- **`GET /api/waitlist/count`** — unchanged (landing page counter).

---

## UI changes

- **Landing page:** small "referred by an operator" banner when `ref` cookie is set. Otherwise unchanged.
- **Post-signup card:** replaces the current single-line success message. Shows position, referral link (with copy button), tier progress, share buttons (copy / X / LinkedIn / SMS).
- **Status page `/status/[code]`:** same content as the post-signup card but accessible anytime via the link in the confirmation email.

Kept in the same terminal aesthetic — no design deviation needed.

---

## Anti-abuse

- **Self-referral blocked** at insert time.
- **Email normalization** already in place (lowercased + trimmed); blocks trivial case variants.
- **Rate limit** on `/api/waitlist`: 5 signups per IP per hour. Probably via `upstash/ratelimit` + Redis, or Vercel's built-in. **Decision needed — do we want Upstash free tier or Vercel's own?**
- **Disposable email blocker:** optional, list-based (e.g. `disposable-email-domains` npm package). Medium priority.
- **Verified signup** (click a link in the confirmation email before the referral counts) — adds friction but prevents fake/throwaway signups from gaming the leaderboard. Skip for v1, revisit if we see abuse.
- **Leaderboard cap:** no public leaderboard in v1. Avoids bot-driven name-and-shame.

---

## Phasing

**Phase 1 — code + attribution (1–2 hours of work)**
Migration, code generation, `/r/[code]` route, attribution via cookie, `referred_by_code` + counter fields populated. No UI changes yet. Deploy. Verify attribution works end-to-end with two test signups.

**Phase 2 — user-facing UI (2–3 hours)**
Post-signup card with link + tier progress, `/status/[code]` page, referral-notification email. Update confirmation email to include the link. This is the "launch-able" cut.

**Phase 3 — polish (whenever)**
Social share buttons with pre-composed copy, rate limit, disposable email blocker, share-tracking (UTM on the referral link so we know which channels work).

**Phase 4 — reward fulfillment (at product launch)**
Actually honor the tier perks when we onboard users. This isn't code today; it's product/pricing work.

---

## Open decisions I need from you

1. **Reward structure.** I proposed 5-positions-per-referral + tiers at 1/3/10. Adjust any number or mechanic — e.g. you might want 10 positions per referral, or to skip tiers entirely, or to do cash bounties. Tell me what feels right and I'll bake it in.
2. **Rate limit vendor.** Upstash (free tier, 10k commands/day) vs Vercel's built-in Rate Limiting (paid on Pro, cleaner DX). Defaults to Upstash unless you say otherwise.

Everything else has a default. I'll execute Phase 1 + 2 against the defaults once you confirm or adjust the above.

---

## Success metrics (to track after launch)

- **K-factor**: average referrals per signup. >1 = viral.
- **Fraction of signups that clicked their own referral link at least once** (i.e. engaged with the feature).
- **Top-of-funnel conversion from `/r/[code]` → signup** — tells us if referred users convert better than cold traffic.
- Record these in Supabase (query the waitlist table directly) or ship to a lightweight analytics tool later.
