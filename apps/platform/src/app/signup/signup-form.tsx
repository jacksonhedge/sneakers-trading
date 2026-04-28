'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Two-step signup. Step 1 collects the account fundamentals (email, name,
// password). Step 2 asks for an optional access code — having one drops
// you straight into the dashboard, skipping it joins the waitlist. We
// don't actually create the auth.users row until step 2 submits, so a
// user who abandons mid-flow doesn't leave a half-baked account behind.

function isEduEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed.includes('@')) return false
  return /@([a-z0-9-]+\.)*edu(\.[a-z]{2,3})?$/.test(trimmed)
}

const NAME_MIN = 2
const PASSWORD_MIN = 8

export function SignupForm({
  initialCode,
}: {
  initialCode?: string
  referralCode?: string | null
}) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(initialCode ? 2 : 1)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState(initialCode ?? '')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; action?: { href: string; label: string } } | null>(null)
  const [done, setDone] = useState<{ hasAccess: boolean; needsConfirm: boolean } | null>(null)

  function step1Valid(): boolean {
    return (
      email.trim().length > 0 &&
      email.includes('@') &&
      name.trim().length >= NAME_MIN &&
      password.length >= PASSWORD_MIN
    )
  }

  function next1(e: React.FormEvent) {
    e.preventDefault()
    if (!step1Valid()) {
      const missing: string[] = []
      if (!email.trim() || !email.includes('@')) missing.push('a valid email')
      if (name.trim().length < NAME_MIN) missing.push(`a name (${NAME_MIN}+ chars)`)
      if (password.length < PASSWORD_MIN) missing.push(`a password (${PASSWORD_MIN}+ chars)`)
      setError({ message: `Need ${missing.join(', ')} to continue.` })
      return
    }
    setError(null)
    setStep(2)
  }

  async function submitFinal(includeCode: boolean) {
    setBusy(true)
    setError(null)
    const payload: { email: string; name: string; password: string; code?: string } = {
      email: email.trim().toLowerCase(),
      name: name.trim(),
      password,
    }
    if (includeCode && code.trim()) payload.code = code.trim().toUpperCase()

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      message?: string
      hasAccess?: boolean
      needsEmailConfirmation?: boolean
    }
    setBusy(false)
    if (!res.ok || !json.ok) {
      // The API returns specific message text for every error code — render it
      // verbatim. We only add an action link for cases where there's a clear
      // next step the user should take.
      const fallback = 'Something went wrong. Try again, and contact support if it keeps failing.'
      if (json.error === 'email_in_use' || json.error === 'invite_used') {
        setError({
          message: json.message ?? 'An account with that email already exists.',
          action: { href: '/login', label: 'Sign in →' },
        })
      } else {
        setError({ message: json.message ?? fallback })
      }
      return
    }
    setDone({
      hasAccess: !!json.hasAccess,
      needsConfirm: !!json.needsEmailConfirmation,
    })
    // If they got immediate access AND have a session, route to dashboard.
    // Otherwise show the post-signup state explaining what's next.
    if (json.hasAccess && !json.needsEmailConfirmation) {
      router.push('/dashboard')
      router.refresh()
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <div className="border border-emerald-400/60 bg-emerald-400/10 text-emerald-200 px-4 py-4 rounded">
          <div className="text-xs tracking-wider font-semibold mb-1">
            ✓ ACCOUNT CREATED
          </div>
          <div className="text-sm leading-relaxed">
            {done.needsConfirm ? (
              <>
                Check <span className="font-mono">{email}</span> for a confirmation
                email — click the link to activate your account, then sign in below.
              </>
            ) : done.hasAccess ? (
              <>You&apos;re in. Routing to your dashboard…</>
            ) : (
              <>
                You&apos;re on the waitlist. We&apos;ll email you when your spot opens
                up. Refer friends from your <a href="/login" className="underline">profile page</a>{' '}
                to jump the line.
              </>
            )}
          </div>
        </div>
        <a
          href="/login"
          className="block w-full text-center border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 rounded hover:bg-emerald-400 transition tracking-wider"
        >
          GO TO SIGN IN →
        </a>
      </div>
    )
  }

  if (step === 1) {
    return (
      <form onSubmit={next1} className="space-y-3">
        <Field label="EMAIL" hint=".edu preferred">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
            autoComplete="email"
            className={inputCls}
          />
          {isEduEmail(email) && (
            <div className="text-[10px] text-emerald-300/90 mt-1.5 tracking-wider">
              ✓ .edu detected — 75% off + leaderboard access after verification
            </div>
          )}
        </Field>

        <Field label="YOUR NAME">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            autoComplete="name"
            minLength={NAME_MIN}
            className={inputCls}
          />
        </Field>

        <Field label="PASSWORD" hint="8+ characters">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tracking-wider text-emerald-300/80 hover:text-emerald-300"
            >
              {showPw ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </Field>

        <button
          type="submit"
          disabled={!step1Valid()}
          className="w-full border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 rounded hover:bg-emerald-400 transition disabled:opacity-50 tracking-wider"
        >
          NEXT →
        </button>

        {error && <ErrorBox error={error} />}

        <div className="text-[11px] text-white/55 text-center leading-relaxed">
          Already have an account?{' '}
          <a href="/login" className="text-emerald-300/90 hover:text-emerald-300 underline">
            Sign in
          </a>
        </div>
      </form>
    )
  }

  // Step 2 — access code or waitlist
  return (
    <div className="space-y-4">
      <div className="text-[10px] tracking-[0.15em] text-emerald-300/70 font-semibold">
        STEP 2 OF 2 · ACCESS
      </div>

      <Field label="ACCESS CODE" hint="optional">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXXXXXXX"
          maxLength={8}
          spellCheck={false}
          autoCapitalize="characters"
          autoComplete="off"
          className={`${inputCls} tracking-[0.3em] font-semibold`}
        />
      </Field>

      <div className="space-y-2">
        <button
          type="button"
          disabled={busy || code.trim().length === 0}
          onClick={() => submitFinal(true)}
          className="w-full border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 rounded hover:bg-emerald-400 transition disabled:opacity-40 tracking-wider"
        >
          {busy ? 'CREATING…' : 'ENTER TERMINAL →'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => submitFinal(false)}
          className="w-full border border-white/30 bg-transparent text-white font-semibold px-6 py-3 rounded hover:bg-white/5 transition disabled:opacity-40 tracking-wider text-sm"
        >
          {busy ? '…' : 'NO CODE — JOIN THE WAITLIST'}
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          setStep(1)
          setError(null)
        }}
        className="block mx-auto text-[11px] text-white/55 hover:text-white/80 underline"
      >
        ← back to step 1
      </button>

      {error && <ErrorBox error={error} />}
    </div>
  )
}

function ErrorBox({
  error,
}: {
  error: { message: string; action?: { href: string; label: string } }
}) {
  return (
    <div className="text-xs text-red-200 bg-red-950/40 border border-red-400/40 rounded px-3 py-2.5 leading-relaxed">
      <div className="flex gap-1.5">
        <span className="text-red-400/70 font-mono shrink-0">{'>'}</span>
        <span>{error.message}</span>
      </div>
      {error.action && (
        <a
          href={error.action.href}
          className="inline-block mt-1.5 ml-3 text-emerald-300/90 hover:text-emerald-300 underline tracking-wider"
        >
          {error.action.label}
        </a>
      )}
    </div>
  )
}

const inputCls =
  'w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 rounded focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/30 transition'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[11px] tracking-wider text-emerald-300/80 mb-1">
        {label} {hint && <span className="text-white/40 normal-case">({hint})</span>}
      </label>
      {children}
    </div>
  )
}
