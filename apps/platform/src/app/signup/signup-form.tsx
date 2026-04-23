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
        <label className="block text-xs text-stone-600 mb-1 tracking-wider">EMAIL</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@firm.com"
          autoComplete="email"
          className="w-full bg-white/60 border border-[#00703c]/60 text-stone-900 px-4 py-3 focus:outline-none focus:border-[#00703c] focus:bg-white placeholder:text-stone-400 transition"
        />
      </div>

      <div>
        <label className="block text-xs text-stone-600 mb-1 tracking-wider">ACCESS CODE</label>
        <input
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXXXXXXX"
          maxLength={8}
          spellCheck={false}
          autoCapitalize="characters"
          className="w-full bg-white/60 border border-[#00703c]/60 text-stone-900 px-4 py-3 focus:outline-none focus:border-[#00703c] focus:bg-white placeholder:text-stone-300 tracking-[0.3em] font-semibold transition"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full border border-[#00703c] bg-[#00703c] text-white px-6 py-3 hover:bg-[#004225] hover:border-[#004225] transition disabled:opacity-50"
      >
        {status === 'loading' ? 'SIGNING IN...' : 'ACCESS'}
      </button>

      {status === 'error' && errorMsg && (
        <div className="text-xs text-red-700">{'>'} {errorMsg}</div>
      )}
    </form>
  )
}
