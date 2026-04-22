'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Result =
  | { kind: 'sent'; email: string; to: string | undefined }
  | { kind: 'error'; message: string }

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<Result | null>(null)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const normalized = email.trim().toLowerCase()
        if (!normalized || !normalized.includes('@')) return
        setResult(null)
        startTransition(async () => {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: normalized }),
          })
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean
            status?: string
            to?: string
          }

          // Success: admin or returning user — stay here and say "check inbox".
          if (res.ok && data.status === 'magic_link_sent') {
            setResult({ kind: 'sent', email: normalized, to: data.to })
            return
          }

          // Needs context — route to /login?email=... which shows position +
          // the right CTA (invite-code continue, waitlist status, or join CTA).
          if (
            data.status === 'needs_code' ||
            data.status === 'waitlist_only' ||
            data.status === 'not_found'
          ) {
            router.push(`/login?email=${encodeURIComponent(normalized)}`)
            return
          }

          setResult({
            kind: 'error',
            message: `Couldn't sign you in (${data.status ?? res.status}). Try again in a moment.`,
          })
        })
      }}
      className="space-y-3"
    >
      {result?.kind === 'sent' ? (
        <div className="border border-emerald-400/60 bg-emerald-400/10 text-emerald-300 px-3 py-3 text-xs space-y-1">
          <div className="font-semibold">{'>'} Magic link sent.</div>
          <div className="text-white/80">
            Check <span className="font-mono text-emerald-300">{result.email}</span> for a sign-in
            link.
            {result.to && (
              <>
                {' '}
                You&apos;ll land on{' '}
                <span className="text-emerald-400 font-semibold">{result.to}</span>.
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@firm.com"
            className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 placeholder:text-white/40 transition"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 transition disabled:opacity-50"
          >
            {pending ? 'SIGNING IN…' : 'SIGN IN →'}
          </button>
          {result?.kind === 'error' && (
            <div className="border border-red-400/60 bg-red-400/10 text-red-300 px-3 py-2 text-xs">
              {result.message}
            </div>
          )}
        </>
      )}
    </form>
  )
}
