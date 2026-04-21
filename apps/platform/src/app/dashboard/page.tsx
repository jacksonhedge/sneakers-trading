import Image from 'next/image'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { CopyLink } from './copy-link'
import { SignOutButton } from './sign-out-button'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

// Tier thresholds mirror docs/REFERRAL_PLAN.md
const TIERS = [
  { name: 'Early Access', at: 1 },
  { name: 'Priority Access', at: 3 },
  { name: 'Founder Tier', at: 10 },
]

export default async function DashboardPage() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    redirect('/signup')
  }

  // Use service_role to read queue position data that RLS wouldn't allow.
  const admin = getServerClient()

  const { data: row, error: rowErr } = await admin
    .from('waitlist')
    .select('email, referral_code, direct_referrals, indirect_referrals, created_at')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  if (rowErr || !row) {
    // Shouldn't happen if invite flow ran correctly, but guard anyway.
    redirect('/signup?error=no_waitlist_row')
  }

  const { count: earlierCount } = await admin
    .from('waitlist')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', row.created_at)

  const rawOrder = (earlierCount ?? 0) + 1
  const boost = 5 * row.direct_referrals + 2 * row.indirect_referrals
  const position = Math.max(1, rawOrder - boost)

  const referralUrl = `${SITE_URL}/r/${row.referral_code}`

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-10">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Sneakers"
              width={64}
              height={64}
              className="mix-blend-multiply"
            />
            <div>
              <div className="text-xs text-[#004225]/60 tracking-wider">
                SNEAKERS TERMINAL / DASHBOARD
              </div>
              <div className="text-sm text-stone-700">{row.email}</div>
            </div>
          </div>
          <SignOutButton />
        </header>

        {/* Position */}
        <section>
          <div className="text-xs text-[#004225] tracking-wider mb-2">
            {'>'} YOUR POSITION
          </div>
          <div className="text-6xl md:text-7xl font-bold text-[#00703c]">
            #{position.toLocaleString()}
          </div>
          <div className="text-sm text-stone-600 mt-2">
            {boost > 0 ? (
              <>Bumped up {boost} spots from referrals.</>
            ) : (
              <>Share your link to climb the queue.</>
            )}
          </div>
        </section>

        {/* Referral card */}
        <section className="border border-[#00703c]/40 bg-white/60 p-6 space-y-5">
          <div>
            <div className="text-xs text-[#004225] tracking-wider mb-2">
              {'>'} YOUR REFERRAL LINK
            </div>
            <CopyLink value={referralUrl} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-stone-600 mb-1 tracking-wider">
                DIRECT REFERRALS
              </div>
              <div className="text-3xl font-bold text-[#00703c]">
                {row.direct_referrals}
              </div>
              <div className="text-xs text-stone-500 mt-1">+5 spots each</div>
            </div>
            <div>
              <div className="text-xs text-stone-600 mb-1 tracking-wider">
                INDIRECT (2ND DEGREE)
              </div>
              <div className="text-3xl font-bold text-[#00703c]">
                {row.indirect_referrals}
              </div>
              <div className="text-xs text-stone-500 mt-1">+2 spots each</div>
            </div>
          </div>
        </section>

        {/* Tier progress */}
        <section>
          <div className="text-xs text-[#004225] tracking-wider mb-3">
            {'>'} TIER PROGRESS
          </div>
          <div className="space-y-2">
            {TIERS.map((t) => {
              const done = row.direct_referrals >= t.at
              return (
                <div
                  key={t.name}
                  className={`flex items-center justify-between border px-4 py-3 ${
                    done
                      ? 'border-[#00703c] bg-[#00703c]/10 text-[#004225]'
                      : 'border-stone-300 bg-white/40 text-stone-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={done ? 'text-[#00703c]' : 'text-stone-400'}>
                      {done ? '✓' : '○'}
                    </span>
                    <span className="text-sm font-semibold">{t.name}</span>
                  </div>
                  <div className="text-xs">
                    {Math.min(row.direct_referrals, t.at)} / {t.at} direct
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Coming soon */}
        <section>
          <div className="text-xs text-[#004225] tracking-wider mb-3">
            {'>'} COMING SOON
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {['Markets', 'Portfolio', 'Trades'].map((label) => (
              <div
                key={label}
                className="border border-stone-300 bg-white/40 px-4 py-6 text-center"
              >
                <div className="text-sm font-semibold text-stone-600">{label}</div>
                <div className="text-xs text-stone-400 mt-1">Beta access</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-xs text-stone-500 pt-8 border-t border-stone-300">
          Sneakers Terminal is not a registered investment advisor. Educational
          and research use only. Trading involves substantial risk of loss.
        </footer>
      </div>
    </main>
  )
}
