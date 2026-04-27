'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { track } from '@/lib/track'

// Email + password sign-in. Magic-link is still available as a fallback
// for users who forgot their password — that path lives in MagicLinkButton
// (rendered by the parent /login page when state.kind matches a known user).

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!normalized.includes('@') || password.length === 0) return
    setBusy(true)
    setError(null)
    track('login_submit', {
      target: 'login-form',
      metadata: { is_edu: /\.edu(\.|$)/.test(normalized) },
    })
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: normalized, password }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
    }
    setBusy(false)
    if (res.ok && data.ok) {
      track('login_success', { target: 'login-form', metadata: {} })
      router.push('/dashboard')
      router.refresh()
      return
    }
    track('login_error', {
      target: 'login-form',
      metadata: { error: data.error ?? null, status: res.status },
    })
    setError("Email or password didn't match. Try again, or reset via the magic-link option below.")
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@firm.com"
        autoComplete="email"
        className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 placeholder:text-white/40 transition"
      />
      <div className="relative">
        <input
          type={showPw ? 'text' : 'password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 placeholder:text-white/40 transition"
        />
        <button
          type="button"
          onClick={() => setShowPw((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tracking-wider text-emerald-300/80 hover:text-emerald-300"
        >
          {showPw ? 'HIDE' : 'SHOW'}
        </button>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="w-full border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 transition disabled:opacity-50"
      >
        {busy ? 'SIGNING IN…' : 'SIGN IN →'}
      </button>
      {error && (
        <div className="border border-red-400/60 bg-red-400/10 text-red-300 px-3 py-2 text-xs">
          {error}
        </div>
      )}
      <div className="text-[11px] text-white/55 text-center pt-1">
        Forgot your password?{' '}
        <a
          href={`/login${email ? `?email=${encodeURIComponent(email.trim().toLowerCase())}` : ''}`}
          className="text-emerald-300/90 hover:text-emerald-300 underline"
        >
          Sign in via email link instead
        </a>
      </div>
    </form>
  )
}
