'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TerminalLoadingSplash } from '@/components/terminal-loading-splash'

// Email + password sign-in. Magic-link is still available as a fallback
// for users who forgot their password — that path lives in MagicLinkButton
// (rendered by the parent /login page when state.kind matches a known user).
//
// "Remember me" persists the email (not the password — the browser's
// password manager handles that via autoComplete). Stored per-origin in
// localStorage, so admin.sneakersterminal.com remembers its own admin
// email separately from the apex/app subdomain.

type Phase = 'idle' | 'signing-in' | 'redirecting' | 'error'

const REMEMBER_KEY = 'sneakers_login_remember'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  // Restore remembered email on mount. Run once, client-only — no SSR.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REMEMBER_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { email?: string; remember?: boolean }
      if (parsed.email) setEmail(parsed.email)
      if (typeof parsed.remember === 'boolean') setRemember(parsed.remember)
    } catch {
      // corrupt entry — ignore, the next successful submit will overwrite
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!normalized.includes('@') || password.length === 0) return
    setPhase('signing-in')
    setError(null)
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: normalized, password }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
    }
    if (res.ok && data.ok) {
      try {
        if (remember) {
          window.localStorage.setItem(
            REMEMBER_KEY,
            JSON.stringify({ email: normalized, remember: true }),
          )
        } else {
          window.localStorage.removeItem(REMEMBER_KEY)
        }
      } catch {
        // localStorage may be disabled (private mode on some browsers); harmless
      }
      // Honor ?next= if present and safe (must be a relative path starting
      // with a single '/'). Otherwise pick a host-appropriate default:
      // admin.* / app.* → '/' (proxy rewrites to the right root), apex →
      // '/dashboard'. '/dashboard' on admin.* would 404 via the rewrite
      // path, which is the bug that motivated this whole branch.
      const host = window.location.host.toLowerCase()
      const url = new URL(window.location.href)
      const nextRaw = url.searchParams.get('next') ?? ''
      const safeNext =
        nextRaw.startsWith('/') && !nextRaw.startsWith('//') && !nextRaw.includes('\\')
          ? nextRaw
          : ''
      const fallback =
        host.startsWith('admin.') || host.startsWith('app.') ? '/' : '/dashboard'
      const target = safeNext || fallback
      // Keep the overlay up while the destination's heavy server-side
      // work resolves; the route's loading.tsx skeleton takes over once
      // the boundary commits.
      setPhase('redirecting')
      router.push(target)
      router.refresh()
      return
    }
    setPhase('error')
    setError("Email or password didn't match. Try again, or reset via the magic-link option below.")
  }

  if (phase === 'redirecting') {
    // Same splash the dashboard's loading.tsx renders, so the visual
    // doesn't pop when the route boundary commits.
    return (
      <div className="rounded-xl bg-white ring-1 ring-stone-200 overflow-hidden">
        <TerminalLoadingSplash />
      </div>
    )
  }

  const busy = phase === 'signing-in'

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@firm.com"
        autoComplete="email"
        className="w-full bg-stone-50 border border-stone-300 text-stone-900 px-4 py-3 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400/40 placeholder:text-stone-400 transition"
      />
      <div className="relative">
        <input
          type={showPw ? 'text' : 'password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          className="w-full bg-stone-50 border border-stone-300 text-stone-900 px-4 py-3 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400/40 placeholder:text-stone-400 transition"
        />
        <button
          type="button"
          onClick={() => setShowPw((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tracking-wider text-emerald-700 hover:text-emerald-800 font-semibold"
        >
          {showPw ? 'HIDE' : 'SHOW'}
        </button>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-stone-700 cursor-pointer select-none pt-0.5">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-400/40"
        />
        <span>
          Remember me
          <span className="text-stone-500"> — pre-fills your email next time. Your browser handles the password.</span>
        </span>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-emerald-500 text-black font-semibold px-6 py-3 ring-1 ring-emerald-400 hover:bg-emerald-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && (
          <span
            className="inline-block w-3.5 h-3.5 rounded-full border-2 border-black/30 border-t-black animate-spin"
            aria-hidden
          />
        )}
        {busy ? 'SIGNING IN…' : 'SIGN IN →'}
      </button>
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-xs">
          {error}
        </div>
      )}
      <div className="text-[11px] text-stone-600 text-center pt-1">
        <a
          href="/forgot-password"
          className="text-emerald-700 hover:text-emerald-800 font-semibold underline"
        >
          Forgot your password? →
        </a>
      </div>
    </form>
  )
}
