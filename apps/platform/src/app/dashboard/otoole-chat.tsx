'use client'

import { useRef, useState, useTransition, useEffect } from 'react'
import { AI_MODELS, DEFAULT_MODEL, FREE_TIER_DEFAULT_MODEL, type AIModelId } from '@/lib/ai-models'

type Message = { role: 'user' | 'assistant'; content: string; stub?: boolean }

const CHIPS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Find Edge',
    prompt:
      'Scan the current snapshot — which markets have the widest overrounds right now? Flag the top 3 candidates worth verifying manually.',
  },
  {
    label: 'Whale Alerts',
    prompt:
      'Which markets have the highest 24h volume in the current snapshot? Are any of them news-driven or worth watching closely?',
  },
  {
    label: 'Portfolio Risk',
    prompt:
      "I don't have live positions wired up yet. Assuming I was trading the top-volume markets you see, what concentration risks should I think about?",
  },
  {
    label: 'Best Bets',
    prompt:
      'Pick 3 markets with favorable pricing right now — tight spreads, reasonable implied probabilities, and enough volume to be worth entering. Explain each.',
  },
]

export function OTooleChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Good evening. I've scanned active markets across Kalshi, Polymarket, NoVig and ProphetX. Ask me about any specific market, or hit a chip below for a quick scan.",
    },
  ])
  const [input, setInput] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [capInfo, setCapInfo] = useState<{ used: number; limit: number; tier: string; resetsInSeconds: number } | null>(null)
  const [model, setModel] = useState<AIModelId>(FREE_TIER_DEFAULT_MODEL)
  const [balance, setBalance] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function send(prompt: string) {
    const content = prompt.trim()
    if (!content || pending) return
    setError(null)
    const next: Message[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    startTransition(async () => {
      try {
        const res = await fetch('/api/otoole/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            // Only send user/assistant turns; the server injects the system prompt itself.
            messages: next.map((m) => ({ role: m.role, content: m.content })),
            model,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          role?: string
          content?: string
          stub?: boolean
          error?: string
          message?: string
          cap?: { used: number; limit: number; tier: string; resetsInSeconds: number }
          balance?: number
          creditsSpent?: number
        }
        if (res.status === 429 && data.error === 'daily_cap_reached') {
          setError(data.message ?? `Daily cap reached on ${data.cap?.tier ?? 'free'} tier.`)
          return
        }
        if (!res.ok || !data.content) {
          setError(data.message ?? data.error ?? `HTTP ${res.status}`)
          return
        }
        if (data.cap) setCapInfo(data.cap)
        if (typeof data.balance === 'number') setBalance(data.balance)
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.content!, stub: data.stub },
        ])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed')
      }
    })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-xs leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'ml-4 p-3 rounded bg-[#00703c]/10 text-[#004225] border border-[#00703c]/30'
                : 'bg-stone-100 text-stone-800 p-3 rounded'
            } ${m.stub ? 'opacity-80' : ''}`}
          >
            {m.content}
          </div>
        ))}
        {pending && (
          <div className="text-xs text-stone-500 px-3">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
            O&apos;Toole is thinking…
          </div>
        )}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded">
            {error}
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={pending}
              onClick={() => send(c.prompt)}
              className="text-[10px] tracking-wider px-2.5 py-1 rounded-full ring-1 ring-stone-300 text-stone-600 hover:bg-stone-100 transition disabled:opacity-50"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {capInfo && (
        <div className="px-4 py-1.5 text-[10px] tracking-wider text-stone-500 bg-stone-50 border-t border-stone-200 flex items-center justify-between">
          <span>
            {capInfo.used}/{isFinite(capInfo.limit) ? capInfo.limit : '∞'} today · {capInfo.tier} tier
          </span>
          {capInfo.used >= capInfo.limit * 0.8 && isFinite(capInfo.limit) && (
            <a href="/dashboard/billing/credits" className="text-emerald-600 hover:underline">
              Buy credits →
            </a>
          )}
        </div>
      )}

      {/* Model picker — sits just above the input so users see which model will
          answer + what it costs before hitting send. */}
      <div className="px-4 py-2 border-t border-stone-200 bg-stone-50 flex items-center gap-2">
        <label className="text-[10px] tracking-wider text-stone-500 uppercase">Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value as AIModelId)}
          className="flex-1 text-[11px] bg-white ring-1 ring-stone-300 rounded px-2 py-1 focus:outline-none focus:ring-emerald-400"
          disabled={pending}
        >
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id} disabled={!m.enabled}>
              {m.displayName} · {m.creditCostPerMessage}cr{!m.enabled ? ' (soon)' : ''}
            </option>
          ))}
        </select>
        {balance != null && (
          <span className="text-[10px] text-stone-500 tabular-nums">
            {balance.toLocaleString()} cr
          </span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="border-t border-stone-200 p-3"
      >
        <div className="flex items-center gap-2 bg-stone-100 rounded px-3 py-2 focus-within:bg-white focus-within:ring-1 focus-within:ring-emerald-400/60 transition">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={pending}
            placeholder="Ask O'Toole anything…"
            className="flex-1 bg-transparent text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="w-6 h-6 rounded bg-emerald-500 text-white flex items-center justify-center text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-600 transition"
          >
            →
          </button>
        </div>
      </form>
    </div>
  )
}
