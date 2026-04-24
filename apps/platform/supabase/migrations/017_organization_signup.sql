-- Organization signup fields on the waitlist. When a user signs up as a
-- frat / sorority / dorm / club / class, we capture the org type + who
-- the leader/admin is (separate from the contact email, since the email
-- might belong to someone who's NOT the captain).
--
-- All nullable — defaults are fine, existing rows keep account_type='individual'.

ALTER TABLE waitlist
  ADD COLUMN IF NOT EXISTS org_type text,
  ADD COLUMN IF NOT EXISTS org_leader_name text,
  ADD COLUMN IF NOT EXISTS org_college text;

-- Allowed org types. Loose for now — we can tighten to an enum once we
-- see what people actually write.
CREATE INDEX IF NOT EXISTS waitlist_org_type_idx ON waitlist (org_type)
  WHERE org_type IS NOT NULL;
