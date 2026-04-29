import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import type { MarketsListingParams } from './markets-listing-body'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Markets — Sneakers Terminal',
  description: 'Live prediction-market prices across every book Sneakers tracks.',
}

// /markets is now a thin redirector. We only ever want users to hit the
// in-app /dashboard/markets surface (which lives inside the dashboard
// layout — OToole panel on the left, topbar persists, no layout jump on
// category clicks). Unauth visitors who land here go to /login first
// with a return-to /dashboard/markets next= param.

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<MarketsListingParams>
}) {
  const sp = await searchParams
  const params = new URLSearchParams()
  if (sp.q) params.set('q', sp.q)
  if (sp.platform) params.set('platform', sp.platform)
  if (sp.sport) params.set('sport', sp.sport)
  if (sp.category) params.set('category', sp.category)
  if (sp.phase) params.set('phase', sp.phase)
  if (sp.sort) params.set('sort', sp.sort)
  if (sp.page) params.set('page', sp.page)
  const qs = params.toString()
  const target = `/dashboard/markets${qs ? '?' + qs : ''}`

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    redirect(`/login?next=${encodeURIComponent(target)}`)
  }
  redirect(target)
}
