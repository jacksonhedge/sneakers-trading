-- 002_referrals.sql
-- Adds referral tracking to waitlist: each row gets a unique code,
-- may reference a referrer, and has denormalized direct/indirect counters
-- that an AFTER INSERT trigger maintains.

-- 1. Add columns. referral_code is unique but initially nullable so we can
--    backfill existing rows before enforcing NOT NULL.
alter table public.waitlist
  add column if not exists referral_code text unique,
  add column if not exists referred_by_code text,
  add column if not exists direct_referrals int not null default 0,
  add column if not exists indirect_referrals int not null default 0;

-- 2. Backfill existing rows with random codes.
--    6-char upper-alpha+digit, excluding 0/O/I/1 for readability.
--    (This is a one-shot backfill; normal inserts come from the application
--    with its own collision-retry loop.)
do $$
declare
  r record;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  attempt int;
begin
  for r in select id from public.waitlist where referral_code is null loop
    attempt := 0;
    loop
      code := '';
      for i in 1..6 loop
        code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      begin
        update public.waitlist set referral_code = code where id = r.id;
        exit;
      exception when unique_violation then
        attempt := attempt + 1;
        if attempt > 10 then
          raise exception 'Could not generate unique referral_code after 10 attempts';
        end if;
      end;
    end loop;
  end loop;
end $$;

-- 3. Lock in NOT NULL now that every row has a code.
alter table public.waitlist
  alter column referral_code set not null;

-- 4. FK on referred_by_code. Kept ON DELETE SET NULL so removing a referrer
--    orphans their referrals rather than cascading deletes.
alter table public.waitlist
  add constraint waitlist_referred_by_code_fkey
  foreign key (referred_by_code) references public.waitlist(referral_code)
  on delete set null;

create index if not exists waitlist_referred_by_code_idx
  on public.waitlist (referred_by_code)
  where referred_by_code is not null;

-- 5. Trigger: on insert, if referred_by_code is set, increment:
--    - direct_referrals on the referrer
--    - indirect_referrals on the referrer's referrer (2nd degree)
--    Uses SECURITY DEFINER so the trigger can write regardless of the
--    caller's role (we always insert via service_role anyway, but future-
--    proof).
create or replace function public.waitlist_increment_referral_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grandparent_code text;
begin
  if new.referred_by_code is not null then
    -- Direct (1st degree)
    update public.waitlist
      set direct_referrals = direct_referrals + 1
      where referral_code = new.referred_by_code;

    -- Indirect (2nd degree): look up the referrer's own referrer.
    select referred_by_code into grandparent_code
      from public.waitlist
      where referral_code = new.referred_by_code;

    if grandparent_code is not null then
      update public.waitlist
        set indirect_referrals = indirect_referrals + 1
        where referral_code = grandparent_code;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists waitlist_referral_counters on public.waitlist;
create trigger waitlist_referral_counters
  after insert on public.waitlist
  for each row
  execute function public.waitlist_increment_referral_counters();
