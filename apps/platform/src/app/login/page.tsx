import Image from 'next/image'
import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-auth'
import { WAITLIST_DISPLAY_OFFSET } from '@/lib/waitlist'
import { autoInviteProgress, maybeAutoInvite } from '@/lib/auto-invite'
import { MagicLinkButton } from './magic-link-button'
import { LoginForm } from './email-form'
import { CopyLinkDark } from './copy-link-dark'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

type Row = {
  email: string
  created_at: string
  referral_code: string | null
  direct_referrals: number
  indirect_referrals: number
  invite_code: string | null
  invite_used_at: string | null
}

type State =
  | { kind: 'admin'; email: string }
  | { kind: 'authed'; row: Row; position: number; boost: number }
  | { kind: 'invited'; row: Row; position: number; boost: number; code: string }
  | { kind: 'waitlist'; row: Row; position: number; boost: number }
  | { kind: 'not_found'; email: string }
  | { kind: 'no_email' }

async function resolve(email: string | undefined): Promise<State> {
  if (!email || !email.includes('@')) return { kind: 'no_email' }
  const normalized = email.toLowerCase().trim()

  if (isAdminEmail(normalized)) {
    return { kind: 'admin', email: normalized }
  }

  // Clubhouse graduation: if this user just qualified (refs >= 2 or refs >= 1
  // with row >= 24h old), issue their invite before we read the row. So the
  // render shows the "invited" state on this page load, not one behind.
  await maybeAutoInvite(normalized).catch((err) => {
    console.error('[login] maybeAutoInvite failed', err)
  })

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select(
      'email, created_at, referral_code, direct_referrals, indirect_referrals, invite_code, invite_used_at',
    )
    .eq('email', normalized)
    .maybeSingle()

  if (!row) return { kind: 'not_found', email: normalized }

  const { count: earlierCount } = await admin
    .from('waitlist')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', row.created_at)

  const rawOrder = (earlierCount ?? 0) + 1 + WAITLIST_DISPLAY_OFFSET
  const boost = 5 * row.direct_referrals + 2 * row.indirect_referrals
  const position = Math.max(1, rawOrder - boost)

  if (row.invite_used_at) return { kind: 'authed', row: row as Row, position, boost }
  if (row.invite_code)
    return { kind: 'invited', row: row as Row, position, boost, code: row.invite_code }
  return { kind: 'waitlist', row: row as Row, position, boost }
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-emerald-400/60 bg-black/50 backdrop-blur-sm p-5 space-y-4">
      {children}
    </div>
  )
}

function PositionBlock({ position, boost }: { position: number; boost: number }) {
  return (
    <div>
      <div className="text-xs text-emerald-300 tracking-wider mb-1">{'>'} YOUR POSITION</div>
      <div className="text-5xl font-bold text-emerald-400">#{position.toLocaleString()}</div>
      <div className="text-xs text-white/70 mt-1">
        {boost > 0 ? (
          <>Bumped up {boost} spots from referrals.</>
        ) : (
          <>Share your referral link to climb the queue.</>
        )}
      </div>
    </div>
  )
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const sp = await searchParams
  const state = await resolve(sp.email)

  return (
    <main className="relative min-h-screen flex items-center justify-center p-8 overflow-hidden isolate">
      <Image
        src="/hero-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover -z-20"
      />
      <div className="absolute inset-0 bg-black/75 -z-10" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/60 -z-10" />

      <div className="max-w-md w-full space-y-6 text-white">
        <div className="text-center">
          <div className="text-xs text-emerald-300/80 mb-4 tracking-wider">
            SNEAKERS TERMINAL / LOGIN
          </div>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-stone-950 p-3 ring-1 ring-emerald-400/30 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
              <Image src="/logo.png" alt="Sneakers" width={96} height={96} />
            </div>
          </div>
        </div>

        {state.kind === 'no_email' && (
          <Card>
            <div className="text-sm text-emerald-300">{'>'} Sign in</div>
            <div className="text-xs text-white/70">
              Enter the email you signed up with. We&apos;ll email you a magic link — no password
              to remember.
            </div>
            <LoginForm />
            <div className="text-xs text-white/50 pt-2 border-t border-white/10">
              Not on the waitlist yet?{' '}
              <Link href="/" className="text-emerald-400 hover:underline">
                Join here →
              </Link>
            </div>
          </Card>
        )}

        {state.kind === 'admin' && (
          <Card>
            <div className="text-sm text-emerald-300">{'>'} Admin recognized.</div>
            <div className="text-xs text-white/70">
              Click below and we&apos;ll send a magic link straight to your inbox. You&apos;ll land
              on <span className="text-emerald-400 font-semibold">/admin</span>.
            </div>
            <MagicLinkButton email={state.email} label="SEND MAGIC LINK" />
            <div className="text-xs text-white/50 font-mono break-all">{state.email}</div>
          </Card>
        )}

        {state.kind === 'authed' && (
          <Card>
            <div className="text-sm text-emerald-300">{'>'} Welcome back.</div>
            <PositionBlock position={state.position} boost={state.boost} />
            <div className="text-xs text-white/70 pt-2 border-t border-white/10">
              You&apos;ve already used your invite code. Send yourself a magic link to get back
              into the dashboard.
            </div>
            <MagicLinkButton email={state.row.email} label="SEND MAGIC LINK" />
            <div className="text-xs text-white/50 font-mono break-all">{state.row.email}</div>
          </Card>
        )}

        {state.kind === 'invited' && (
          <Card>
            <div className="text-sm text-emerald-300">{'>'} You&apos;re off the waitlist.</div>
            <PositionBlock position={state.position} boost={state.boost} />
            <div className="text-xs text-white/70 pt-2 border-t border-white/10">
              We emailed your access code. Click below (or use the link in the email) to sign in.
            </div>
            <Link
              href={`/signup?code=${state.code}`}
              className="block w-full text-center border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 transition"
            >
              CONTINUE TO SIGN IN →
            </Link>
            <div className="text-xs text-white/50 font-mono break-all">{state.row.email}</div>
          </Card>
        )}

        {state.kind === 'waitlist' && (() => {
          const prog = autoInviteProgress(state.row)
          const refs = state.row.direct_referrals
          return (
            <Card>
              <div className="text-sm text-emerald-300">{'>'} You&apos;re on the waitlist.</div>
              <PositionBlock position={state.position} boost={state.boost} />

              {/* Clubhouse graduation — earn your way in */}
              <div className="border border-emerald-400/40 bg-emerald-400/5 p-3 space-y-3">
                <div className="text-xs text-emerald-300 tracking-wider font-semibold">
                  {'>'} UNLOCK ACCESS
                </div>
                <div className="space-y-2 text-xs">
                  {/* Tier 1: 1 referral → next-day */}
                  <div className="flex items-start gap-2">
                    <span className={refs >= 1 ? 'text-emerald-400' : 'text-white/40'}>
                      {refs >= 1 ? '✓' : '○'}
                    </span>
                    <div className="flex-1">
                      <div className={refs >= 1 ? 'text-white' : 'text-white/70'}>
                        <span className="font-semibold">Refer 1 person</span> — we email you an
                        invite in 24 hours
                      </div>
                      {refs >= 1 && prog.hoursUntilNextDay !== null && (
                        <div className="text-emerald-400/80 text-[11px] mt-0.5">
                          Invite unlocks in ~{prog.hoursUntilNextDay}h
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Tier 2: 2 referrals → instant */}
                  <div className="flex items-start gap-2">
                    <span className={refs >= 2 ? 'text-emerald-400' : 'text-white/40'}>
                      {refs >= 2 ? '✓' : '○'}
                    </span>
                    <div className="flex-1">
                      <div className={refs >= 2 ? 'text-white' : 'text-white/70'}>
                        <span className="font-semibold">Refer 2 people</span> — we email your
                        invite immediately
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-white/60 pt-1 border-t border-emerald-400/20">
                  You have{' '}
                  <span className="text-emerald-400 font-semibold">{refs}</span>{' '}
                  {refs === 1 ? 'referral' : 'referrals'} so far.
                  {prog.refsNeededForInstant > 0 && (
                    <>
                      {' '}
                      {prog.refsNeededForInstant} more for instant access.
                    </>
                  )}
                </div>
              </div>

              {state.row.referral_code && (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="text-xs text-white/70">Your referral link:</div>
                  <CopyLinkDark value={`${SITE_URL}/r/${state.row.referral_code}`} />
                </div>
              )}

              <div className="text-xs text-white/50 font-mono break-all pt-2 border-t border-white/10">
                {state.row.email}
              </div>
            </Card>
          )
        })()}

        {state.kind === 'not_found' && (
          <Card>
            <div className="text-sm text-red-300">{'>'} That email isn&apos;t on the waitlist.</div>
            <div className="text-xs text-white/70">
              Either you haven&apos;t signed up yet, or you used a different address.
            </div>
            <div className="text-xs text-white/50 font-mono break-all">{state.email}</div>
            <Link
              href="/"
              className="block w-full text-center border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 transition"
            >
              JOIN THE WAITLIST →
            </Link>
            <div className="text-xs text-white/60 pt-2 border-t border-white/10">
              Try a different email:
            </div>
            <LoginForm />
          </Card>
        )}

        <div className="text-center text-xs text-white/50">
          <Link href="/" className="hover:text-emerald-400 transition">
            ← back to landing
          </Link>
        </div>
      </div>
    </main>
  )
}
