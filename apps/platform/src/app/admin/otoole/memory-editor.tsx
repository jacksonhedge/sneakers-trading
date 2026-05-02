'use client'

import { useState, useTransition } from 'react'
import { saveGlobalMemoryAction } from './actions'

export function MemoryEditor({
  initial,
}: {
  initial: {
    persona_addendum: string
    content: string
    enabled: boolean
    updated_at: string | null
    updated_by: string | null
  }
}) {
  const [persona, setPersona] = useState(initial.persona_addendum)
  const [content, setContent] = useState(initial.content)
  const [enabled, setEnabled] = useState(initial.enabled)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  )

  const dirty =
    persona !== initial.persona_addendum ||
    content !== initial.content ||
    enabled !== initial.enabled

  function submit() {
    const fd = new FormData()
    fd.set('persona_addendum', persona)
    fd.set('content', content)
    fd.set('enabled', enabled ? '1' : '0')
    startTransition(async () => {
      const r = await saveGlobalMemoryAction(fd)
      setResult(r)
    })
  }

  return (
    <div className="border border-stone-300 bg-white">
      <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-[#00703c]"
            />
            <span className="font-semibold text-stone-800 tracking-wider">
              {enabled ? 'INJECTING INTO EVERY CHAT' : 'DISABLED'}
            </span>
          </label>
          <span className="text-[10px] text-stone-500">
            {initial.updated_at
              ? `last saved ${new Date(initial.updated_at).toISOString().slice(0, 16).replace('T', ' ')} UTC`
              : 'never saved'}
            {initial.updated_by && ` · by ${initial.updated_by}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {result && (
            <span
              className={`text-[10px] px-2 py-1 ${
                result.ok
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {result.message}
            </span>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={pending || !dirty}
            className="text-xs px-4 py-1.5 tracking-wider bg-[#00703c] text-white hover:bg-[#005a30] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? 'SAVING…' : dirty ? 'SAVE' : 'SAVED'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-stone-200">
        <div className="p-4">
          <label className="block">
            <span className="block text-xs text-[#004225] tracking-wider mb-1">
              {'>'} PERSONA ADDENDUM
            </span>
            <span className="block text-[11px] text-stone-500 mb-2">
              Operator-level instructions appended to O&apos;Toole&apos;s system prompt.
              Use for rules and behavior shaping (&ldquo;default to longshot 10–35¢ band
              when no market specified&rdquo;), not facts.
            </span>
            <textarea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="e.g. When proposing trades without an explicit market, default to the 10–35¢ longshot band. Always remind users that prediction markets carry liquidity risk."
              className="w-full min-h-[260px] font-mono text-xs px-3 py-2 border border-stone-300 bg-stone-50 text-stone-900 focus:outline-none focus:border-[#00703c]"
            />
            <span className="block text-[10px] text-stone-400 mt-1 text-right">
              {persona.length.toLocaleString()} / 8,192 chars
            </span>
          </label>
        </div>

        <div className="p-4">
          <label className="block">
            <span className="block text-xs text-[#004225] tracking-wider mb-1">
              {'>'} BASELINE MEMORY / STRATEGY
            </span>
            <span className="block text-[11px] text-stone-500 mb-2">
              Bot-wide knowledge O&apos;Toole always has access to. Facts, principles,
              strategy notes. Users layer their own &ldquo;how I trade&rdquo; on top.
            </span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. Sneakers Terminal aggregates prices across prediction markets (Kalshi, Polymarket), sportsbooks, DFS pick'em, and sweeps. Prefer prediction markets for binary contracts because…"
              className="w-full min-h-[260px] font-mono text-xs px-3 py-2 border border-stone-300 bg-stone-50 text-stone-900 focus:outline-none focus:border-[#00703c]"
            />
            <span className="block text-[10px] text-stone-400 mt-1 text-right">
              {content.length.toLocaleString()} / 32,768 chars
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}
