'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

// Product-forward hero card for the dashboard. Introduces O'Toole (our AI
// co-pilot) with three capability pillars: configure, teach, execute.
// Dismissible — same localStorage pattern as WalletStatusCard — so users
// who've "gotten it" don't have to keep seeing it.

const DISMISS_KEY = 'sneakers_otoole_spotlight_dismissed'

type PillarStatus = 'live' | 'beta' | 'coming_soon'

interface Pillar {
  icon: string
  title: string
  body: string
  status: PillarStatus
  cta: { label: string; href: string }
}

const PILLARS: Pillar[] = [
  {
    icon: '⚙',
    title: 'Configure',
    body: 'Pick your model (Haiku, Sonnet, Opus, GPT-5). Set the voice. Scope what it can see — your positions, your school, the full market feed.',
    status: 'live',
    cta: { label: 'Open settings', href: '/dashboard/settings/otoole' },
  },
  {
    icon: '📖',
    title: 'Teach',
    body: 'Paste your strategy, plus tweets, GitHub repos, articles, and notes. Tag with a market keyword so each insight only fires on relevant questions.',
    status: 'live',
    cta: { label: 'Add knowledge', href: '/dashboard/settings/otoole#memory' },
  },
  {
    icon: '⚡',
    title: 'Execute',
    body: 'Tell it a rule in plain English — "buy Lakers ML if Kalshi diverges 5pp from Polymarket, max $50" — and O\'Toole places the trade when the condition hits.',
    status: 'coming_soon',
    cta: { label: 'Join the waitlist', href: '/dashboard/settings/autotrade' },
  },
]

const STATUS_STYLE: Record<PillarStatus, { label: string; cls: string }> = {
  live: { label: 'LIVE', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
  beta: { label: 'BETA', cls: 'bg-amber-100 text-amber-800 ring-amber-300' },
  coming_soon: { label: 'COMING SOON', cls: 'bg-stone-200 text-stone-700 ring-stone-300' },
}

export function OtooleSpotlight() {
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  // Same hydration-safe pattern as WalletStatusCard — null until localStorage
  // is read client-side, so SSR renders nothing and we avoid flash.
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])

  function dismiss() {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Storage disabled — at least dismiss in-memory for this session.
    }
  }

  if (dismissed !== false) return null

  return (
    <section className="relative rounded-xl overflow-hidden ring-1 ring-stone-200 bg-gradient-to-br from-stone-950 via-stone-900 to-emerald-950 text-white">
      {/* Dismiss */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss O'Toole spotlight"
        className="absolute top-3 right-3 z-10 text-white/50 hover:text-white/90 text-xl leading-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition"
      >
        ×
      </button>

      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 px-6 py-6">
        {/* Left: intro */}
        <div className="flex md:flex-col items-center md:items-start gap-4 md:max-w-[200px]">
          <div className="rounded-full bg-white/5 ring-1 ring-emerald-400/30 p-3 shadow-[0_0_32px_rgba(16,185,129,0.2)]">
            <Image
              src="/logo.png"
              alt="O'Toole"
              width={56}
              height={56}
              className="w-14 h-14 drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
            />
          </div>
          <div>
            <div className="text-[10px] tracking-[0.2em] text-emerald-300/80 font-semibold">
              MEET O&apos;TOOLE
            </div>
            <div className="text-xl md:text-2xl font-bold tracking-tight mt-1 leading-tight">
              Your AI trading desk.
            </div>
            <div className="text-sm text-white/70 mt-2 leading-snug">
              A bot you <span className="text-emerald-300 font-semibold">configure</span>,{' '}
              <span className="text-emerald-300 font-semibold">teach</span>, and eventually let{' '}
              <span className="text-emerald-300 font-semibold">execute</span> trades for you.
            </div>
          </div>
        </div>

        {/* Right: 3 pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PILLARS.map((p) => {
            const status = STATUS_STYLE[p.status]
            return (
              <a
                key={p.title}
                href={p.cta.href}
                className="group relative rounded-lg bg-white/5 hover:bg-white/10 backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-400/50 px-4 py-4 transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-2xl" aria-hidden>
                    {p.icon}
                  </div>
                  <span
                    className={`text-[9px] tracking-[0.1em] font-bold px-2 py-0.5 rounded-full ring-1 ${status.cls}`}
                  >
                    {status.label}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white mb-1">{p.title}</div>
                <div className="text-[11px] text-white/65 leading-relaxed mb-3">{p.body}</div>
                <div className="text-[11px] font-semibold text-emerald-300 group-hover:text-emerald-200 tracking-wider">
                  {p.cta.label} →
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}
