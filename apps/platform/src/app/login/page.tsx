import Image from 'next/image'
import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-auth'
import { WAITLIST_DISPLAY_OFFSET } from '@/lib/waitlist'
import { maybeAutoInvite } from '@/lib/auto-invite'
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
  | { kind: 'invited'; row: Row; position: number; boost: number }
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
  if (row.invite_code) return { kind: 'invited', row: row as Row, position, boost }
  return { kind: 'waitlist', row: row as Row, position, boost }
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-stone-200 shadow-[0_12px_32px_rgba(0,0,0,0.08)] p-6 space-y-4">
      {children}
    </div>
  )
}

function PositionBlock({ position, boost }: { position: number; boost: number }) {
  return (
    <div>
      <div className="text-xs text-emerald-700 tracking-wider mb-1">{'>'} YOUR POSITION</div>
      <div className="text-5xl font-bold text-emerald-600">#{position.toLocaleString()}</div>
      <div className="text-xs text-stone-600 mt-1">
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
    <main className="relative min-h-screen flex items-center justify-center p-8 overflow-hidden isolate bg-stone-50">
      {/* Soft cream wash + subtle emerald glow — way lighter than the
          previous dark hero-bg + black overlay setup. */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-br from-stone-50 via-white to-stone-100"
        aria-hidden
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 w-[720px] h-[720px] rounded-full bg-emerald-300/20 blur-[120px] pointer-events-none"
        aria-hidden
      />

      <div className="max-w-md w-full space-y-6 text-stone-900">
        <div className="text-center">
          <div className="text-xs text-emerald-700 mb-4 tracking-wider font-semibold">
            SNEAKERS TERMINAL / LOGIN
          </div>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-stone-950 p-3 ring-1 ring-emerald-500/30 shadow-[0_8px_32px_rgba(16,185,129,0.18)]">
              <Image src="/logo.png" alt="Sneakers" width={96} height={96} />
            </div>
          </div>
        </div>

        {state.kind === 'no_email' && (
          <Card>
            <div className="text-sm text-emerald-700 font-semibold">{'>'}Sign in</div>
            <div className="text-xs text-stone-700">
              Sign in with your email and password. Forgot your password? Use the link below
              the form to get a one-click magic link instead.
            </div>
            <LoginForm />
            <div className="text-xs text-stone-500 pt-2 border-t border-stone-200">
              Not on the waitlist yet?{' '}
              <Link href="/" className="text-emerald-700 font-semibold hover:underline">
                Join here →
              </Link>
            </div>
          </Card>
        )}

        {state.kind === 'admin' && (
          <Card>
            <div className="text-sm text-emerald-700 font-semibold">{'>'}Admin recognized.</div>
            <div className="text-xs text-stone-700">
              Click below and we&apos;ll send a magic link straight to your inbox. You&apos;ll land
              on <span className="text-emerald-700 font-semibold">/admin</span>.
            </div>
            <MagicLinkButton email={state.email} label="SEND MAGIC LINK" />
            <div className="text-xs text-stone-500 font-mono break-all">{state.email}</div>
          </Card>
        )}

        {state.kind === 'authed' && (
          <Card>
            <div className="text-sm text-emerald-700 font-semibold">{'>'}Welcome back.</div>
            <PositionBlock position={state.position} boost={state.boost} />
            <div className="text-xs text-stone-700 pt-2 border-t border-stone-200">
              You&apos;ve already used your invite code. Send yourself a magic link to get back
              into the dashboard.
            </div>
            <MagicLinkButton email={state.row.email} label="SEND MAGIC LINK" />
            <div className="text-xs text-stone-500 font-mono break-all">{state.row.email}</div>
          </Card>
        )}

        {state.kind === 'invited' && (
          <Card>
            <div className="text-sm text-emerald-700 font-semibold">{'>'}You&apos;re off the waitlist.</div>
            <PositionBlock position={state.position} boost={state.boost} />
            <div className="text-xs text-stone-700 pt-2 border-t border-stone-200">
              We&apos;ll email you a fresh magic link — click it from your inbox to sign in.
            </div>
            <MagicLinkButton email={state.row.email} label="SEND MAGIC LINK" />
            <div className="text-xs text-stone-500 font-mono break-all">{state.row.email}</div>
          </Card>
        )}

        {state.kind === 'waitlist' && (() => {
          const refs = state.row.direct_referrals
          return (
            <Card>
              <div className="text-sm text-emerald-700 font-semibold">{'>'}You&apos;re on the waitlist.</div>
              <PositionBlock position={state.position} boost={state.boost} />

              {/* Single-referral gate — bring somebody along */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 p-4 space-y-3">
                <div className="text-xs text-emerald-700 tracking-wider font-semibold">
                  {'>'} UNLOCK ACCESS
                </div>
                <div className="flex items-start gap-3">
                  <span
                    className={`text-lg leading-none ${refs >= 1 ? 'text-emerald-400' : 'text-stone-400'}`}
                  >
                    {refs >= 1 ? '✓' : '○'}
                  </span>
                  <div className="flex-1">
                    <div
                      className={`text-sm font-semibold ${refs >= 1 ? 'text-white' : 'text-stone-900'}`}
                    >
                      Refer 1 person to get in.
                    </div>
                    <div className="text-xs text-stone-600 mt-1 leading-relaxed">
                      You bring somebody, they sign up through your link, you&apos;re in —
                      immediately. No wait, no 24-hour delay.
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-stone-600 pt-2 border-t border-emerald-500/20">
                  You have{' '}
                  <span className="text-emerald-700 font-bold text-sm">{refs}</span>{' '}
                  {refs === 1 ? 'referral' : 'referrals'} so far.
                  {refs < 1 && <> Share your link below to unlock.</>}
                  {refs >= 1 && <> Refresh this page — your invite should be here.</>}
                </div>
              </div>

              {state.row.referral_code && (
                <div className="space-y-2 pt-2 border-t border-stone-200">
                  <div className="text-xs text-stone-700">Your referral link:</div>
                  <CopyLinkDark value={`${SITE_URL}/r/${state.row.referral_code}`} />
                </div>
              )}

              <div className="text-xs text-stone-500 font-mono break-all pt-2 border-t border-stone-200">
                {state.row.email}
              </div>
            </Card>
          )
        })()}

        {state.kind === 'not_found' && (
          <Card>
            <div className="text-sm text-red-700 font-semibold">{'>'} That email isn&apos;t on the waitlist.</div>
            <div className="text-xs text-stone-700">
              Either you haven&apos;t signed up yet, or you used a different address.
            </div>
            <div className="text-xs text-stone-500 font-mono break-all">{state.email}</div>
            <Link
              href="/"
              className="block w-full text-center rounded-full bg-emerald-500 text-black font-semibold px-6 py-3 ring-1 ring-emerald-400 hover:bg-emerald-400 transition"
            >
              JOIN THE WAITLIST →
            </Link>
            <div className="text-xs text-stone-600 pt-2 border-t border-stone-200">
              Try a different email:
            </div>
            <LoginForm />
          </Card>
        )}

        <div className="text-center text-xs text-stone-500">
          <Link href="/" className="hover:text-emerald-400 transition">
            ← back to landing
          </Link>
        </div>
      </div>
    </main>
  )
}
