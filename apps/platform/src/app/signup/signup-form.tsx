'use client'
import { useState } from 'react'

export function SignupForm({ initialCode }: { initialCode?: string }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(initialCode ?? '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg(null)

    const res = await fetch('/api/auth/request-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      redirect?: string
    }

    if (res.ok && json.ok && json.redirect) {
      // Direct sign-in: Supabase returned a single-use verify URL. Navigate
      // there; it sets the session cookie and redirects to /auth/callback,
      // which routes to /onboarding for first-timers or /dashboard otherwise.
      window.location.href = json.redirect
      return
    }

    setStatus('error')
    if (json.error === 'invite_invalid') {
      setErrorMsg('That code is invalid, already used, or not for this email.')
    } else if (json.error === 'invalid_email') {
      setErrorMsg('Check the email address.')
    } else if (json.error === 'invalid_code') {
      setErrorMsg('Code must be 8 characters.')
    } else {
      setErrorMsg('Something went wrong. Try again in a moment.')
    }
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
      </div>

      <div>
        <label className="block text-[11px] tracking-wider text-emerald-300/80 mb-1">
          ACCESS CODE
        </label>
        <input
          type="text"
          required
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
        {status === 'loading' ? 'SIGNING IN...' : 'ENTER TERMINAL →'}
      </button>

      {status === 'error' && errorMsg && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-400/40 rounded px-3 py-2">
          {'>'} {errorMsg}
        </div>
      )}
    </form>
  )
}
