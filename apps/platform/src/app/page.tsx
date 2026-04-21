'use client'
import { useState } from 'react'

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'landing' }),
    })
    setStatus(res.ok ? 'done' : 'error')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div>
          <div className="text-xs opacity-50 mb-2">
            SNEAKERS TERMINAL / v0.0.1 / PRE-LAUNCH
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Sneakers Terminal
          </h1>
          <p className="mt-4 text-green-300 opacity-90 text-lg leading-relaxed">
            A trading terminal for prediction markets. Unified across Kalshi,
            Polymarket, ProphetX, CDNA, and the sportsbook hybrids. Built for
            operators who want one screen instead of twenty tabs.
          </p>
        </div>

        {status === 'done' ? (
          <div className="border border-green-400 p-4">
            <div className="text-sm">{'>'} Access requested.</div>
            <div className="text-xs opacity-70 mt-1">
              You&apos;ll hear from us before launch.
            </div>
          </div>
        ) : (
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
        )}

        {status === 'error' && (
          <div className="text-xs text-red-400 opacity-80">
            {'>'} Error. Try again in a moment.
          </div>
        )}

        <div className="text-xs opacity-40 pt-8 border-t border-green-400/20">
          Sneakers Terminal is not a registered investment advisor. Educational
          and research use only. Trading involves substantial risk of loss.
        </div>
      </div>
    </main>
  )
}
