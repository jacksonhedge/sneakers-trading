'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { getServerClient } from '@/lib/supabase-server'
import { sendBroadcastEmail } from '@/lib/email'
import { logAdminAction } from '@/lib/admin-audit'

const RECIPIENT_GROUPS = ['all', 'invited', 'authed', 'waitlist', 'custom'] as const
type RecipientGroup = (typeof RECIPIENT_GROUPS)[number]
const HARD_CAP = 500
const SEND_GAP_MS = 200

type Result =
  | { ok: true; mode: 'preview' | 'send'; recipientCount: number; message: string; sample: string[] }
  | { ok: false; mode: 'preview' | 'send'; message: string }

function parseCustomEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.toLowerCase().trim())
    .filter((e) => e.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
}

async function resolveRecipients(group: RecipientGroup, custom: string[]): Promise<string[]> {
  if (group === 'custom') return custom
  const admin = getServerClient()
  let q = admin.from('waitlist').select('email').order('created_at', { ascending: false }).limit(HARD_CAP)
  // Mirror the same status semantics as /users: waitlist must NOT include
  // open-signup rows (which have invite_code=null but invite_used_at set).
  if (group === 'invited') q = q.not('invite_code', 'is', null).is('invite_used_at', null)
  else if (group === 'authed') q = q.not('invite_used_at', 'is', null)
  else if (group === 'waitlist') q = q.is('invite_code', null).is('invite_used_at', null)
  // 'all' uses no extra filter
  const { data, error } = await q
  if (error) throw new Error(`recipient lookup failed: ${error.message}`)
  return (data ?? [])
    .map((r) => (r.email as string | null)?.toLowerCase())
    .filter((e): e is string => typeof e === 'string')
}

/**
 * Two-phase action. mode=preview returns the recipient list (capped) so
 * the operator can see who they're about to email before committing.
 * mode=send actually fires the emails sequentially with a small gap so
 * we don't trip Resend's per-second rate limit.
 */
export async function broadcastAction(formData: FormData): Promise<Result> {
  const { email: actorEmail } = await requireAdmin()

  const mode = formData.get('mode') === 'send' ? 'send' : 'preview'
  const subject = (formData.get('subject') ?? '').toString().trim()
  const body = (formData.get('body') ?? '').toString()
  const groupRaw = (formData.get('group') ?? 'all').toString()
  const group: RecipientGroup = (RECIPIENT_GROUPS as readonly string[]).includes(groupRaw)
    ? (groupRaw as RecipientGroup)
    : 'all'
  const customRaw = (formData.get('custom') ?? '').toString()

  if (subject.length < 3) {
    return { ok: false, mode, message: 'subject must be at least 3 characters' }
  }
  if (subject.length > 200) {
    return { ok: false, mode, message: 'subject too long (max 200)' }
  }
  if (body.trim().length < 10) {
    return { ok: false, mode, message: 'body must be at least 10 characters' }
  }

  let recipients: string[] = []
  try {
    const custom = parseCustomEmails(customRaw)
    recipients = await resolveRecipients(group, custom)
  } catch (e) {
    return { ok: false, mode, message: e instanceof Error ? e.message : String(e) }
  }

  if (recipients.length === 0) {
    return { ok: false, mode, message: 'no recipients matched — nothing to send' }
  }
  if (recipients.length > HARD_CAP) {
    return {
      ok: false,
      mode,
      message: `recipient set is ${recipients.length}; hard cap is ${HARD_CAP}. Narrow the group or use the custom list.`,
    }
  }

  if (mode === 'preview') {
    return {
      ok: true,
      mode: 'preview',
      recipientCount: recipients.length,
      message: `${recipients.length} recipient${recipients.length === 1 ? '' : 's'} would be sent.`,
      sample: recipients.slice(0, 10),
    }
  }

  // Sequential send with a small gap. On per-recipient failure: log + continue.
  let sent = 0
  const failures: Array<{ to: string; error: string }> = []
  for (const to of recipients) {
    try {
      await sendBroadcastEmail({ to, subject, bodyText: body })
      sent += 1
    } catch (e) {
      failures.push({ to, error: e instanceof Error ? e.message : String(e) })
    }
    if (SEND_GAP_MS > 0) await new Promise((r) => setTimeout(r, SEND_GAP_MS))
  }

  await logAdminAction({
    actor: actorEmail,
    action: 'broadcast_email',
    targetKind: 'system',
    metadata: {
      group,
      subject,
      body_preview: body.slice(0, 200),
      recipient_count: recipients.length,
      sent,
      failed: failures.length,
      // Only the first 50 recipients in metadata so we don't blow up the
      // jsonb payload size on big batches.
      sample_recipients: recipients.slice(0, 50),
      failures: failures.slice(0, 20),
    },
  })

  revalidatePath('/admin/audit')
  revalidatePath('/admin/announcements')

  return {
    ok: true,
    mode: 'send',
    recipientCount: recipients.length,
    message: `sent ${sent}/${recipients.length}${failures.length > 0 ? ` · ${failures.length} failed` : ''}`,
    sample: recipients.slice(0, 10),
  }
}
