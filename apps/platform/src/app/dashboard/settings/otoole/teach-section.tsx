'use client'

import { useEffect, useMemo, useState } from 'react'

type SourceKind = 'twitter' | 'github' | 'article' | 'note'

interface Source {
  id: number
  kind: SourceKind
  label: string
  content: string
  marketFilter: string | null
  createdAt: string
}

const KIND_LABEL: Record<SourceKind, string> = {
  twitter: 'Tweets',
  github: 'GitHub repos',
  article: 'Articles',
  note: 'Notes',
}

const KIND_LABEL_SINGULAR: Record<SourceKind, string> = {
  twitter: 'tweet',
  github: 'GitHub source',
  article: 'article',
  note: 'note',
}

const KIND_PLACEHOLDER: Record<SourceKind, { label: string; content: string }> = {
  twitter: {
    label: 'e.g. @nateSilver538 thread on NBA priors',
    content: 'Paste the tweet text here…',
  },
  github: {
    label: 'e.g. kalshi-public/markets — README',
    content: 'Paste the README, code snippet, or repo description here…',
  },
  article: {
    label: 'e.g. Substack — "The state of NBA props"',
    content: 'Paste the relevant paragraph(s) here…',
  },
  note: {
    label: 'e.g. "Liquidity tends to drop after 11pm ET"',
    content: 'Anything you want O’Toole to remember — facts, rules, observations…',
  },
}

const KNOWLEDGE_KINDS: SourceKind[] = ['twitter', 'github', 'article']

export function TeachSection() {
  const [memory, setMemory] = useState('')
  const [memoryDirty, setMemoryDirty] = useState(false)
  const [memorySaving, setMemorySaving] = useState(false)
  const [memorySaved, setMemorySaved] = useState(false)
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [addingKind, setAddingKind] = useState<SourceKind | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/otoole/memory', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/otoole/sources', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([m, s]) => {
        if (cancelled) return
        setMemory((m?.content as string) ?? '')
        setSources((s?.sources as Source[]) ?? [])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function saveMemory() {
    setMemorySaving(true)
    setMemorySaved(false)
    await fetch('/api/otoole/memory', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: memory }),
    })
    setMemorySaving(false)
    setMemoryDirty(false)
    setMemorySaved(true)
    setTimeout(() => setMemorySaved(false), 2000)
  }

  async function deleteSource(id: number) {
    if (!confirm('Delete this source? O’Toole will stop seeing it on future chats.')) return
    setSources((prev) => prev.filter((s) => s.id !== id))
    await fetch(`/api/otoole/sources?id=${id}`, { method: 'DELETE' })
  }

  function onAdded(s: Source) {
    setSources((prev) => [s, ...prev])
    setAddingKind(null)
  }

  // Group sources by kind once per render so each subsection just slices.
  const byKind = useMemo(() => {
    const out: Record<SourceKind, Source[]> = {
      twitter: [],
      github: [],
      article: [],
      note: [],
    }
    for (const s of sources) out[s.kind].push(s)
    return out
  }, [sources])

  return (
    <>
      {/* ── Strategy ────────────────────────────────────────────────── */}
      <section className="mb-6 rounded-lg bg-white ring-1 ring-stone-200 p-6">
        <SectionHeader icon="🎯" title="Strategy" status="LIVE" />
        <p className="text-sm text-stone-700 mb-4 leading-relaxed">
          Tell O&apos;Toole how you trade. Bankroll, sizing rules, hard nos, market
          preferences. O&apos;Toole reads this on every chat — overrides generic defaults
          but never overrides safety caps or kill switch.
        </p>
        <textarea
          value={memory}
          onChange={(e) => {
            setMemory(e.target.value)
            setMemoryDirty(true)
            setMemorySaved(false)
          }}
          rows={6}
          maxLength={8000}
          disabled={loading}
          placeholder={
            loading
              ? 'Loading…'
              : 'e.g. I trade 10–35¢ longshots, $50 max per ticket, never crypto perps, prefer regulated venues.'
          }
          className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-900 leading-relaxed focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400/40 placeholder:text-stone-400 transition"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={saveMemory}
            disabled={!memoryDirty || memorySaving || loading}
            className="rounded-full bg-emerald-500 text-black font-semibold px-4 py-1.5 text-xs tracking-wider hover:bg-emerald-400 transition disabled:opacity-50"
          >
            {memorySaving ? 'SAVING…' : 'SAVE'}
          </button>
          {memorySaved && <span className="text-[11px] text-emerald-700">✓ saved</span>}
          <span className="text-[11px] text-stone-400 ml-auto tabular-nums">
            {memory.length} / 8000
          </span>
        </div>
      </section>

      {/* ── Knowledge ───────────────────────────────────────────────── */}
      <section
        id="memory"
        className="mb-6 rounded-lg bg-white ring-1 ring-stone-200 p-6 scroll-mt-8"
      >
        <SectionHeader icon="📚" title="Knowledge" status="LIVE" />
        <p className="text-sm text-stone-700 mb-5 leading-relaxed">
          External insights you want O&apos;Toole to draw on. Paste the text directly —
          tweets, repo READMEs, article paragraphs. Tag with a market keyword to scope
          when each source fires; leave blank to always include.
        </p>

        <div className="space-y-5">
          {KNOWLEDGE_KINDS.map((kind) => (
            <SourceSubsection
              key={kind}
              kind={kind}
              sources={byKind[kind]}
              loading={loading}
              onAdd={() => setAddingKind(kind)}
              onDelete={deleteSource}
            />
          ))}
        </div>
      </section>

      {/* ── Other ──────────────────────────────────────────────────── */}
      <section className="mb-10 rounded-lg bg-white ring-1 ring-stone-200 p-6">
        <SectionHeader icon="🗒" title="Other" status="LIVE" />
        <p className="text-sm text-stone-700 mb-5 leading-relaxed">
          Free-form notes that don&apos;t fit a tweet, repo, or article. Rules of thumb,
          observations, anything else worth O&apos;Toole knowing.
        </p>
        <SourceSubsection
          kind="note"
          sources={byKind.note}
          loading={loading}
          onAdd={() => setAddingKind('note')}
          onDelete={deleteSource}
          hideHeader
        />
      </section>

      {addingKind && (
        <AddSourceModal
          forceKind={addingKind}
          onClose={() => setAddingKind(null)}
          onAdded={onAdded}
        />
      )}
    </>
  )
}

function SectionHeader({
  icon,
  title,
  status,
}: {
  icon: string
  title: string
  status: string
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="text-2xl">{icon}</div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-[10px] tracking-widest text-emerald-700 font-semibold">
          {status}
        </div>
      </div>
    </div>
  )
}

function SourceSubsection({
  kind,
  sources,
  loading,
  onAdd,
  onDelete,
  hideHeader,
}: {
  kind: SourceKind
  sources: Source[]
  loading: boolean
  onAdd: () => void
  onDelete: (id: number) => void
  hideHeader?: boolean
}) {
  return (
    <div>
      {!hideHeader && (
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-[11px] tracking-wider text-stone-700 font-semibold">
            {KIND_LABEL[kind].toUpperCase()}
            <span className="ml-2 text-stone-400 font-normal tabular-nums">
              {sources.length}
            </span>
          </h3>
          <button
            type="button"
            onClick={onAdd}
            className="text-[11px] tracking-wider font-semibold text-emerald-700 hover:text-emerald-800"
          >
            + ADD {KIND_LABEL_SINGULAR[kind].toUpperCase()}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-[12px] text-stone-400 py-3">Loading…</div>
      ) : sources.length === 0 ? (
        <div className="rounded border border-dashed border-stone-300 px-3 py-4 text-center">
          <div className="text-[12px] text-stone-500 leading-snug">
            No {KIND_LABEL[kind].toLowerCase()} yet.
          </div>
          {hideHeader && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-2 text-[11px] tracking-wider font-semibold text-emerald-700 hover:text-emerald-800"
            >
              + ADD {KIND_LABEL_SINGULAR[kind].toUpperCase()}
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {sources.map((s) => (
            <li
              key={s.id}
              className="rounded border border-stone-200 bg-stone-50/50 px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-sm font-semibold text-stone-900 truncate flex-1">
                  {s.label}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  className="text-[11px] text-stone-400 hover:text-red-700 shrink-0"
                >
                  delete
                </button>
              </div>
              {s.marketFilter && (
                <div className="text-[11px] text-emerald-700 mb-1">
                  fires on: {s.marketFilter}
                </div>
              )}
              <div className="text-[12px] text-stone-700 leading-snug line-clamp-3 whitespace-pre-wrap">
                {s.content}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AddSourceModal({
  forceKind,
  onClose,
  onAdded,
}: {
  forceKind: SourceKind
  onClose: () => void
  onAdded: (s: Source) => void
}) {
  const [label, setLabel] = useState('')
  const [content, setContent] = useState('')
  const [marketFilter, setMarketFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const placeholders = KIND_PLACEHOLDER[forceKind]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/otoole/sources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: forceKind,
        label: label.trim(),
        content: content.trim(),
        marketFilter: marketFilter.trim() || null,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      source?: Source
      message?: string
    }
    setBusy(false)
    if (!res.ok || !data.ok || !data.source) {
      setError(data.message ?? 'Failed to save source.')
      return
    }
    onAdded(data.source)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white ring-1 ring-stone-200 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-stone-50">
          <div className="text-sm font-bold text-stone-900">
            Add {KIND_LABEL_SINGULAR[forceKind]}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-stone-500 hover:text-stone-900 text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[10px] tracking-wider text-stone-700 font-semibold mb-1">
              LABEL <span className="text-emerald-700">*</span>
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
              placeholder={placeholders.label}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-[10px] tracking-wider text-stone-700 font-semibold mb-1">
              CONTENT <span className="text-emerald-700">*</span>
              <span className="text-stone-400 normal-case font-normal"> · paste the text</span>
            </label>
            <textarea
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              maxLength={12_000}
              placeholder={placeholders.content}
              className={`${inputCls} font-mono text-[12px] leading-relaxed resize-y`}
            />
            <div className="text-[11px] text-stone-400 mt-1 text-right tabular-nums">
              {content.length} / 12000
            </div>
          </div>

          <div>
            <label className="block text-[10px] tracking-wider text-stone-700 font-semibold mb-1">
              MARKET FILTER
              <span className="text-stone-400 normal-case font-normal">
                {' '}· optional comma-separated keywords
              </span>
            </label>
            <input
              type="text"
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value)}
              maxLength={200}
              placeholder="e.g. NBA, Lakers, Trump, ETH"
              className={inputCls}
            />
            <p className="text-[11px] text-stone-500 mt-1 leading-snug">
              If set, this source only fires when O&apos;Toole sees one of these words in
              your message. Leave blank to always include.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-300 px-3 py-2 text-xs text-red-700 font-semibold">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-emerald-500 text-black font-semibold px-5 py-2 text-sm tracking-wider hover:bg-emerald-400 transition disabled:opacity-50"
            >
              {busy ? 'SAVING…' : 'SAVE'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="text-xs text-stone-500 hover:text-stone-900 ml-auto"
            >
              cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full bg-white border border-stone-300 text-stone-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400/40 placeholder:text-stone-400 transition'
