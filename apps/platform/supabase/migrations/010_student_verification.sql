-- 010_student_verification.sql
-- Per-user student verification record. Approved rows trigger a 75% Stripe
-- coupon (STUDENT75, restricted to Pro + Elite price IDs in the Stripe
-- dashboard) attached server-side at Checkout creation.
--
-- Verification flow:
--   1. User submits .edu email + Instagram handle + LinkedIn URL +
--      declared graduation year via /dashboard/billing modal.
--   2. Row inserted/upserted with status='pending'.
--   3. Admin reviews in /admin/students; approves or rejects.
--   4. On approve, expires_at is derived from grad_year (June 30 of that
--      year + 30-day slack). Re-verification re-uses the same row.
--
-- Trust model: we don't OAuth into IG or LinkedIn — the three-signal
-- requirement (.edu email already verified by login + IG + LinkedIn) plus
-- admin eyeballing raises the cost of fraud above what the 75% discount is
-- worth. Bulk abuse (>5 verifications/day from the same university) is
-- flagged for review (enforced in the API route, not the schema).

create table if not exists public.student_verification (
  id                uuid primary key default gen_random_uuid(),
  waitlist_user_id  uuid not null unique references public.waitlist(id) on delete cascade,
  edu_email         text not null,
  instagram_handle  text not null,    -- normalized: no @, lowercase
  linkedin_url      text not null,
  university_name   text,             -- auto-derived from edu domain when known
  university_domain text,             -- e.g. "harvard.edu"; convenience for the bulk-flag check
  grad_year         int not null check (grad_year between 2020 and 2040),
  status            text not null default 'pending'
    check (status in ('pending','approved','rejected','pending_reverification')),
  submitted_at      timestamptz not null default now(),
  verified_at       timestamptz,
  verified_by       text,             -- admin email that approved/rejected
  rejection_reason  text,
  expires_at        timestamptz,      -- on approve: June 30 of grad_year + 30d slack
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists student_verification_status_idx
  on public.student_verification (status);
create index if not exists student_verification_expires_at_idx
  on public.student_verification (expires_at)
  where status = 'approved';
create index if not exists student_verification_university_domain_idx
  on public.student_verification (university_domain, submitted_at desc);

comment on table public.student_verification is
  'One row per waitlist user requesting the 75% student discount. Status '
  'gates whether /api/stripe/checkout attaches the STUDENT75 coupon for '
  'Pro + Elite subscriptions.';
comment on column public.student_verification.edu_email is
  'Submitted .edu email address. NOT used for auth — user is already '
  'authenticated via their primary email. Stored for admin review only.';
comment on column public.student_verification.instagram_handle is
  'Normalized: stripped @ + lowercased. Admin opens '
  'https://instagram.com/<handle> in a new tab to spot-check.';
comment on column public.student_verification.linkedin_url is
  'Full URL as submitted. Admin clicks through to spot-check.';
comment on column public.student_verification.university_domain is
  'Lowercase domain part of edu_email (e.g. harvard.edu). Used for the '
  'per-day per-university abuse-flag check (>5 submissions = review).';
comment on column public.student_verification.expires_at is
  'When the discount lapses. Derived from grad_year on approve. A weekly '
  'cron (deferred to a follow-up) flips status to pending_reverification '
  'when this passes; user must re-submit to keep the discount.';

-- updated_at trigger so admin actions (approve / reject) bump the timestamp.
create or replace function public.touch_student_verification()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_verification_touch on public.student_verification;
create trigger student_verification_touch
  before update on public.student_verification
  for each row execute function public.touch_student_verification();

alter table public.student_verification enable row level security;

-- Users can read their own verification row (drives the badge on the
-- billing page). Writes go through the API route only (service role).
create policy student_verification_self_read on public.student_verification
  for select using (
    waitlist_user_id in (
      select id from public.waitlist where lower(email) = lower((auth.jwt() ->> 'email'))
    )
  );
