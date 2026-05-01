'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TradeDraftCards } from './trade-draft-cards'
import { OtooleMessage, OtooleTyping } from './otoole-message'
import { ModelPicker, loadStoredModel, saveStoredModel } from './model-picker'
import { DEFAULT_MODEL, type AIModelId } from '@/lib/ai-models'
import { QuickActions } from './quick-actions'

// Heyday-style left chat panel. Greeting at top → message stream →
// chat input pinned at the bottom. Replaces the old right-sidebar
// OToole layout. Same backend (POST /api/otoole/chat) — just a much
// cleaner shell.

type Msg = { role: 'user' | 'assistant'; content: string; stub?: boolean }

type ByoKey =
  | { state: 'loading' }
  | { state: 'using_otoole' }
  | { state: 'using_byo'; preview: string }
  | { state: 'editing' }
  | { state: 'saving' }

const GREETING_LINES = [
  'Welcome.',
  "I'm O'Toole. I'm reading the markets you watch — what's hot, what's mispriced, what's about to settle.",
  'Ask me anything. I can also navigate the site for you — say "show me crypto markets" or "find the highest-volume Kalshi market right now" and I\'ll take you there.',
  'Powered by Claude 4.7 by default. Bring your own Anthropic / OpenAI / Google / xAI key below if you\'d rather use that — your key, your cap.',
] as const

interface Props {
  userName: string | null
}

export function OToolePanel({ userName }: Props) {
  const router = useRouter()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [byo, setByo] = useState<ByoKey>({ state: 'loading' })
  const [pasteInput, setPasteInput] = useState('')
  // Bumped after every successful chat exchange so TradeDraftCards
  // refetches — picks up freshly-proposed trades without waiting on
  // the 20s poll.
  const [draftRefreshNonce, setDraftRefreshNonce] = useState(0)
  // Selected AI model. Hydrate from localStorage on mount so the
  // user's choice persists across sessions; default = Claude Sonnet 4.6
  // per ai-models.ts. SSR + first client render must agree, so we
  // hold DEFAULT_MODEL until the effect fires.
  const [model, setModel] = useState<AIModelId>(DEFAULT_MODEL)
  useEffect(() => {
    setModel(loadStoredModel(DEFAULT_MODEL))
  }, [])
  function handleModelChange(id: AIModelId) {
    setModel(id)
    saveStoredModel(id)
  }

  // Read the user's saved Anthropic key state on mount. The route
  // returns metadata only — we never see the raw key in the client.
  useEffect(() => {
    let cancelled = false
    fetch('/api/settings/api-keys')
      .then((r) => r.json())
      .then((d: { ok?: boolean; keys?: Array<{ provider: string; keyPreview: string }> }) => {
        if (cancelled) return
        const anthro = d.keys?.find((k) => k.provider === 'anthropic')
        setByo(
          anthro
            ? { state: 'using_byo', preview: anthro.keyPreview }
            : { state: 'using_otoole' },
        )
      })
      .catch(() => {
        if (!cancelled) setByo({ state: 'using_otoole' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function saveByoKey() {
    const key = pasteInput.trim()
    if (!key) return
    setByo({ state: 'saving' })
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'anthropic', apiKey: key }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Endpoint returns `{ok: true}` — derive the preview client-side
      // from what the user just typed (we never read the secret back).
      setPasteInput('')
      setByo({
        state: 'using_byo',
        preview: `${key.slice(0, 4)}…${key.slice(-4)}`,
      })
    } catch (err) {
      setByo({ state: 'using_otoole' })
      setError(err instanceof Error ? err.message : 'Could not save key.')
    }
  }

  async function clearByoKey() {
    setByo({ state: 'saving' })
    await fetch('/api/settings/api-keys?provider=anthropic', { method: 'DELETE' })
    setByo({ state: 'using_otoole' })
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, pending])

  async function send(promptText: string) {
    const text = promptText.trim()
    if (!text || pending) return
    setError(null)
    const next: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setPending(true)
    try {
      const res = await fetch('/api/otoole/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
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
        navigateTo?: string | null
      }
      if (res.status === 429) {
        setError(data.message ?? 'Daily message cap reached.')
        return
      }
      if (!res.ok || !data.content) {
        setError(data.message ?? data.error ?? `HTTP ${res.status}`)
        return
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.content!, stub: data.stub },
      ])
      // Reply may have called propose_trade; refetch the cards now
      // instead of waiting on the 20s poll.
      setDraftRefreshNonce((n) => n + 1)
      // If the model called navigate_to, take the user there. Same-origin
      // path is enforced server-side via NAVIGATE_ALLOWED_PREFIXES — we
      // still sanity-check on the client (defense in depth).
      if (
        typeof data.navigateTo === 'string' &&
        data.navigateTo.startsWith('/') &&
        !data.navigateTo.startsWith('//')
      ) {
        router.push(data.navigateTo)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setPending(false)
    }
  }

  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      // Same hidden md:flex gate as the expanded sidebar — mobile shows
      // the FAB-driven popup from DashboardShell instead of any docked
      // sidebar variant.
      <aside className="hidden md:flex w-12 shrink-0 flex-col items-center bg-white border-r border-stone-200 py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand O'Toole AI"
          className="w-7 h-7 rounded-full ring-1 ring-stone-300 bg-stone-950 flex items-center justify-center text-[11px] text-emerald-400 font-bold hover:ring-emerald-400 transition mb-3"
        >
          Ø
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="text-[10px] tracking-[0.18em] text-stone-700 font-semibold hover:text-stone-900 transition"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          O&apos;TOOLE AI
        </button>
      </aside>
    )
  }

  return (
    // Mobile: hidden by default. The MobileOToolePopup (rendered separately
    // in DashboardShell) shows a FAB that toggles a full-screen overlay
    // version of this panel. Above md breakpoint (768px), the panel docks
    // as a left sidebar like before.
    <aside className="hidden md:flex w-[380px] shrink-0 flex-col bg-white border-r border-stone-200 min-h-0 h-full">
      <header className="flex items-center gap-2 px-5 py-3.5 border-b border-stone-200">
        <span
          className="w-6 h-6 rounded-full ring-1 ring-stone-300 bg-stone-950 inline-flex items-center justify-center text-[10px] text-emerald-400 font-bold"
          aria-hidden
        >
          Ø
        </span>
        <span className="text-sm text-stone-900 font-semibold truncate">
          O&apos;Toole AI
        </span>
        <span className="text-[10px] text-stone-500 truncate flex-1 ml-1">
          {userName ? `· ${userName}` : ''}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse O'Toole AI"
          title="Collapse"
          className="w-6 h-6 inline-flex items-center justify-center rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <TradeDraftCards refreshNonce={draftRefreshNonce} />
        {messages.length === 0 ? (
          <div className="relative rounded-2xl ring-1 ring-stone-200 bg-white overflow-hidden">
            {/* Cascading-aurora background — three radial gradients
                drifting on slow keyframes, blurred to a soft wash so the
                greeting reads as an "AI window," not flat copy. Pure CSS
                + pseudo-elements; no deps. */}
            <style>{`
              @keyframes otoole-aurora-a {
                0%   { transform: translate(0%, 0%) scale(1); }
                50%  { transform: translate(15%, -8%) scale(1.15); }
                100% { transform: translate(0%, 0%) scale(1); }
              }
              @keyframes otoole-aurora-b {
                0%   { transform: translate(0%, 0%) scale(1.1); }
                50%  { transform: translate(-12%, 10%) scale(1); }
                100% { transform: translate(0%, 0%) scale(1.1); }
              }
              @keyframes otoole-aurora-c {
                0%   { transform: translate(0%, 0%) scale(1); }
                50%  { transform: translate(8%, 12%) scale(0.9); }
                100% { transform: translate(0%, 0%) scale(1); }
              }
              .otoole-aurora-a {
                background: radial-gradient(circle at 20% 30%, rgba(16,185,129,0.32), transparent 55%);
                animation: otoole-aurora-a 18s ease-in-out infinite;
              }
              .otoole-aurora-b {
                background: radial-gradient(circle at 80% 20%, rgba(56,189,248,0.28), transparent 55%);
                animation: otoole-aurora-b 22s ease-in-out infinite;
              }
              .otoole-aurora-c {
                background: radial-gradient(circle at 50% 90%, rgba(139,92,246,0.22), transparent 55%);
                animation: otoole-aurora-c 26s ease-in-out infinite;
              }
              .otoole-aurora-layer {
                position: absolute;
                inset: -25%;
                filter: blur(28px);
                pointer-events: none;
              }
            `}</style>
            <div className="otoole-aurora-layer otoole-aurora-a" aria-hidden />
            <div className="otoole-aurora-layer otoole-aurora-b" aria-hidden />
            <div className="otoole-aurora-layer otoole-aurora-c" aria-hidden />

            <div className="relative px-5 py-6 space-y-5 text-[15px] leading-relaxed text-stone-900">
              <div className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.2em] font-semibold text-emerald-700 bg-white/70 backdrop-blur-sm rounded-full px-2.5 py-1 ring-1 ring-emerald-200">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"
                  aria-hidden
                />
                AI WINDOW
              </div>
              {GREETING_LINES.map((line, i) => (
                <p key={i} className={i === 0 ? 'font-semibold' : ''}>
                  {line}
                </p>
              ))}
              <p className="font-semibold text-stone-900 pt-2">
                What&apos;s on your mind?
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div
                  key={i}
                  className="ml-6 px-3 py-2 rounded-2xl rounded-br-sm bg-emerald-50 text-stone-900 ring-1 ring-emerald-200 text-sm leading-relaxed whitespace-pre-wrap"
                >
                  {m.content}
                </div>
              ) : (
                <div
                  key={i}
                  className={`text-stone-900 ${m.stub ? 'opacity-80' : ''}`}
                >
                  <OtooleMessage content={m.content} />
                </div>
              ),
            )}
            {pending && <OtooleTyping />}
            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick actions — chip row for autotrade ON/OFF + cap setters.
          One-click adjustments without typing into the chat. */}
      <QuickActions />

      {/* Model picker + BYO LLM key — small row above the chat input.
          Picker swaps OToole's underlying model (saved per-user in
          localStorage). BYO key lets the user use their own provider
          key + bypass our daily cap. */}
      <div className="px-4 pb-1 pt-1 flex items-center justify-between gap-2">
        <ModelPicker selected={model} onChange={handleModelChange} />
      </div>
      <ByoKeyRow
        byo={byo}
        pasteInput={pasteInput}
        setPasteInput={setPasteInput}
        onEdit={() => setByo({ state: 'editing' })}
        onCancel={() =>
          setByo(
            byo.state === 'editing' || byo.state === 'saving'
              ? { state: 'using_otoole' }
              : byo,
          )
        }
        onSave={saveByoKey}
        onClear={clearByoKey}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="px-4 pb-4"
      >
        <div className="rounded-2xl bg-stone-100 ring-1 ring-stone-200 focus-within:ring-stone-300 transition px-4 pt-3 pb-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            disabled={pending}
            rows={2}
            placeholder="Talk to O'Toole"
            className="w-full bg-transparent outline-none resize-none text-sm text-stone-900 placeholder:text-stone-500 disabled:opacity-60"
          />
          <div className="flex items-center justify-end pt-1">
            <button
              type="submit"
              disabled={pending || input.trim().length === 0}
              aria-label="Send"
              className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-stone-200 hover:bg-stone-300 text-stone-700 disabled:opacity-40 transition"
            >
              ↑
            </button>
          </div>
        </div>
      </form>
    </aside>
  )
}

function ByoKeyRow({
  byo,
  pasteInput,
  setPasteInput,
  onEdit,
  onCancel,
  onSave,
  onClear,
}: {
  byo: ByoKey
  pasteInput: string
  setPasteInput: (v: string) => void
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  onClear: () => void
}) {
  if (byo.state === 'editing' || byo.state === 'saving') {
    return (
      <div className="px-4 pb-2">
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-3 py-2.5">
          <div className="text-[10px] tracking-wider text-amber-800 font-semibold mb-1.5">
            YOUR ANTHROPIC KEY (sk-ant-…)
          </div>
          <input
            type="password"
            value={pasteInput}
            onChange={(e) => setPasteInput(e.target.value)}
            placeholder="sk-ant-api03-…"
            disabled={byo.state === 'saving'}
            autoFocus
            className="w-full bg-white border border-amber-200 px-2.5 py-1.5 rounded text-xs font-mono focus:outline-none focus:border-amber-400 placeholder:text-stone-400 disabled:opacity-60"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave()
              if (e.key === 'Escape') onCancel()
            }}
          />
          <div className="flex items-center justify-end gap-2 mt-1.5">
            <button
              type="button"
              onClick={onCancel}
              className="text-[11px] text-stone-600 hover:text-stone-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!pasteInput.trim() || byo.state === 'saving'}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-40"
            >
              {byo.state === 'saving' ? 'Saving…' : 'Save key'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pb-2 flex items-center justify-between text-[11px] text-stone-500">
      {byo.state === 'using_byo' ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-emerald-700 font-semibold">✓ Using your key</span>
            <span className="font-mono text-stone-500">{byo.preview}</span>
          </span>
          <button
            type="button"
            onClick={onClear}
            className="text-stone-500 hover:text-stone-800 underline"
          >
            Use O&apos;Toole&apos;s instead
          </button>
        </>
      ) : (
        <>
          <span className="text-stone-400">
            On Sneakers&apos; key · free, capped daily
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="text-emerald-700 hover:text-emerald-800 font-semibold"
          >
            Use your own key →
          </button>
        </>
      )}
    </div>
  )
}
