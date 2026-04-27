import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { LocationForm } from './location-form'

export const dynamic = 'force-dynamic'

export default async function LocationCheckPage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/signup?next=/onboarding/location-check')

  const h = await headers()
  // Vercel + Cloudflare both set IP-derived geo headers. Vercel uses
  // x-vercel-ip-country-region for the state code; Cloudflare uses
  // cf-ipcountry for the country (no state). Read both so it works
  // wherever the request comes through.
  const ipState = h.get('x-vercel-ip-country-region')
  const ipCountry = h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry')

  // The state the user CLAIMED on /about-you. Used to highlight mismatches.
  const admin = getServerClient()
  const { data: profile } = await admin
    .from('user_profiles')
    .select('state')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">
          Quick location check
        </h1>
        <p className="text-sm text-white/60 mt-2">
          Many markets are state-restricted. We don&apos;t block you — we tailor
          what we show.
        </p>
      </div>
      <LocationForm
        ipCountry={ipCountry}
        ipState={ipState}
        claimState={(profile?.state as string | null) ?? null}
      />
    </div>
  )
}
