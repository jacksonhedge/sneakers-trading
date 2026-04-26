import type { SupabaseClient } from '@supabase/supabase-js'

// Returns the org row if the user is the captain of the given org id, else
// null. Captaincy is defined by org_leader_user_id = user.id (preferred)
// with a fallback to email match for rows not yet backfilled by the
// post-signin step (transitional — drop the email leg once backfill is
// confirmed in prod).
//
// `admin` should be a service-role Supabase client. This function does
// the authz scoping in code.
export async function isCaptainOf(
  admin: SupabaseClient,
  orgId: string,
  user: { id: string; email: string },
): Promise<boolean> {
  const { data: byId } = await admin
    .from('organization_signups')
    .select('id')
    .eq('id', orgId)
    .eq('org_leader_user_id', user.id)
    .maybeSingle()
  if (byId) return true

  const { data: byEmail } = await admin
    .from('organization_signups')
    .select('id')
    .eq('id', orgId)
    .is('org_leader_user_id', null)
    .eq('org_leader_email', user.email.toLowerCase())
    .maybeSingle()
  return Boolean(byEmail)
}
