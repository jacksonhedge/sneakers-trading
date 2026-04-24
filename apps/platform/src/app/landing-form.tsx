'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Landing-page form. Code-first: if the visitor has an access code we treat
// it as a sign-in (POST /api/auth/request-link → magic link). If the code
// field is empty we fall back to /api/waitlist so users without a code can
// still get their foot in the door.
//
// Two separate success states:
//   - magic-link sent ("check your inbox")
//   - waitlist entry created (shows queue position + referral link, same
//     payload as WaitlistForm's success card)

interface WaitlistSuccess {
  position: number
  referralCode: string
  inviteSlotsTotal: number
  directReferrals: number
}

export function LandingForm({ referralCode }: { referralCode?: string | null }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
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
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim().toUpperCase() }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        redirect?: string
      }
      if (res.ok && json.ok && json.redirect) {
        // Direct sign-in: navigate to the single-use Supabase verify URL.
        // It sets the session cookie and 302s to /auth/callback, which
        // routes first-timers through onboarding and repeat users to /dashboard.
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
        source: 'landing',
        referralCode: referralCode ?? null,
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
      // Already on the waitlist — bounce them to /login so they can see their
      // position / grab a magic link if they've already been invited.
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
    router.refresh()
  }

  if (status === 'waitlist_done') {
    return <WaitlistSuccessCard payload={waitlist} referrerCode={referralCode} />
  }

  return (
    <form onSubmit={submit} className="space-y-3">
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
          className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/30 tracking-[0.3em] font-semibold transition"
        />
      </div>

      <div>
        <label className="block text-[11px] tracking-wider text-emerald-300/80 mb-1">EMAIL</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition disabled:opacity-50 tracking-wider"
      >
        {status === 'loading'
          ? hasCode
            ? 'SIGNING IN...'
            : '...'
          : hasCode
            ? 'ACCESS'
            : 'JOIN WAITLIST'}
      </button>

      <div className="text-[11px] text-white/50 text-center leading-relaxed">
        {hasCode
          ? 'Clicking ACCESS signs you in immediately.'
          : 'No code? You can still join the waitlist — we invite in waves.'}
      </div>

      {status === 'error' && errorMsg && (
        <div className="text-xs text-red-300">{'>'} {errorMsg}</div>
      )}
    </form>
  )
}

function WaitlistSuccessCard({
  payload,
  referrerCode,
}: {
  payload: WaitlistSuccess | null
  referrerCode?: string | null
}) {
  const [copied, setCopied] = useState(false)
  const position = payload?.position
  const referralCode = payload?.referralCode
  const slotsTotal = payload?.inviteSlotsTotal ?? 3
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
    <div className="border border-emerald-400/60 bg-black/60 backdrop-blur-sm p-5 text-white space-y-4">
      <div>
        <div className="text-sm text-emerald-300">{'>'} You&apos;re on the list.</div>
        {typeof position === 'number' && (
          <div className="text-xs text-white/70 mt-1">
            Queue position{' '}
            <span className="text-emerald-400 font-semibold">#{position}</span>.
            {referrerCode && (
              <>
                {' '}Operator{' '}
                <span className="text-emerald-400 font-semibold">{referrerCode}</span> just moved
                up.
              </>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-emerald-400/20 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] tracking-wider text-emerald-300/80">YOUR INVITES</div>
          <div className="text-[11px] text-white/60 font-mono tabular-nums">
            {remaining} of {slotsTotal}
          </div>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: slotsTotal }).map((_, i) => {
            const filled = i < used
            return (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full ${
                  filled ? 'bg-emerald-500/30' : 'bg-emerald-500 ring-1 ring-emerald-300/40'
                }`}
                aria-label={filled ? 'Invite used' : 'Invite available'}
              />
            )
          })}
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
              className="flex-1 bg-black/50 border border-white/20 text-white/90 text-xs px-3 py-2 font-mono focus:outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={copy}
              className="border border-emerald-400 bg-emerald-500 text-black text-[11px] font-semibold tracking-wider px-3 py-2 hover:bg-emerald-400 transition"
            >
              {copied ? 'COPIED' : 'COPY'}
            </button>
          </div>
          <div className="text-[11px] text-white/50 mt-2">
            Each signup through this link moves you up 5 spots + claims one of your invites.
          </div>
        </div>
      )}
    </div>
  )
}
