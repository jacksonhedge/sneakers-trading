'use client'

import { useState } from 'react'

// Open signup form. Anyone with an email can sign up:
//   - If ACCESS CODE is filled → existing waitlist invite flow (validates
//     the code against the user's waitlist row, mints a magic link)
//   - If ACCESS CODE is empty → open path: server creates the auth user
//     immediately, marks a waitlist row as instantly-used, returns a
//     magic-link URL we navigate to. User lands authenticated.
//
// Either way, success = navigate to the magic link → session cookie set
// → /auth/callback redirect → /dashboard.

function isEduEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed.includes('@')) return false
  return /@([a-z0-9-]+\.)*edu(\.[a-z]{2,3})?$/.test(trimmed)
}

export function SignupForm({
  initialCode,
}: {
  initialCode?: string
  referralCode?: string | null
}) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(initialCode ?? '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const hasCode = code.trim().length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg(null)

    // Single endpoint handles both code-based and open signup. No code →
    // direct account creation + magic-link redirect. With code → existing
    // waitlist-row validation.
    const payload: { email: string; code?: string } = {
      email: email.trim().toLowerCase(),
    }
    if (hasCode) payload.code = code.trim().toUpperCase()

    const res = await fetch('/api/auth/request-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      redirect?: string
    }
    if (res.ok && json.ok && json.redirect) {
      // Open signup completes immediately — sets session cookie + lands on
      // /auth/callback → /dashboard. Referral attribution for open signups
      // is a follow-up (the callback can read the sneakers_ref cookie and
      // wire it up post-auth).
      window.location.href = json.redirect
      return
    }

    setStatus('error')
    if (json.error === 'invite_invalid')
      setErrorMsg('That code is invalid, already used, or not for this email.')
    else if (json.error === 'invalid_email') setErrorMsg('Check the email address.')
    else if (json.error === 'invalid_code') setErrorMsg('Code must be 8 characters.')
    else setErrorMsg('Something went wrong. Try again in a moment.')
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

