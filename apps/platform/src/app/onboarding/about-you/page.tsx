import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { AboutYouForm } from './about-you-form'

export const dynamic = 'force-dynamic'

export default async function AboutYouPage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/signup?next=/onboarding/about-you')

  const admin = getServerClient()
  const { data: profile } = await admin
    .from('user_profiles')
    .select('state, use_case')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">Tell us about you</h1>
        <p className="text-sm text-white/60 mt-2">
          Two quick questions so we can tailor the terminal.
        </p>
      </div>
      <AboutYouForm
        initialState={(profile?.state as string | null) ?? null}
        initialUseCase={(profile?.use_case as string | null) ?? null}
      />
    </div>
  )
}
