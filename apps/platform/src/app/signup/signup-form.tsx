'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Dual-path form on /signup:
//   - if ACCESS CODE is filled → direct sign-in via /api/auth/request-link
//     (returns a magic-link URL we navigate to immediately, no email round-trip)
//   - if ACCESS CODE is empty → fall back to /api/waitlist for a no-code
//     waitlist signup. Shows the post-waitlist success card with referral
//     link + invite scarcity pitch.
//
// Mirrors the original LandingForm logic which used to live on the homepage
// before the form moved to /signup. Without the fallback, anyone without an
// invite code had no way to join via the new flow.

interface WaitlistSuccess {
  position: number
  referralCode: string
  inviteSlotsTotal: number
  directReferrals: number
}

function isEduEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed.includes('@')) return false
  return /@([a-z0-9-]+\.)*edu(\.[a-z]{2,3})?$/.test(trimmed)
}

export function SignupForm({ initialCode }: { initialCode?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(initialCode ?? '')
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'waitlist_done' | 'error'
  >('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [waitlist, setWaitlist] = useState<WaitlistSuccess | null>(null)

  const hasCode = code.trim().length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg(null)

    if (hasCode) {
      const res = await fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim().toUpperCase(),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        redirect?: string
      }
      if (res.ok && json.ok && json.redirect) {
        // Direct sign-in: navigate to the single-use Supabase verify URL.
        window.location.href = json.redirect
        return
      }
      setStatus('error')
      if (json.error === 'invite_invalid')
        setErrorMsg('That code is invalid, already used, or not for this email.')
      else if (json.error === 'invalid_email') setErrorMsg('Check the email address.')
      else if (json.error === 'invalid_code') setErrorMsg('Code must be 8 characters.')
      else setErrorMsg('Something went wrong. Try again in a moment.')
      return
    }

    // No code: waitlist fallback.
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        source: 'signup_page',
        accountType: 'individual',
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      admin?: boolean
      existing?: boolean
      position?: number
      referralCode?: string
      inviteSlotsTotal?: number
      directReferrals?: number
    }
    if (!res.ok) {
      setStatus('error')
      setErrorMsg('Something went wrong. Try again in a moment.')
      return
    }
    if (data.existing) {
      router.push(`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`)
      return
    }
    if (
      typeof data.position === 'number' &&
      typeof data.referralCode === 'string' &&
      typeof data.inviteSlotsTotal === 'number' &&
      typeof data.directReferrals === 'number'
    ) {
      setWaitlist({
        position: data.position,
        referralCode: data.referralCode,
        inviteSlotsTotal: data.inviteSlotsTotal,
        directReferrals: data.directReferrals,
      })
    }
    setStatus('waitlist_done')
  }

  if (status === 'waitlist_done') {
    return <WaitlistSuccessCard payload={waitlist} />
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-[11px] tracking-wider text-emerald-300/80 mb-1">
          EMAIL <span className="text-white/40 normal-case">(.edu preferred)</span>
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.edu"
          autoComplete="email"
          className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 rounded focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition"
        />
        {isEduEmail(email) && (
          <div className="text-[10px] text-emerald-300/90 mt-1.5 tracking-wider">
            ✓ .edu detected — 75% off + leaderboard access unlocked after verification
          </div>
        )}
      </div>

      <div>
        <label className="block text-[11px] tracking-wider text-emerald-300/80 mb-1">
          ACCESS CODE <span className="text-white/40 normal-case">(optional)</span>
        </label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXXXXXXX"
          maxLength={8}
          spellCheck={false}
          autoCapitalize="characters"
          className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 rounded focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/30 tracking-[0.3em] font-semibold transition"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 rounded hover:bg-emerald-400 transition disabled:opacity-50 tracking-wider"
      >
        {status === 'loading'
          ? hasCode
            ? 'SIGNING IN...'
            : 'SAVING...'
          : hasCode
            ? 'ENTER TERMINAL →'
            : 'JOIN THE LIST'}
      </button>

      <div className="text-[11px] text-white/55 text-center leading-relaxed">
        {hasCode
          ? 'Your code unlocks the terminal immediately — no email round-trip.'
          : 'No code? Drop your email and we\'ll invite in waves. .edu emails get priority.'}
      </div>

      {status === 'error' && errorMsg && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-400/40 rounded px-3 py-2">
          {'>'} {errorMsg}
        </div>
      )}
    </form>
  )
}

function WaitlistSuccessCard({ payload }: { payload: WaitlistSuccess | null }) {
  const [copied, setCopied] = useState(false)
  const position = payload?.position
  const referralCode = payload?.referralCode
  const slotsTotal = payload?.inviteSlotsTotal ?? 1
  const used = payload?.directReferrals ?? 0
  const remaining = Math.max(0, slotsTotal - used)
  const link = referralCode ? `https://sneakersterminal.com/r/${referralCode}` : null

  function copy() {
    if (!link) return
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="rounded-xl border border-emerald-400/60 bg-black/60 backdrop-blur-sm p-5 text-white space-y-4">
      <div>
        <div className="text-sm text-emerald-300">{'>'} You&apos;re on the list.</div>
        {typeof position === 'number' && (
          <div className="text-xs text-white/70 mt-1">
            Queue position{' '}
            <span className="text-emerald-400 font-semibold">#{position}</span>.
          </div>
        )}
      </div>

      <div className="border-t border-emerald-400/20 pt-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-300 font-mono tabular-nums leading-none">
              {remaining}
            </span>
            <span className="text-sm font-semibold tracking-wider text-emerald-300/90 uppercase">
              Invite
            </span>
          </div>
          <span
            className={`text-[10px] tracking-[0.15em] font-bold px-2.5 py-1 rounded-full ring-1 ${
              remaining > 0
                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/50'
                : 'bg-stone-500/20 text-stone-400 ring-stone-400/40'
            }`}
          >
            {remaining > 0 ? 'UNUSED' : 'SENT'}
          </span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: slotsTotal }).map((_, i) => {
            const filled = i < used
            return (
              <div
                key={i}
                className={`h-3 flex-1 rounded-full ${
                  filled ? 'bg-emerald-500/30' : 'bg-emerald-500 ring-1 ring-emerald-300/40'
                }`}
                aria-label={filled ? 'Invite used' : 'Invite available'}
              />
            )
          })}
        </div>
        <div className="text-sm text-white/85 mt-3 leading-relaxed">
          You get <span className="text-emerald-300 font-bold">one</span>. Pick somebody
          who&apos;d actually use this — your frat, your roommate, or the one person in your
          group chat who knows what Kalshi is.
        </div>
      </div>

      {link && (
        <div className="border-t border-emerald-400/20 pt-4">
          <div className="text-[11px] tracking-wider text-emerald-300/80 mb-2">YOUR LINK</div>
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-black/50 border border-white/20 text-white/90 text-xs px-3 py-2 rounded font-mono focus:outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={copy}
              className="border border-emerald-400 bg-emerald-500 text-black text-[11px] font-semibold tracking-wider px-3 py-2 rounded hover:bg-emerald-400 transition"
            >
              {copied ? 'COPIED' : 'COPY'}
            </button>
          </div>
          <div className="text-[11px] text-white/50 mt-2">
            When they sign up through this link you move up 5 spots AND you&apos;re in. Refresh
            the sign-in page after they join.
          </div>
        </div>
      )}

      <a
        href="/login"
        className="block w-full text-center border border-emerald-400 bg-emerald-500 text-black text-sm font-semibold tracking-wider px-6 py-3 rounded hover:bg-emerald-400 transition mt-2"
      >
        CONTINUE TO SIGN IN →
      </a>
    </div>
  )
}
