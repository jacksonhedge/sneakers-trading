'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function WaitlistForm({ referralCode }: { referralCode?: string | null }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'landing', referralCode: referralCode ?? null }),
    })
    if (res.ok) {
      setStatus('done')
      router.refresh()
    } else {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="border border-green-400 p-4">
        <div className="text-sm">{'>'} Access requested.</div>
        <div className="text-xs opacity-70 mt-1">
          You&apos;ll hear from us before launch. Check your inbox for your
          referral link and confirmation.
          {referralCode && (
            <> Operator <span className="text-green-400">{referralCode}</span> just moved up.</>
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
          className="flex-1 bg-transparent border border-green-400 px-4 py-3 focus:outline-none focus:border-green-200 placeholder:opacity-40"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="border border-green-400 px-6 py-3 hover:bg-green-400 hover:text-black transition disabled:opacity-50"
        >
          {status === 'loading' ? '...' : 'REQUEST ACCESS'}
        </button>
      </form>
      {status === 'error' && (
        <div className="text-xs text-red-400 opacity-80 mt-2">
          {'>'} Error. Try again in a moment.
        </div>
      )}
    </>
  )
}
