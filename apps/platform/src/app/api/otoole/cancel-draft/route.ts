import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/otoole/cancel-draft
//
// Body: { draftId: string }
//
// Marks a pending trade_drafts row as 'cancelled'. No-op for drafts
// that are already confirmed/cancelled/expired.

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { draftId?: unknown }
  const draftId = typeof body.draftId === 'string' ? body.draftId : null
  if (!draftId) {
    return NextResponse.json({ ok: false, error: 'draftId required' }, { status: 400 })
  }

  const admin = getServerClient()
  const { data: waitlistRow } = await admin
    .from('waitlist')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()
  if (!waitlistRow?.id) {
    return NextResponse.json({ ok: false, error: 'no waitlist row' }, { status: 403 })
  }

  // Single update; let the row-not-found / ownership case be handled by
  // matching both id AND user_id, and only flipping if status='pending'.
  const { data, error } = await admin
    .from('trade_drafts')
    .update({
      status: 'cancelled',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', draftId)
    .eq('user_id', waitlistRow.id as string)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: 'draft not pending or not yours' },
      { status: 404 },
    )
  }
  return NextResponse.json({ ok: true })
}
