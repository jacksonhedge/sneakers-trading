# Captain Dashboard — member sync, seats, treasury, settings

Written 2026-04-25. Companion to PLAN_GROUPS_AND_PRODUCT_SPLIT.md.
This is what a captain sees AFTER they sign up their org and authenticate.

## TL;DR

`/dashboard/org` — single route, 5 tabs, captain-only access. The captain
admin surface for the entire group lifecycle: invite members, manage seats,
configure the treasury, control the bot, set group rules.

Built incrementally. **Ship Members tab first** (invite via paste-list +
CSV + Google OAuth), then Seats, then fold in Treasury (already exists at
`/dashboard/treasury`), then Bot config (depends on autonomous-bot infra),
then Settings (captain transfer, disband).

## Route + access

- **Route**: `/dashboard/org`
- **Access**: any authenticated user whose email matches an
  `organization_signups.org_leader_email`. Cleanest gate at the top of the
  page; redirect non-captains to `/dashboard`.
- **Source of truth**: a single Supabase row in `organization_signups`
  identifies the org + captain via `org_leader_email`. Co-captains (when
  they exist) are tracked in a separate `organization_members` table —
  not built yet.

## Tab structure

```
[Members] [Seats] [Treasury] [Bot] [Settings]
```

Active tab is reflected in the URL: `/dashboard/org?tab=members` etc, so
deep-links work and back-button doesn't reset state.

## Tab 1 — Members (the primary feature)

Three sub-flows:

### A. Paste-list invite (~30 min build, universal)

A textarea where the captain pastes any-format list:
- Comma-separated: `j@uf.edu, m@uf.edu, p@uf.edu`
- Newline-separated (one per line)
- Mixed with names: `Jeremy <j@uf.edu>` — strip names, keep emails
- Slack-style mentions: `@jeremy <mailto:j@uf.edu|j@uf.edu>` — extract email
- Apple Mail copy/paste: `Jeremy Albus <j@uf.edu>; Mike Smith <m@uf.edu>`

Client-side parser:
1. Split on `,`, `;`, `\n`, whitespace
2. Match `[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` regex
3. Lowercase + dedupe
4. Show parsed list as deletable pills (user can remove false positives)
5. Submit button shows count: "INVITE 14 MEMBERS"

### B. CSV / .vcf upload (~30 min build, universal)

Drop-zone or "Choose file" button accepting `.csv`, `.vcf`, `.txt`:
- **CSV**: parse via PapaParse, look for any column containing `@`,
  treat each row's first email-shaped value as a member
- **vCard (.vcf)**: parse `EMAIL:foo@bar.com` lines. Apple Contacts
  exports as vcf; Google Contacts can export either format.
- **Plain text**: same as paste-list

Result merges into the same parsed-list pills as path (A). User can review
+ edit before submitting.

### C. Google Contacts OAuth (~half day, magical)

"Import from Google Contacts" button → OAuth consent → People API →
fetched contacts → checkbox list (filterable, dedupe-aware):

```
☐  All (250)
☑  Jeremy Albus           j@uf.edu
☑  Mike Smith             m@uf.edu
☐  Mom                    janet@gmail.com
...
```

User checks the ones they want, clicks "Add 14 selected to invite list" →
those merge into the parsed-list pills above.

Backend setup (one-time):
1. Google Cloud Console → new project "Sneakers Web"
2. Enable People API
3. OAuth consent screen → External, request scope
   `https://www.googleapis.com/auth/contacts.readonly`
4. Credentials → OAuth Client ID → Web application → add redirect URI
   `https://sneakersterminal.com/api/oauth/google/callback`
5. Copy client_id + client_secret to Vercel env

Frontend:
- New endpoint `GET /api/oauth/google/start?redirect=/dashboard/org` that
  generates state + redirects to Google consent
- New endpoint `GET /api/oauth/google/callback` that exchanges the code
  for tokens, fetches contacts via People API, stores temp results in a
  short-lived Supabase row keyed by `state`
- Client polls or subscribes to that row, renders the picker

**Production gotcha**: Google's OAuth consent screen for sensitive scopes
(contacts is sensitive) requires app verification before allowing >100
users. Submit verification 1-2 weeks before launch. Test users (up to 100)
work without verification while you're shipping.

### Persistence

When the captain submits a final invite list (any combination of A/B/C):

```sql
-- Migration 020 (apply via Supabase SQL Editor)
CREATE TABLE IF NOT EXISTS organization_member_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organization_signups(id) ON DELETE CASCADE,
  invited_email   text NOT NULL,
  invited_by      uuid REFERENCES auth.users(id),
  status          text NOT NULL DEFAULT 'pending', -- pending | sent | accepted | bounced | revoked
  invite_code     text,                            -- minted when status moves to 'sent'
  invited_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  accepted_at     timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id),
  CONSTRAINT org_member_invitations_email_per_org UNIQUE (org_id, invited_email)
);

CREATE INDEX org_member_invitations_org_idx
  ON organization_member_invitations (org_id, status);
CREATE INDEX org_member_invitations_email_idx
  ON organization_member_invitations (lower(invited_email));
```

API: `POST /api/org/invite` accepts `{ emails: string[] }`, validates each,
upserts (so re-submitting same list is idempotent), and queues email
delivery via Resend (when verified).

### Member roster view

Below the invite tools, show a roster table:

```
Email                  Status     Sent          Accepted
j@uf.edu               accepted   2 days ago    1 day ago
m@uf.edu               sent       2 days ago    —
p@uf.edu               bounced    2 days ago    —
new@uf.edu             pending    just now      —
```

Captain actions per row:
- **Resend invite** (if status='sent' or 'bounced')
- **Revoke** (only valid for pending/sent — can't unaccept)
- **Promote to co-captain** (post-MVP)

## Tab 2 — Seats

Read-only header showing current usage:
```
14 / 25 seats used  ───────────█████████████░░░░░░░
```

If captain wants more: "Need more seats? Contact sales →" mailto.

If they want fewer: pause/cancel link to `/dashboard/billing`.

Post-MVP: in-line tier upgrade — "Bumping to 50 seats moves you from
$799/mo to $1,299/mo. Confirm?" with Stripe portal redirect.

## Tab 3 — Treasury

Already exists at `/dashboard/treasury`. Two options:

1. **Iframe it** — embed the existing page inside a tab. Simplest.
2. **Refactor it** as a shared component used by both `/dashboard/treasury`
   (standalone) and `/dashboard/org?tab=treasury`. Cleaner long-term.

Pick option 1 for MVP, refactor when the standalone page is deprecated.

Adds a small extra: which Safe address gets attributed as the *group*
treasury (vs. captain's personal). When the org is verified, the captain
nominates their connected Safe as the group treasury → flips a bit on
`organization_signups`.

## Tab 4 — Bot

Depends on PLAN_AUTONOMOUS_BOTS.md. When that ships:
- Group bot config (rule editor, budget, kill switch)
- Pending approvals queue (trades > captain threshold)
- Recent trade feed
- Members visibility into bot activity (read-only for non-captains)

Until bots ship, this tab shows a "Coming with autotrade — join the
waitlist" placeholder linking to `/dashboard/settings/autotrade`.

## Tab 5 — Settings

- **Captain transfer** — pick a member, confirm, captain role moves to
  them. Original captain becomes a regular member. (Why: brothers
  graduate. Captain ages out.)
- **Group description** — short bio shown on leaderboard
- **Notification prefs** — captain controls what other members see
- **Disband** — destructive, requires typed-name confirmation. Marks the
  org as `disbanded_at`, freezes the leaderboard, suspends the bot,
  initiates Stripe cancellation.

## Implementation order

| Phase | Scope | Effort |
|---|---|---|
| 1 | Route + access gate + tab nav skeleton | 0.5 day |
| 2 | Members tab — paste-list + CSV + roster view (no email send yet) | 1 day |
| 3 | Migration 020 (organization_member_invitations) + persistence | 0.5 day |
| 4 | Seats tab (read-only) + Treasury tab (iframe) + Bot tab placeholder | 0.5 day |
| 5 | Email-send via Resend (depends on Resend domain verified) | 0.5 day |
| 6 | Settings tab (transfer, disband) | 1 day |
| 7 | Google OAuth contact sync | 0.5 day for code, +1-2 weeks for app verification |

**Total: ~4 days of code + 2 weeks calendar for OAuth verification.**

## Backend dependencies before Phase 5 ships

1. **Resend domain verified** — same as the returning-user-login blocker
2. **Migration 020 applied** — via the Supabase SQL Editor flow
3. **Org invite-code generator** — adapt the existing waitlist invite-code
   logic to mint group-scoped codes that pre-attach the joiner to the org

## Open questions

1. **Authentication for new captains**: when a captain submits the wizard,
   they don't have an account yet. They need to authenticate before the
   captain dashboard is reachable. Currently they get a "CONTINUE TO SIGN
   IN →" button → `/login`. But `/login` depends on Resend (magic link).
   For paid org tiers, instant onboarding probably means a Stripe-checkout
   redirect that completes auth on success. Worth a separate plan when
   we wire up the org Stripe products.

2. **Co-captains** — supported in spec, not in MVP. When does a captain
   need help? Bigger orgs (100+ members?). Not for the first 50 frats.

3. **Members joining without invitation** — can a member self-join with
   their own org's invite code, or must the captain invite them first?
   MVP: captain-invite only (cleaner audit trail).

4. **What about invitees without verified .edu?** — we can still add them
   as invitees, but they don't get the student discount until verified.
   Captain pays the seat cost regardless.

5. **Tournament integration** — see PLAN_TOURNAMENTS.md (companion doc).
   Captain dashboard's Bot tab will eventually show "we're in 2 active
   tournaments" — needs the tournament infra first.

## Starting point for next session

1. Read this doc + PLAN_GROUPS_AND_PRODUCT_SPLIT.md
2. Phase 1 first commit: create `/dashboard/org/page.tsx` with the access
   gate + tab nav. Server component, redirects non-captains to `/dashboard`.
3. Phase 2: build the paste-list parser (pure client TypeScript, no
   backend yet). Can be tested without any DB changes.
4. Phase 3: write migration 020, paste into Supabase SQL Editor, apply.
5. Phase 4: wire the parser to `POST /api/org/invite` which writes to
   the new table.

That's a solid 2-3 day chunk for one focused session.
