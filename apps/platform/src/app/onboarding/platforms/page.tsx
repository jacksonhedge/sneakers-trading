import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { VENUES } from '@/lib/venues'
import { PlatformsForm, type VenueOption } from './platforms-form'

export const dynamic = 'force-dynamic'

export default async function PlatformsPage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/signup?next=/onboarding/platforms')

  const admin = getServerClient()
  const { data: profile } = await admin
    .from('user_profiles')
    .select('platforms_connected')
    .eq('user_id', user.id)
    .maybeSingle()

  const venues: VenueOption[] = VENUES.map((v) => ({
    id: v.id,
    name: v.name,
    status: v.status as VenueOption['status'],
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">
          Where do you already trade?
        </h1>
        <p className="text-sm text-white/60 mt-2">
          Check every platform you have an account on. We use this to tailor what
          we show you — and offer affiliate deals for the ones you don&apos;t.
        </p>
      </div>
      <PlatformsForm
        venues={venues}
        initialSelected={(profile?.platforms_connected as string[] | null) ?? []}
      />
    </div>
  )
}
