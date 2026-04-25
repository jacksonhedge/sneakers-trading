-- Per-org pending member invitations. Captain pastes/uploads emails on
-- /dashboard/org → rows land here with status='pending' → admin approval
-- (or auto-rules) flips to 'sent' → invite email goes out → recipient
-- accepts → status='accepted' + accepted_user_id linked.
--
-- Idempotent via unique (org_id, invited_email).

CREATE TABLE IF NOT EXISTS organization_member_invitations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization_signups(id) ON DELETE CASCADE,
  invited_email     text NOT NULL,
  invited_by        uuid REFERENCES auth.users(id),
  status            text NOT NULL DEFAULT 'pending',
  invite_code       text,
  invited_at        timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz,
  accepted_at       timestamptz,
  accepted_user_id  uuid REFERENCES auth.users(id),
  revoked_at        timestamptz,

  CONSTRAINT org_member_invitations_status CHECK (
    status IN ('pending', 'sent', 'accepted', 'bounced', 'revoked')
  ),
  CONSTRAINT org_member_invitations_email_per_org UNIQUE (org_id, invited_email)
);

CREATE INDEX IF NOT EXISTS org_member_invitations_org_idx
  ON organization_member_invitations (org_id, status);

CREATE INDEX IF NOT EXISTS org_member_invitations_email_idx
  ON organization_member_invitations (lower(invited_email));

-- Enable RLS but provide a service-role-bypass policy. Captain reads via
-- /api/org/members which uses service role; direct anon access is blocked.
ALTER TABLE organization_member_invitations ENABLE ROW LEVEL SECURITY;
