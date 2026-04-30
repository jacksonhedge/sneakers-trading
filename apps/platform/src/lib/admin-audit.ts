import { headers } from 'next/headers'
import { getServerClient } from './supabase-server'

// Admin audit log writer.
//
// Every admin write action (grant access, issue / revoke invite, future
// trading + billing actions) calls logAdminAction() to drop a row into
// admin_audit_events (migration 032). Inserts are best-effort — a logging
// failure should NOT block the underlying action — but the failure is
// console.error'd so it shows up in Vercel logs.
//
// Pull actor/IP context from the incoming request headers when available.
// In practice the caller already has the actor email (from requireAdmin)
// so passes it explicitly; we only fall back to header sniffing for the
// less-trustworthy IP / user-agent fields.

export type AuditAction =
  | 'grant_access'
  | 'issue_invite'
  | 'reissue_invite'
  | 'revoke_invite'
  | 'cleanup_stress_emails'
  // Add future actions here. Adding a string is intentionally cheap — the
  // /admin/audit page lists distinct actions from the data, no enum sync.
  | (string & { __brand?: 'admin_action' })

export interface LogAdminActionInput {
  actor: string
  actorId?: string | null
  action: AuditAction
  targetEmail?: string | null
  targetKind?: 'user' | 'invite' | 'system' | 'market' | 'trade' | string
  targetId?: string | null
  metadata?: Record<string, unknown> | null
}

export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  try {
    const hdrs = await headers()
    const ip =
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      hdrs.get('x-real-ip') ??
      null
    const userAgent = hdrs.get('user-agent') ?? null

    const admin = getServerClient()
    const { error } = await admin.from('admin_audit_events').insert({
      actor_email: input.actor.toLowerCase(),
      actor_id: input.actorId ?? null,
      action: input.action,
      target_kind: input.targetKind ?? 'user',
      target_email: input.targetEmail ? input.targetEmail.toLowerCase() : null,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? null,
      ip,
      user_agent: userAgent,
    })
    if (error) {
      console.error('[audit] insert failed', error.message, {
        action: input.action,
        target: input.targetEmail,
      })
    }
  } catch (e) {
    // Never let audit logging crash the action it's auditing. Surface to
    // Vercel logs and move on.
    console.error('[audit] unexpected', e instanceof Error ? e.message : e)
  }
}
