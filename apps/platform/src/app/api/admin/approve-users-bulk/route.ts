import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-auth'
import { sendApprovedEmail } from '@/lib/email'

// POST /api/admin/approve-users-bulk
//
// Body: { emails: string[] }
//
// For each email: look up the waitlist row, set invite_used_at if not
// already set, fire sendApprovedEmail. Returns per-email status so the
// admin UI can surface failures inline. Same auth gate as the singular
// /api/admin/approve-user route.

export const dynamic = 'force-dynamic'

type Result = {
  email: string
  status: 'ok' | 'not_found' | 'already_approved' | 'failed'
  error?: string
}

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { emails?: unknown }
  const emails = Array.isArray(body.emails)
    ? Array.from(
        new Set(
          body.emails
            .filter((e): e is string => typeof e === 'string')
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e.includes('@')),
        ),
      )
    : []
  if (emails.length === 0) {
    return NextResponse.json({ ok: false, error: 'no_emails' }, { status: 400 })
  }
  if (emails.length > 200) {
    // Cap to keep the request from running >Vercel function limit. Admin
    // can split into batches if they need more.
    return NextResponse.json(
      { ok: false, error: 'too_many_emails (max 200)' },
      { status: 400 },
    )
  }

  const admin = getServerClient()
  const nowIso = new Date().toISOString()

  // Process sequentially, but fire emails in parallel after DB updates.
  // Sequential DB updates avoid races on row locks for any concurrent
  // approve activity. Resend can comfortably handle 200 sequential sends.
  const results: Result[] = []
  for (const email of emails) {
    const { data: row, error: lookupErr } = await admin
      .from('waitlist')
      .select('id, email, invite_used_at')
      .eq('email', email)
      .maybeSingle()

    if (lookupErr) {
      results.push({ email, status: 'failed', error: lookupErr.message })
      continue
    }
    if (!row) {
      results.push({ email, status: 'not_found' })
      continue
    }
    if (row.invite_used_at) {
      results.push({ email, status: 'already_approved' })
      continue
    }

    const { error: updateErr } = await admin
      .from('waitlist')
      .update({ invite_used_at: nowIso })
      .eq('id', row.id)
    if (updateErr) {
      results.push({ email, status: 'failed', error: updateErr.message })
      continue
    }

    try {
      await sendApprovedEmail({ to: email })
      results.push({ email, status: 'ok' })
    } catch (e) {
      // Approval succeeded but email didn't. Surface as failed so the
      // admin sees there's something to follow up on, but the row IS
      // approved in the DB.
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ email, status: 'failed', error: `approved-but-email-failed: ${msg}` })
    }
  }

  revalidatePath('/admin/users')
  revalidatePath('/users')
  return NextResponse.json({ ok: true, results })
}
