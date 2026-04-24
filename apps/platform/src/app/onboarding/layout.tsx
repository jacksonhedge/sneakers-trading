import { redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getAuthClient } from '@/lib/supabase-auth'
import { ONBOARDING_STEPS, type OnboardingStepSlug } from './steps'

export const dynamic = 'force-dynamic'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await getAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/signup')
  }

  // Pull the current path segment from the request headers to compute progress.
  // Next's usePathname is client-only, so for the server layout we read the
  // pathname Next already stashed in x-invoke-path or x-forwarded-path. Fallback
  // to 'about-you' when we can't resolve.
  const h = await headers()
  const raw = h.get('x-invoke-path') ?? h.get('x-forwarded-path') ?? h.get('referer') ?? ''
  const match = raw.match(/\/onboarding\/([\w-]+)/)
  const currentSlug = (match?.[1] ?? 'about-you') as OnboardingStepSlug
  const currentIndex = Math.max(
    0,
    ONBOARDING_STEPS.findIndex((s) => s.slug === currentSlug),
  )
  const stepNumber = currentIndex + 1
  const totalSteps = ONBOARDING_STEPS.length
  const currentLabel =
    ONBOARDING_STEPS[currentIndex]?.label ?? ONBOARDING_STEPS[0].label
  const progressPct = Math.round((currentIndex / (totalSteps - 1)) * 100)
  const nextSlug = ONBOARDING_STEPS[currentIndex + 1]?.slug

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <header className="px-6 py-4 border-b border-emerald-400/20">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="text-xs tracking-wider text-emerald-300/80">
            SNEAKERS TERMINAL / SETUP
          </div>
          <div className="text-xs text-white/60 tabular-nums">
            STEP {stepNumber} OF {totalSteps} · {currentLabel.toUpperCase()}
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-3 h-1 bg-emerald-500/15 overflow-hidden">
          <div
            className="h-full bg-emerald-400 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-12">
        <div className="w-full max-w-xl">{children}</div>
      </main>

      {nextSlug && currentSlug !== 'done' && (
        <footer className="px-6 py-4 border-t border-emerald-400/20">
          <div className="max-w-2xl mx-auto flex justify-end">
            <Link
              href={`/onboarding/${nextSlug}`}
              className="text-xs text-white/60 hover:text-emerald-300 tracking-wider"
            >
              SKIP FOR NOW →
            </Link>
          </div>
        </footer>
      )}
    </div>
  )
}
