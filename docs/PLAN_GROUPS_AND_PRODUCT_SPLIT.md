# Groups + Simple/Medium/Terminal product split — plan

Written 2026-04-24. Decomposing the "groups with team captains" and the
"Simple / Medium / Terminal" product tiers into buildable chunks.

## TL;DR

The product vision is **three tiers of Sneakers**, each a distinct experience on the same underlying data:

| Tier | Who | What they get | What they pay |
|---|---|---|---|
| **Simple** | Casual college users, waitlist signups, curious browsers | Read-only dashboard with market prices, college leaderboard (paper trading only), pick-a-side polls | Free |
| **Medium** | Active student traders | Everything in Simple + O'Toole chat + multi-book price comparison + alerts + groups (captain + team rankings) + tier-gated arbitrage scanner | $10/mo students, $39/mo non-students |
| **Terminal** | Power users, frats running pools, enthusiasts who'll actually auto-trade | Everything in Medium + autotrade engine + user-defined AI strategies + wallet-linked real-money leaderboard + signal-sharing network (Numerai-style) | $25/mo students, $99/mo non-students |

**Groups** are orthogonal to tiers — anyone on Medium+ can create/join a group; Simple users can be invited to a group but must upgrade to actively trade in it. Group captains have elevated permissions (invite, remove, set rules, assign roles).

**Sequencing**: scope groups first (smallest lift, unlocks team-vs-team leaderboards which is tonight's natural next step). Don't rebrand to Simple/Medium/Terminal until we have leaderboard + groups adoption data — premature tier rename just adds churn.

---

## Part 1 — Groups + team captains

### Product shape

- **Group** = up to 50 users with a captain, a name, a school (inherited from captain), a private group leaderboard, and optional group-level rules (e.g. "max $500 per paper position")
- **Roles**: captain (1), co-captain (up to 2), member (rest). Captain can promote/demote, invite, remove, set rules, transfer captaincy. Co-captains can invite + remove members but not dissolve the group.
- **Membership**: invite-only in MVP. Captain generates an 8-char invite code (same pattern as site invite codes) or a shareable link. Invitee accepts via `/dashboard/groups/join?code=XXX`. Auto-approve if .edu matches group's school (frat/sorority use case); manual approve otherwise.
- **Leaderboards**: each group has its own internal ranking. Additionally, groups compete on the national group-leaderboard by aggregated stake-weighted ROI (same metric as individual).

### Schema

```sql
-- migration 016_groups.sql

CREATE TABLE leaderboard_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,                   -- url-safe, e.g. "uf-sae-fall-2026"
  display_name    text NOT NULL,                          -- "SAE @ UF"
  college         text NOT NULL,                          -- inherited from captain; single-school for MVP
  captain_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  disbanded_at    timestamptz,
  max_members     int NOT NULL DEFAULT 50,
  max_position_usd numeric(12,2),                         -- optional group rule
  invite_code     text UNIQUE,                            -- 8-char, regenerable
  description     text,

  CONSTRAINT leaderboard_groups_slug_format CHECK (slug ~ '^[a-z0-9-]{3,40}$')
);

CREATE INDEX leaderboard_groups_college_idx ON leaderboard_groups (college) WHERE disbanded_at IS NULL;

CREATE TABLE leaderboard_group_memberships (
  group_id    uuid NOT NULL REFERENCES leaderboard_groups(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member',     -- 'captain' | 'co_captain' | 'member'
  joined_at   timestamptz NOT NULL DEFAULT now(),
  invited_by  uuid REFERENCES auth.users(id),

  PRIMARY KEY (group_id, user_id),
  CONSTRAINT leaderboard_group_memberships_role CHECK (role IN ('captain','co_captain','member'))
);

CREATE INDEX leaderboard_group_memberships_user_idx ON leaderboard_group_memberships (user_id);

-- Pending invites (captain sends to specific email, before the user signs up).
CREATE TABLE leaderboard_group_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL REFERENCES leaderboard_groups(id) ON DELETE CASCADE,
  invited_email   text NOT NULL,
  invited_by      uuid NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  accepted_at     timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id),
  revoked_at      timestamptz,

  CONSTRAINT leaderboard_group_invites_email UNIQUE (group_id, invited_email)
);

-- Extend leaderboard_positions to link to a group when the user opened the
-- position "as part of the group". Nullable — positions outside groups still
-- count toward individual leaderboard.
ALTER TABLE leaderboard_positions
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES leaderboard_groups(id) ON DELETE SET NULL;

CREATE INDEX leaderboard_positions_group_idx ON leaderboard_positions (group_id, opened_at DESC)
  WHERE group_id IS NOT NULL;

-- Group rollup — stake-weighted ROI per group, plus member count.
CREATE MATERIALIZED VIEW leaderboard_group_rollup AS
SELECT
  g.id                        AS group_id,
  g.slug,
  g.display_name,
  g.college,
  (SELECT COUNT(*) FROM leaderboard_group_memberships WHERE group_id = g.id) AS member_count,
  COUNT(p.id)                 AS trade_count,
  SUM(p.simulated_stake)      AS total_staked,
  SUM(p.pnl)                  AS total_pnl,
  SUM(p.pnl) / NULLIF(SUM(p.simulated_stake), 0) AS weighted_roi
FROM leaderboard_groups g
LEFT JOIN leaderboard_positions p
  ON p.group_id = g.id AND p.status = 'resolved'
WHERE g.disbanded_at IS NULL
GROUP BY g.id, g.slug, g.display_name, g.college
HAVING COUNT(p.id) >= 10 AND SUM(p.simulated_stake) >= 500;

CREATE UNIQUE INDEX leaderboard_group_rollup_id_idx ON leaderboard_group_rollup (group_id);
```

### API routes

```
POST   /api/groups/create                 → captain creates a new group
POST   /api/groups/:id/invite             → captain/co-captain invites email or generates link
POST   /api/groups/:id/join                → accept invite by code
POST   /api/groups/:id/leave              → member leaves (captain must transfer first)
POST   /api/groups/:id/transfer-captain   → captain only, assigns to existing member
POST   /api/groups/:id/member/:uid/role   → captain sets role (promote/demote)
DELETE /api/groups/:id/member/:uid        → captain/co-captain removes member
GET    /api/groups/:id                    → group metadata + member list (gated to members)
GET    /api/groups/:id/leaderboard        → group's internal rankings
GET    /api/groups/leaderboard            → national cross-group rankings
```

### UI routes

```
/dashboard/groups                         → list groups I'm in + "Create a group" CTA
/dashboard/groups/create                  → captain setup (name, college, rules)
/dashboard/groups/:slug                   → group home: members, internal leaderboard, recent picks
/dashboard/groups/:slug/invite            → captain tool (generate code, invite by email)
/dashboard/groups/join?code=XXXXXX        → accept invite
/dashboard/groups/:slug/settings          → captain settings
```

### Cost + risk notes

- **Scope creep watch**: group chat / comments / reactions are tempting to add but belong in V2+. MVP = joinable + leaderboard, that's it.
- **Hostile captain**: someone makes a frat group, becomes captain, removes everyone else at the wrong moment. Mitigation: members can leave anytime; captain transfer requires another member to accept; captain can't remove themselves until they transfer.
- **Invite abuse**: bad actor spams invite links. Mitigation: rate-limit invite creation to 10/day per captain.
- **Duplicate groups per school**: someone makes "UF" as a group, blocking other UF groups from having that name. Mitigation: slug uniqueness at the database level, but display-name can collide; users pick from a disambiguated list.

### Effort estimate

**~4 days for MVP groups:**
- 1 day: schema + migration + API routes
- 1.5 days: UI (list, create, home, invite, join, settings pages)
- 0.5 day: invite email via Resend (depends on Resend being prod-verified)
- 0.5 day: testing + edge cases (captain transfer, member leave, disband)
- 0.5 day: admin-side moderation tools (disband abusive group, force-transfer captain)

---

## Part 2 — Simple / Medium / Terminal tier split

### What each tier *actually* is

Each tier inherits everything below it. Differentiation is **which surfaces are gated**, not three separate apps.

#### Simple (free)
- Landing + `/venues` + `/markets` (read-only browsing, not full dashboard)
- Sign-up, profile, onboarding
- **College leaderboard** (paper trading, auto-join if student-verified)
- **Group membership** (can join but cannot create)
- Pick-a-side polls: 1 per day, no stake
- Limited O'Toole (5 messages/day, Haiku only)

**Goal**: bring college kids in the door, let them experience the product without friction.

#### Medium ($10 students / $39 non-students, monthly)
Everything in Simple, plus:
- **Full dashboard** (Biggest Volume, Big Movers, Upcoming Resolutions, arbitrage panel, category row)
- **Multi-book price comparison** in market drawer (cross-venue arbs visible)
- **O'Toole** — Sonnet default, 50 msg/day, conversation memory (PLAN_OTOOLE.md Level 1)
- **Alerts** — price drift, new arb, resolution countdowns
- **Groups — create + captain** (not just join)
- **Paper trading leaderboard — competitive** (ranking by stake-weighted ROI, both individual + group)
- **Venue deep-links** (affiliate URLs to bet at partner books)

**Goal**: convert the engaged portion of college users, give them the full dashboard.

#### Terminal ($25 students / $99 non-students, monthly)
Everything in Medium, plus:
- **Autotrade engine** — user-configured rules execute trades on Polymarket (first), NoVig, ProphetX
- **AI strategies** — natural-language strategy definition ("when Kalshi diverges >5pp from Polymarket on the same market, buy the cheaper side, max $50") compiled to rule sets
- **Signal sharing network** (Numerai-style) — users' on-chain positions + resolution outcomes feed into a shared market-intelligence model that non-Terminal users can read but only Terminal users can write to
- **Real-money leaderboard** (wallet-linked, optional) — verifiable on-chain P&L, separate board from paper trading
- **Priority O'Toole** — Opus default, 500 msg/day, full tool-calling (fetch market history, check positions, compute sizing)
- **API access** — read-only JSON feed of arbs + drifts + user's positions, for users who want to build their own tools

**Goal**: monetize the <1% of users who will pay $99/mo for an AI-assisted trading advantage.

### Migration strategy from current tiers

Current: Pro ($39) / Elite ($99) / Business ($299) / Fraternity ($149) — all generic.

Migration path:
1. **Phase 1 — add Simple as a distinct free tier** (not just "unauthenticated"). Label change in UI + tier-gates code. 1 day.
2. **Phase 2 — rename Pro → Medium, Elite → Terminal** in all user-facing copy. Keep Stripe product IDs stable (no mid-flight billing changes). 1 day of copy edits.
3. **Phase 3 — deprecate Business + Fraternity as consumer tiers**. Move Business to "contact sales" pricing (enterprise deal). Move Fraternity into the Groups feature (group-level billing at a per-seat discount, not a tier). 2 days.
4. **Phase 4 — build the actual Terminal-gated features** (autotrade, AI strategies, signals network). Months.

### What this rebrand enables

- **Clearer value ladder** — "Simple free → Medium power user → Terminal AI pro" is a story anyone gets in 5 seconds
- **Better conversion funnel** — Simple is the on-ramp, Medium is the default paid tier, Terminal is the aspirational upsell
- **Kills tier confusion** — right now Pro/Elite/Business is vague. Names describe *what the tier is*, not *how premium it is*

### What this rebrand does NOT solve

- Core product-market-fit ("will a college student pay $10/mo for a multi-book terminal?")
- The Resend email-delivery bottleneck
- Scraper reliability
- Mobile responsive gaps

Don't do the rebrand if those aren't solid. Rebranding a broken product makes a cleaner-named broken product.

### Effort estimate (rebrand only, not the new Terminal features)

**~3 days:**
- 1 day: tier constant rename + Stripe product metadata + copy edits across `/pricing`, `/dashboard/billing`, tier-gate labels, landing page
- 0.5 day: Simple tier in the tier hierarchy (tier-gates.ts, require-tier.ts)
- 0.5 day: admin dashboard tier selectors updated
- 0.5 day: QA across tiers (does a Pro → Medium user see the right UI?)
- 0.5 day: migration notes for existing Pro/Elite subscribers (comms email)

### Effort estimate (Terminal-exclusive features, after rebrand)

**Months, phased:**

| Feature | Effort | Blocked by |
|---|---|---|
| Autotrade on Polymarket | 2 weeks | wallet onboarding + Polygon integration + consent UX (autotrade-tos branch) |
| Natural-language strategy compiler | 3 weeks | O'Toole Level 3 (tool-calling) complete |
| AI strategy execution loop | 2 weeks | autotrade + compiler both live |
| Signal-sharing network | 4 weeks | schema design, signal quality scoring, anti-gaming for signal submitters |
| Real-money leaderboard | 1 week | wallet-linked Polymarket position index |
| Terminal API | 1 week | rate limiting, auth-by-key, billing tie-in |

**Total: ~13 weeks of focused work for full Terminal tier.** Realistically 4-5 months with other priorities mixing in.

---

## Sequencing (what to build when)

### Now (this week)
1. **Finish leaderboard MVP** (PLAN_COLLEGE_LEADERBOARD.md) — position-open + display + resolve cron
2. **Groups MVP** — schema + API + UI per Part 1 above (~4 days)

### Near-term (next 2 weeks)
3. **Rebrand Simple / Medium / Terminal** — pure naming + tier-gate copy, no new features (~3 days)
4. **Resend delivery solved + 9 Supabase migrations applied** (tonight's blockers)
5. **First 100 college testers recruited** — per ROADMAP priority

### Medium-term (1-2 months)
6. **Autotrade MVP on Polymarket** — simple limit-order rules, consent flow, full audit log (~2 weeks)
7. **O'Toole Level 2** — per-user preferences + Level 3 — tool calling (PLAN_OTOOLE.md)
8. **Wallet-linked real-money leaderboard** — V2 of college leaderboard

### Long-term (3-6 months)
9. **Natural-language strategy → rule-set compiler**
10. **Signal-sharing network** — the real differentiator from any competitor
11. **Fraternity-scale features** — group billing, treasury pooled stakes, captain-managed shared wallet (regulatory surface opens here; careful)

---

## Biggest open questions

1. **Can non-students join groups?** MVP says yes (members can be anyone, captain must be student for college-scoped groups). Need UX to handle "invited friend from another school" — do they get the same leaderboard view?
2. **Does group P&L double-count?** A position by user X in group Y shows up in: X's individual leaderboard + Y's group leaderboard + Y's aggregated national ranking. That's fine — they're different views of the same underlying trade.
3. **Signal network: who gets the value?** If Terminal users contribute signals and Simple users read them, Simple users get value for free. Either gate reads, or incentivize contributors with Terminal-tier credits / rev share. Design call TBD.
4. **Does "Terminal" confuse the brand?** The whole product is "Sneakers Terminal"; having a tier called "Terminal" is mildly redundant ("I have the Terminal tier of Sneakers Terminal"). Alternative names: "Pro", "Autotrade", "Edge". Worth a poll.
5. **Are Fraternity tiers actually groups?** If yes, the Fraternity SKU becomes a group-level multi-seat deal ($5/seat/month for a frat of 30), which is cleaner than a separate tier. Migration path from existing Fraternity subscribers TBD.

---

## What I'd ship first

If I had 1 week to prove the vision works:

1. **Day 1-2**: Groups MVP — schema, captain/member flow, simple invite mechanism
2. **Day 3-4**: Leaderboard position-open + display (extends the MVP foundation already shipped tonight)
3. **Day 5**: Group-vs-group leaderboard integration — groups compete on aggregate ROI
4. **Day 6-7**: Land first 10 real groups (frats, dorm cohorts, CS classes) manually. Measure:
   - Does a group drive their members to trade more than individuals?
   - Do captains actually invite people?
   - Is the group leaderboard checked more than the individual one?

That's the signal I'd use to decide whether the Terminal-tier rebuild + autotrade + AI strategy work is worth the months of engineering. If groups don't drive engagement on their own, the Terminal layer won't save anything.

---

## Review cadence

- After first 10 groups form, revisit this doc — what worked, what was weak
- Before any Terminal-exclusive feature starts, re-read Phase 4 to ensure the naming landed + is worth building on
