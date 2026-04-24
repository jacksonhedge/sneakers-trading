-- Extend live student_verification with the columns admin review needs.
--
-- The live table only has: id, user_id, email, university_name, status,
-- verified_at, expires_at, created_at, updated_at. The application code
-- legitimately needs more — Instagram + LinkedIn URLs are the human-review
-- signal we use to confirm someone's a real student, grad_year drives
-- expires_at when admin approves, and rejection_reason / verified_by show up
-- in the admin queue.
--
-- All ADDs are nullable so existing rows are fine.
-- Idempotent via IF NOT EXISTS — safe to re-run.

ALTER TABLE student_verification
  ADD COLUMN IF NOT EXISTS instagram_handle text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS grad_year integer,
  ADD COLUMN IF NOT EXISTS university_domain text,
  ADD COLUMN IF NOT EXISTS verified_by text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- Backfill submitted_at from created_at on existing rows so the bulk-fraud
-- detector (which queries submitted_at >= window) sees pre-existing rows.
UPDATE student_verification
   SET submitted_at = created_at
 WHERE submitted_at IS NULL;

-- Make the column non-null going forward. Default to now() so rows inserted
-- without an explicit submitted_at get one automatically.
ALTER TABLE student_verification
  ALTER COLUMN submitted_at SET DEFAULT now();

-- Index on submitted_at + university_domain so the bulk-fraud query
-- (count submissions per domain in last N hours) is cheap.
CREATE INDEX IF NOT EXISTS student_verification_domain_recent_idx
  ON student_verification (university_domain, submitted_at DESC)
  WHERE university_domain IS NOT NULL;

-- The submit endpoint upserts on user_id — make sure that column has a
-- unique index so onConflict='user_id' works correctly. The PK on id alone
-- isn't enough.
CREATE UNIQUE INDEX IF NOT EXISTS student_verification_user_id_uniq
  ON student_verification (user_id);
