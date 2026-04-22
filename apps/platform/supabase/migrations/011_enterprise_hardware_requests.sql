-- 011_enterprise_hardware_requests.sql
-- Extends enterprise_inquiries with hardware-bundle tracking so the admin
-- overview can surface hardware requests separately from pure software
-- inquiries. Enterprise tier = $20K+ setup (Mac Studio / MacBook Pro
-- bundled) + recurring software. Most enterprise deals involve hardware;
-- this lets us flag + inventory.

alter table public.enterprise_inquiries
  add column if not exists hardware_interest      boolean not null default false,
  add column if not exists hardware_form_factor   text
    check (hardware_form_factor in ('mac_studio', 'macbook_pro', 'unspecified')),
  add column if not exists hardware_config_notes  text;

create index if not exists enterprise_inquiries_hardware_interest_idx
  on public.enterprise_inquiries (hardware_interest)
  where hardware_interest = true;

comment on column public.enterprise_inquiries.hardware_interest is
  'True when the prospect wants a dedicated Mac Studio / MacBook Pro '
  'bundle as part of their Enterprise contract. Set by the Contact Sales '
  'form checkbox. Roughly tracks whether a deal includes our hardware VAR '
  'markup or is pure recurring software.';

comment on column public.enterprise_inquiries.hardware_form_factor is
  'Which Apple hardware form factor they want: mac_studio, macbook_pro, '
  'or unspecified (default when they tick the box without picking).';

comment on column public.enterprise_inquiries.hardware_config_notes is
  'Free-form sales notes on hardware config — CPU tier, RAM, storage, '
  'custom API integrations requested, on-site vs shipped, etc. This '
  'feeds the eventual hardware-bundle calculator in /admin/enterprise.';
