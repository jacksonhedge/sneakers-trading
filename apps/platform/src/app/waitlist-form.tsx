'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function WaitlistForm({ referralCode }: { referralCode?: string | null }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'admin' | 'error'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'landing', referralCode: referralCode ?? null }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      admin?: boolean
      existing?: boolean
    }
    if (res.ok) {
      if (data.admin) {
        setStatus('admin')
      } else if (data.existing) {
        // Email is already on the waitlist. Don't silently show "access requested"
        // — route them to /login where they can see their position + get a magic
        // link if they've already been invited.
        router.push(`/login?email=${encodeURIComponent(email.toLowerCase().trim())}`)
      } else {
        setStatus('done')
        router.refresh()
      }
    } else {
      setStatus('error')
    }
  }

  if (status === 'admin') {
    return (
      <div className="border border-emerald-400/80 bg-black/60 backdrop-blur-sm p-4 text-white">
        <div className="text-sm text-emerald-300">{'>'} Admin recognized.</div>
        <div className="text-xs text-white/80 mt-1">
          Magic link sent to your inbox. Click it to sign in — you&apos;ll land
          directly on <span className="text-emerald-400 font-semibold">/admin</span>.
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="border border-emerald-400/60 bg-black/50 backdrop-blur-sm p-4 text-white">
        <div className="text-sm text-emerald-300">{'>'} Access requested.</div>
        <div className="text-xs text-white/70 mt-1">
          You&apos;ll hear from us before launch. Check your inbox for your
          referral link and confirmation.
          {referralCode && (
            <> Operator <span className="text-emerald-400 font-semibold">{referralCode}</span> just moved up.</>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@firm.com"
          className="flex-1 bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition disabled:opacity-50"
        >
          {status === 'loading' ? '...' : 'REQUEST ACCESS'}
        </button>
      </form>
      {status === 'error' && (
        <div className="text-xs text-red-300 mt-2">
          {'>'} Error. Try again in a moment.
        </div>
      )}
    </>
  )
}
