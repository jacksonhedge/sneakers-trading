# Chrome prompt — Apply migration 002_referrals.sql

Applies the referral-tracking migration to the Sneakers Terminal Supabase project via the dashboard SQL editor. Must run **before** the site takes referral-enabled traffic.

---

Task: apply migration 002_referrals.sql to the Sneakers Terminal Supabase project. Urgent — production code deploying right now expects this schema.

Prerequisites:
- Logged into supabase.com
- Project ref: ujfgtkebslesepbjrhyr

Step 1 — navigate
Go to: https://supabase.com/dashboard/project/ujfgtkebslesepbjrhyr/sql/new

Step 2 — paste this SQL into the editor

```sql
-- 002_referrals.sql
-- Adds referral tracking to waitlist.

alter table public.waitlist
  add column if not exists referral_code text unique,
  add column if not exists referred_by_code text,
  add column if not exists direct_referrals int not null default 0,
  add column if not exists indirect_referrals int not null default 0;

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

alter table public.waitlist
  alter column referral_code set not null;

alter table public.waitlist
  add constraint waitlist_referred_by_code_fkey
  foreign key (referred_by_code) references public.waitlist(referral_code)
  on delete set null;

create index if not exists waitlist_referred_by_code_idx
  on public.waitlist (referred_by_code)
  where referred_by_code is not null;

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
    update public.waitlist
      set direct_referrals = direct_referrals + 1
      where referral_code = new.referred_by_code;
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
```

Step 3 — click Run (or Cmd+Enter)

Step 4 — verify
- Result panel should show "Success. No rows returned."
- Then navigate to Table Editor → public → waitlist
- The table should now have these columns visible in addition to the old ones: referral_code (text, unique), referred_by_code (text), direct_referrals (int4, default 0), indirect_referrals (int4, default 0)
- The existing row(s) should now have a value populated in the referral_code column.

Step 5 — report back
- Confirm the SQL ran successfully (screenshot the result panel)
- Screenshot Table Editor showing the 4 new columns
- Tell me the referral_code that got assigned to the existing row (we need this for testing — it's not sensitive, just 6 characters)
- If there's any error message, copy the exact text verbatim before retrying anything

Do NOT:
- Run any other SQL
- Change RLS policies
- Edit any row manually

If the migration errors, the most likely cause is the existing row had unexpected NULLs; stop and paste the error.
