import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// GET /api/otoole/pending-drafts
//
// Returns the user's pending trade_drafts rows (newest first), enriched
// with the live market question + best_ask so the OToole panel can render
// confirm cards without re-fetching markets data on the client.
//
// Drops drafts whose ttl has expired (they age out without an explicit
// 'expired' flip — we just hide them and the cleanup job can mark them
// later if needed).

export const dynamic = 'force-dynamic'

interface DraftRow {
  id: string
  platform: string
  platform_market_id: string
  outcome_name: string
  side: 'buy' | 'sell'
  size_usd: number
  max_price: number
  rationale: string | null
  ttl_minutes: number
  metadata: { market_question?: string; market_yes_ask?: number | null } | null
  created_at: string
}

export async function GET() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }

  const admin = getServerClient()
  const { data: waitlistRow } = await admin
    .from('waitlist')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()
  if (!waitlistRow?.id) {
    return NextResponse.json({ ok: true, drafts: [] })
  }

  const { data, error } = await admin
    .from('trade_drafts')
    .select(
      'id, platform, platform_market_id, outcome_name, side, size_usd, max_price, rationale, ttl_minutes, metadata, created_at',
    )
    .eq('user_id', waitlistRow.id as string)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, drafts: [] },
      { status: 500 },
    )
  }

  const now = Date.now()
  const drafts = ((data ?? []) as DraftRow[]).filter((d) => {
    const expiresAt = new Date(d.created_at).getTime() + d.ttl_minutes * 60_000
    return expiresAt > now
  })

  return NextResponse.json({ ok: true, drafts })
}
