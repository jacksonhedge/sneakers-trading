# O'Toole Tenant Isolation — Design + Invariants

How Sneakers' O'Toole AI assistant stays scoped correctly across accounts, especially once business tier lands with team seats. Nothing in this doc is implemented beyond what the current code already does (see "current state" below); this is the design future work must honor.

## The invariants — what we must never do

1. **No cross-tenant data leakage.** A user inside Business A must never see Business B's signals, watchlists, custom prompts, positions, private notes, or anything else that belongs to Business B. Full stop.
2. **No cross-user individual leakage.** Individual-tier users are their own tenant-of-one. Bob's watchlist never gets into Alice's chat.
3. **Shared platform knowledge is fair game.** Market prices, venue catalog, scraper data, public event info — these are global by design. Every tenant gets the same market snapshot in their O'Toole context.
4. **Provider doesn't see tenant context it doesn't need.** If we use Anthropic's prompt caching to save money on the shared portion of system prompts, we must cache ONLY the shared portion — never cache tenant-specific data. (Anthropic's cache is scoped to our API org but logically mixing tenants in a single cached prefix would be a leak anyway.)

## The three-layer prompt model

Every O'Toole chat call builds its prompt from three layers:

```
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 1 — Global (shared, cacheable across all tenants)          │
│                                                                  │
│ • OTOOLE_PERSONA (the persona string — what O'Toole is)          │
│ • Market context (our scraped market data — same for everyone)   │
│ • Venue catalog (what books exist, their attributes)             │
│                                                                  │
│ This portion IS cached via Anthropic's prompt caching.           │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 2 — User-scoped (private, user-level, not cached)          │
│                                                                  │
│ • User's watchlists                                              │
│ • User's recent market views                                     │
│ • User's portfolio (when wallet connects)                        │
│ • User's O'Toole conversation history                            │
│                                                                  │
│ Loaded via queries that include auth.uid() WHERE clauses.        │
│ NEVER cached in Anthropic's prompt cache (user-specific).         │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 3 — Tenant-scoped (private, only for business accounts)    │
│                                                                  │
│ • Business's custom signals (BYO-modeling endpoint data)         │
│ • Business-wide watchlists shared across team                    │
│ • Business's custom prompt templates                             │
│ • Team members' aggregated activity (anonymized where possible)  │
│                                                                  │
│ Loaded via queries scoped to tenant_id. Empty for individual-    │
│ tier users (no tenant_id, no layer 3 content).                   │
└──────────────────────────────────────────────────────────────────┘
```

## Tenant identity

**Currently modeled** (migration 005_account_type):
- `waitlist.account_type` = `individual` | `business`
- `waitlist.company_name` — populated when `account_type = business`
- `waitlist.plan_tier` = `free | pro | elite | business`
- `waitlist.business_subtype` = `standard | fraternity` (flavor of business)

**What's missing** for multi-seat business accounts: a proper `tenants` table with `tenant_id` that multiple users can share. Today, every business user has their own `waitlist` row with their own `company_name` — which means two employees of the same company currently have no way to share a tenant.

**When to add it** — the moment the first business customer buys the 10-seat Business plan. The trigger is real usage, not theoretical architecture. Schema sketch for when that day comes:

```sql
-- Migration (future, probably 010_tenants.sql)
create table if not exists public.tenants (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  plan_tier    text not null check (plan_tier in ('business')),
  subtype      text check (subtype in ('standard','fraternity')),
  created_at   timestamptz not null default now()
);

alter table public.waitlist
  add column if not exists tenant_id uuid references public.tenants(id);

create index if not exists waitlist_tenant_id_idx on public.waitlist (tenant_id);
```

All business-scoped tables from that point on must have `tenant_id` with an index.

## RLS policies — the enforcement layer

Every tenant-scoped table gets a row-level security policy shaped like:

```sql
create policy tenant_isolation_read on public.<business_table>
  for select using (
    -- user can see rows belonging to their tenant
    tenant_id in (
      select tenant_id from public.waitlist where waitlist.email = auth.email()
    )
  );
```

The same shape for `update` and `delete` prevents a user from modifying another tenant's rows. `insert` policies check that the new row's `tenant_id` matches the user's tenant.

For individual users (no `tenant_id`), the policy evaluates to an empty set — they simply see no tenant-scoped rows, which is the correct behavior.

## Current state (April 2026)

The chat route at `apps/platform/src/app/api/otoole/chat/route.ts` today injects **ZERO per-tenant data**:

- Layer 1: ✓ Present (`OTOOLE_PERSONA` + market context from `loadMarkets`)
- Layer 2: ✗ Not yet — user's chat history lives client-side only; no watchlists/portfolio yet
- Layer 3: ✗ Not yet — no business-scoped features exist

So tenant isolation for O'Toole is currently **safe by construction** — nothing tenant-specific enters the prompt. The first moment this becomes a risk is when we add any of:

- Saved watchlists displayed to O'Toole
- User's recent clicks/views
- Business-uploaded custom signals
- Team-shared prompt templates

Each of those additions requires the pattern above (auth-scoped query + RLS + prompt layering).

## BYO API keys + tenant isolation

BYO keys are **per-user**, not per-tenant, by current design. This is the right default:

- Individual user: their BYO key is theirs alone.
- Business user: even though they're in a business tenant, their BYO key is personal (e.g., their own OpenAI Pro account). Another user in the same tenant doesn't see or use it.

**A future "team BYO" feature** — where a business admin provisions a team-wide key that all seats can use — needs a separate `tenant_provider_keys` table with `tenant_id` instead of `user_id`. Not planned for v1. If built, the route would resolve keys in this order: user's personal BYO → tenant's shared BYO → Sneakers env key → 402 insufficient_credits.

## Prompt caching pitfall

Anthropic's prompt caching reduces cost by ~10× on cached portions. The cache is keyed on the exact text of the cached system block. If we ever include tenant-specific data in a block marked `cache_control: { type: 'ephemeral' }`, that data becomes part of the cache key — meaning:

1. A second identical tenant request could hit the cached response.
2. Cache misses would waste cost (every tenant has a different cache prefix).
3. More subtly: if Anthropic's cache infrastructure ever misidentified a cache key across tenant boundaries (astronomically unlikely, but theoretically a supply-chain risk), we'd have a cross-tenant leak.

**Mitigation rule:** cache only Layer 1. Never put Layer 2 or Layer 3 data inside a cached block. Keep them in the uncached portion of the system prompt or in the `messages` array.

Current code already follows this — `OTOOLE_PERSONA` and `marketContext` are the cached blocks; no per-user or per-tenant data is there.

## What O'Toole "knows" about our backend

Requested by user (2026-04-22): "O'Toole's brains to have some backend knowledge of ours, but business data from one business won't extend to another."

Interpreted:

- **Yes, inject Sneakers' backend knowledge** into Layer 1 so O'Toole can answer questions like:
  - "What books do you track?" → venue catalog
  - "What's on NBA tonight?" → market snapshot
  - "How much do credits cost?" → pricing info
  - "What's my tier?" → tier info (Layer 2, user-scoped)
  - "What signals does my team have?" → tenant-scoped signals (Layer 3)
- **Never inject another tenant's data** into Layer 3. Achieved by always filtering tenant-scoped queries by `tenant_id`.

**To enrich Layer 1** (making O'Toole smarter about our platform generally), add to `OTOOLE_PERSONA` or a new sibling block:

- Venue catalog summary (names, categories, affiliate programs)
- Credit pack pricing + conversion (what's a credit worth)
- Tier structure (what each tier unlocks)
- Scraper status (which books have live data, which are pending)
- Latest product update ("we just shipped X")

This is a one-time system-prompt extension, cached globally — cheap in aggregate since it's shared across every call.

## Concrete next steps (when building out)

1. **Wrap all data-loading functions** in tenant-scoped variants:
   - `loadUserWatchlists(userId)` — Layer 2
   - `loadTenantSignals(tenantId)` — Layer 3, returns empty for individual users
   - Never pass raw user objects to the AI — always filter through these.
2. **Extend OTOOLE_PERSONA** with platform knowledge (venue catalog, tier pricing, credit conversion) so users get correct answers about Sneakers itself.
3. **Add a `tenant_id` fixture** when the first business customer lands, via the `tenants` table above.
4. **Unit test the isolation** — a test that creates two tenants, two users, runs an O'Toole call as user-in-tenant-A, verifies the prompt sent to Anthropic does not contain any string from tenant-B's fixtures. This is the one test worth writing because the consequence of failure is a privacy leak.
5. **Audit log** for cross-tenant access attempts — log any query that returns `tenant_id != expected` so we catch an RLS miss before it becomes a leak.

## Summary

- Three-layer prompt model: global (shared), user-scoped, tenant-scoped.
- Only global is cached.
- All tenant-scoped queries go through `auth.uid()`-filtering RLS policies + an explicit tenant_id check.
- BYO keys are per-user today; team BYO is a future `tenant_provider_keys` table.
- Current code is safe because it injects nothing tenant-scoped; design gets tested the first time we add user or tenant context.
