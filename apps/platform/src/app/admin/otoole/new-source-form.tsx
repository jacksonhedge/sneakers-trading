'use client'

import { useState, useTransition } from 'react'
import {
  createGlobalSourceAction,
  fetchSourceFromUrlAction,
  suggestFilterKeywordsAction,
} from './actions'

const KINDS = ['twitter', 'github', 'article', 'note'] as const

export function NewSourceForm() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<(typeof KINDS)[number]>('note')
  const [label, setLabel] = useState('')
  const [content, setContent] = useState('')
  const [filter, setFilter] = useState('')
  const [creating, startCreate] = useTransition()
  const [fetching, startFetch] = useTransition()
  const [suggesting, startSuggest] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  )

  function reset() {
    setUrl('')
    setKind('note')
    setLabel('')
    setContent('')
    setFilter('')
    setResult(null)
  }

  function fetchUrl() {
    const trimmed = url.trim()
    if (!trimmed) {
      setResult({ ok: false, message: 'url required' })
      return
    }
    setResult(null)
    const fd = new FormData()
    fd.set('url', trimmed)
    startFetch(async () => {
      const r = await fetchSourceFromUrlAction(fd)
      if (r.ok) {
        setKind(r.source.kind)
        setLabel(r.source.label)
        setContent(r.source.content)
        setResult({
          ok: true,
          message: `fetched · ${r.source.kind} · ${r.source.content.length} chars · review and submit`,
        })
      } else {
        setResult(r)
      }
    })
  }

  function suggestKeywords() {
    if (!label.trim() && !content.trim()) {
      setResult({ ok: false, message: 'add a label or content first' })
      return
    }
    setResult(null)
    const fd = new FormData()
    fd.set('label', label)
    fd.set('content', content)
    startSuggest(async () => {
      const r = await suggestFilterKeywordsAction(fd)
      if (!r.ok) {
        setResult(r)
        return
      }
      const existing = filter
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
      const merged = [...existing]
      let added = 0
      for (const k of r.keywords) {
        if (!merged.includes(k)) {
          merged.push(k)
          added += 1
        }
      }
      setFilter(merged.join(', '))
      setResult({
        ok: true,
        message: added
          ? `suggested ${r.keywords.length} · added ${added} new`
          : `suggested ${r.keywords.length} · all already present`,
      })
    })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('kind', kind)
    fd.set('label', label)
    fd.set('content', content)
    fd.set('market_filter', filter)
    startCreate(async () => {
      const r = await createGlobalSourceAction(fd)
      setResult(r)
      if (r.ok) {
        reset()
        setOpen(false)
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 tracking-wider border border-[#00703c] text-[#00703c] hover:bg-emerald-50"
      >
        + ADD SOURCE
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="border border-stone-300 bg-white p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#004225] tracking-wider">
          {'>'} NEW GLOBAL SOURCE
        </span>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          className="text-[11px] text-stone-500 hover:underline"
        >
          cancel
        </button>
      </div>

      <div className="border border-dashed border-stone-300 bg-stone-50 p-3 space-y-2">
        <div className="text-[10px] text-stone-500 tracking-wider">
          FETCH FROM URL{' '}
          <span className="text-stone-400 normal-case">
            (twitter/x · github · articles — powered by r.jina.ai · fills the fields below; review & submit)
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://x.com/handle/status/… or https://example.com/article"
            className="flex-1 text-xs px-2 py-1.5 font-mono border border-stone-300 bg-white"
            disabled={fetching}
          />
          <button
            type="button"
            onClick={fetchUrl}
            disabled={fetching || !url.trim()}
            className="text-xs px-4 py-1.5 tracking-wider border border-[#00703c] text-[#00703c] hover:bg-emerald-50 disabled:opacity-50"
          >
            {fetching ? 'FETCHING…' : 'FETCH'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
        <label className="block">
          <span className="block text-[10px] text-stone-500 tracking-wider mb-1">KIND</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
            className="w-full text-xs px-2 py-1.5 border border-stone-300 bg-white"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] text-stone-500 tracking-wider mb-1">
            LABEL <span className="text-stone-400">(short title)</span>
          </span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. NFL injury heuristic — @balmertimebets"
            maxLength={200}
            className="w-full text-xs px-2 py-1.5 border border-stone-300 bg-white"
          />
        </label>
      </div>

      <label className="block">
        <span className="block text-[10px] text-stone-500 tracking-wider mb-1">
          CONTENT <span className="text-stone-400">(snippet text)</span>
        </span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={16384}
          placeholder="Paste the tweet, README excerpt, or article paragraph…"
          className="w-full min-h-[140px] font-mono text-xs px-3 py-2 border border-stone-300 bg-stone-50"
        />
      </label>

      <div className="block">
        <div className="flex items-end justify-between mb-1 gap-2">
          <span className="block text-[10px] text-stone-500 tracking-wider">
            MARKET FILTER <span className="text-stone-400">(optional, comma-separated keywords — empty = always fire)</span>
          </span>
          <button
            type="button"
            onClick={suggestKeywords}
            disabled={suggesting || (!label.trim() && !content.trim())}
            className="text-[10px] px-2 py-0.5 tracking-wider border border-[#00703c] text-[#00703c] hover:bg-emerald-50 disabled:opacity-50"
            title="Use Claude to suggest keywords from label + content"
          >
            {suggesting ? 'SUGGESTING…' : '✨ SUGGEST'}
          </button>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          maxLength={500}
          placeholder="e.g. NFL, injury, hamstring"
          className="w-full text-xs px-2 py-1.5 font-mono border border-stone-300 bg-white"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        {result ? (
          <span
            className={`text-[10px] px-2 py-1 border ${
              result.ok
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {result.message}
          </span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={creating || fetching || suggesting}
          className="text-xs px-4 py-1.5 tracking-wider bg-[#00703c] text-white hover:bg-[#005a30] disabled:opacity-50"
        >
          {creating ? 'CREATING…' : 'CREATE SOURCE'}
        </button>
      </div>
    </form>
  )
}
