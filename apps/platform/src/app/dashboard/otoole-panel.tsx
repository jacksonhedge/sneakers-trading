'use client'

import { useEffect, useRef, useState } from 'react'

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
  "I'm reading the markets you watch. It'll take a beat before I see clearly.",
  "But you don't need to wait. Ask me anything — what's hot, what's mispriced, what to watch tonight.",
  'For thinking through a trade, or just a sanity check before you click buy, I am always here.',
] as const

interface Props {
  userName: string | null
}

export function OToolePanel({ userName }: Props) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [byo, setByo] = useState<ByoKey>({ state: 'loading' })
  const [pasteInput, setPasteInput] = useState('')

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
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        role?: string
        content?: string
        stub?: boolean
        error?: string
        message?: string
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setPending(false)
    }
  }

  const headerName = userName ? `${userName}'s terminal` : 'Your terminal'

  return (
    <aside className="w-[380px] shrink-0 flex flex-col bg-white border-r border-stone-200">
      <header className="flex items-center gap-2 px-5 py-3.5 border-b border-stone-200">
        <span
          className="w-6 h-6 rounded-full ring-1 ring-stone-300 bg-stone-50 inline-flex items-center justify-center text-[10px] text-stone-700"
          aria-hidden
        >
          ○
        </span>
        <span className="text-sm text-stone-900 font-medium truncate">
          {headerName}
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="space-y-5 text-[15px] leading-relaxed text-stone-900">
            {GREETING_LINES.map((line, i) => (
              <p key={i} className={i === 0 ? 'font-semibold' : ''}>
                {line}
              </p>
            ))}
            <p className="font-semibold text-stone-900 pt-2">
              What&apos;s on your mind?
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'ml-6 px-3 py-2 rounded-2xl rounded-br-sm bg-emerald-50 text-stone-900 ring-1 ring-emerald-200'
                    : 'text-stone-900'
                } ${m.stub ? 'opacity-80' : ''}`}
              >
                {m.content}
              </div>
            ))}
            {pending && (
              <div className="text-xs text-stone-500 inline-flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Thinking…
              </div>
            )}
            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BYO LLM key — small expander above the chat input. Default
          uses Sneakers' (rate-limited / capped) key; pasting yours
          here uses your key + bypasses our cap. */}
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
          <span>Using O&apos;Toole&apos;s key (free, capped daily)</span>
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
