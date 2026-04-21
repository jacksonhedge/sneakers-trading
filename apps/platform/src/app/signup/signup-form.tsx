'use client'
import { useState } from 'react'

export function SignupForm({ initialCode }: { initialCode?: string }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(initialCode ?? '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
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
    const json = await res.json().catch(() => ({}))

    if (res.ok && json.ok) {
      setStatus('sent')
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

  if (status === 'sent') {
    return (
      <div className="border border-[#00703c] bg-[#00703c]/5 p-5 text-stone-900">
        <div className="text-sm text-[#004225] font-semibold">
          {'>'} Check your inbox.
        </div>
        <div className="text-xs text-stone-600 mt-2 leading-relaxed">
          We sent a sign-in link to <span className="font-semibold">{email}</span>.
          Click the link to finish. The link expires in an hour.
        </div>
      </div>
    )
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
        {status === 'loading' ? 'SENDING...' : 'SEND SIGN-IN LINK'}
      </button>

      {status === 'error' && errorMsg && (
        <div className="text-xs text-red-700">{'>'} {errorMsg}</div>
      )}
    </form>
  )
}
