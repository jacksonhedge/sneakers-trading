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
      <div className="border border-[#00703c] bg-[#00703c]/5 p-4 text-stone-900">
        <div className="text-sm text-[#004225]">{'>'} Access requested.</div>
        <div className="text-xs text-stone-600 mt-1">
          You&apos;ll hear from us before launch. Check your inbox for your
          referral link and confirmation.
          {referralCode && (
            <> Operator <span className="text-[#00703c] font-semibold">{referralCode}</span> just moved up.</>
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
          className="flex-1 bg-white/60 border border-[#00703c]/60 text-stone-900 px-4 py-3 focus:outline-none focus:border-[#00703c] focus:bg-white placeholder:text-stone-400 transition"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="border border-[#00703c] bg-[#00703c] text-white px-6 py-3 hover:bg-[#004225] hover:border-[#004225] transition disabled:opacity-50"
        >
          {status === 'loading' ? '...' : 'REQUEST ACCESS'}
        </button>
      </form>
      {status === 'error' && (
        <div className="text-xs text-red-700 mt-2">
          {'>'} Error. Try again in a moment.
        </div>
      )}
    </>
  )
}
