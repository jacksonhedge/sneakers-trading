'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { getServerClient } from '@/lib/supabase-server'
import { logAdminAction } from '@/lib/admin-audit'

/**
 * Delete waitlist rows whose email matches the stress-test tag pattern.
 * Intended for cleaning up after scripts/stress/* runs that hit prod.
 * Pattern: stress+%@sneakersterminal.com OR stress-%@sneakersterminal.com
 */
export async function cleanupStressEmailsAction(): Promise<{ ok: boolean; message: string; deleted: number }> {
  const { email: actorEmail } = await requireAdmin()

  const admin = getServerClient()
  const { data, error } = await admin
    .from('waitlist')
    .delete()
    .or('email.like.stress+%,email.like.stress-%')
    .select('email')

  if (error) {
    return { ok: false, message: `delete failed: ${error.message}`, deleted: 0 }
  }

  const deleted = (data ?? []).length
  const deletedEmails = (data ?? [])
    .map((r) => r.email as string | null)
    .filter((e): e is string => typeof e === 'string')

  await logAdminAction({
    actor: actorEmail,
    action: 'cleanup_stress_emails',
    targetKind: 'system',
    metadata: {
      deleted_count: deleted,
      deleted_emails: deletedEmails.slice(0, 200),
    },
  })

  revalidatePath('/admin')
  revalidatePath('/admin/users')
  revalidatePath('/admin/invites')
  revalidatePath('/admin/system')
  return {
    ok: true,
    message: `deleted ${deleted} stress-test row${deleted === 1 ? '' : 's'}`,
    deleted,
  }
}
