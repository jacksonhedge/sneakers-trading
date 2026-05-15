import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { SpectatorRace } from './spectator-race'

// Live tournament spectator surface. Read-only view of an in-progress
// (or upcoming) round — no buy/sell UI, no personal score bar. Three
// elements: BTC line with horse cursor (right), strike race lanes
// (top-left), tournament leaderboard (bottom-left). Plus a header
// with WATCHING count, SHARE button, and JOIN CTA when registration
// is still open.
//
// This is the foundation for the rail / bet-behind flow (Phase 2) —
// the spectator surface is a v1 of "watch a tournament" that we'll
// extend with follower mechanics later.

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  return { title: `Race ${id} — Sneakers Tournaments` }
}

export default async function SpectatorRacePage({ params }: PageProps) {
  const supabase = await getAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) redirect('/signup')

  const { id } = await params
  return <SpectatorRace tournamentId={id} />
}
