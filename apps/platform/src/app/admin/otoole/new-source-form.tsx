'use client'

import { useState, useTransition } from 'react'
import { createGlobalSourceAction } from './actions'

const KINDS = ['twitter', 'github', 'article', 'note'] as const

export function NewSourceForm() {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<(typeof KINDS)[number]>('note')
  const [label, setLabel] = useState('')
  const [content, setContent] = useState('')
  const [filter, setFilter] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  )

  function reset() {
    setKind('note')
    setLabel('')
    setContent('')
    setFilter('')
    setResult(null)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('kind', kind)
    fd.set('label', label)
    fd.set('content', content)
    fd.set('market_filter', filter)
    startTransition(async () => {
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

      <label className="block">
        <span className="block text-[10px] text-stone-500 tracking-wider mb-1">
          MARKET FILTER <span className="text-stone-400">(optional, comma-separated keywords — empty = always fire)</span>
        </span>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          maxLength={500}
          placeholder="e.g. NFL, injury, hamstring"
          className="w-full text-xs px-2 py-1.5 font-mono border border-stone-300 bg-white"
        />
      </label>

      <div className="flex items-center justify-between">
        {result && !result.ok ? (
          <span className="text-[10px] px-2 py-1 bg-red-50 text-red-800 border border-red-200">
            {result.message}
          </span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="text-xs px-4 py-1.5 tracking-wider bg-[#00703c] text-white hover:bg-[#005a30] disabled:opacity-50"
        >
          {pending ? 'CREATING…' : 'CREATE SOURCE'}
        </button>
      </div>
    </form>
  )
}
