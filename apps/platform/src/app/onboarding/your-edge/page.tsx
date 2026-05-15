import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { loadMemory } from '@/lib/otoole-memory'
import { parseEdgeBlock } from '@/lib/onboarding-edge'
import { YourEdgeForm } from './your-edge-form'

export const dynamic = 'force-dynamic'

export default async function YourEdgePage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/signup?next=/onboarding/your-edge')

  // Pre-fill from O'Toole memory if the student has already tuned once.
  const memory = await loadMemory(user.id).catch(() => '')
  const existing = parseEdgeBlock(memory)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">Tune your trading AI</h1>
        <p className="text-sm text-white/60 mt-2">
          Two picks. O&apos;Toole — your AI — uses them on every trade it proposes.
          This is how you out-trade the desks. You can retune anytime.
        </p>
      </div>
      <YourEdgeForm
        initialRisk={existing?.risk ?? null}
        initialStyle={existing?.style ?? null}
      />
    </div>
  )
}
