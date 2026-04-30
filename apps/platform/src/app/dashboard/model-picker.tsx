'use client'

import { useEffect, useRef, useState } from 'react'
import { AI_MODELS, type AIModelId, type AIProvider } from '@/lib/ai-models'

// Compact model picker for the OToole chat panel. Click → dropdown
// grouped by provider (Anthropic / OpenAI / Google / xAI), with
// disabled rows for models whose enabled=false in the catalog. Saves
// selection in localStorage so it persists across sessions; default
// is Claude Sonnet 4.6 (the marketing default per the persona prompt).

const STORAGE_KEY = 'sneakers.otoole.model'

const PROVIDER_LABEL: Record<AIProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  xai: 'xAI',
}

const PROVIDER_ORDER: AIProvider[] = ['anthropic', 'openai', 'google', 'xai']

export function ModelPicker({
  selected,
  onChange,
}: {
  selected: AIModelId
  onChange: (id: AIModelId) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = AI_MODELS.find((m) => m.id === selected)

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 transition rounded-full px-2.5 py-1"
        title={current?.tagline ?? ''}
      >
        <span aria-hidden>⚡</span>
        <span className="truncate max-w-[140px]">
          {current?.displayName ?? selected}
        </span>
        <span className="text-stone-400 text-[10px]">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Model"
          className="absolute right-0 bottom-full mb-2 w-72 bg-white ring-1 ring-stone-200 rounded-xl shadow-xl overflow-hidden z-50 max-h-[60vh] overflow-y-auto"
        >
          {PROVIDER_ORDER.map((prov) => {
            const models = AI_MODELS.filter((m) => m.provider === prov)
            if (models.length === 0) return null
            return (
              <div key={prov} className="border-b border-stone-100 last:border-b-0">
                <div className="px-3 pt-2 pb-1 text-[10px] tracking-wider text-stone-500 font-semibold">
                  {PROVIDER_LABEL[prov].toUpperCase()}
                </div>
                {models.map((m) => {
                  const isSel = m.id === selected
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      disabled={!m.enabled}
                      onClick={() => {
                        if (!m.enabled) return
                        onChange(m.id)
                        setOpen(false)
                      }}
                      className={`w-full text-left px-3 py-2 transition ${
                        isSel
                          ? 'bg-emerald-50'
                          : m.enabled
                            ? 'hover:bg-stone-50'
                            : 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isSel && <span className="text-emerald-600 text-xs">✓</span>}
                          <span className="text-sm font-semibold text-stone-900 truncate">
                            {m.displayName}
                          </span>
                        </div>
                        {!m.enabled && (
                          <span className="text-[9px] tracking-wider text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-full px-1.5 py-0.5 shrink-0">
                            SOON
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-500 mt-0.5 line-clamp-1">
                        {m.tagline}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-stone-400">
                        <span>{m.creditCostPerMessage} credits/msg</span>
                        <span>·</span>
                        <span className="uppercase tracking-wider">{m.minTier}+</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function loadStoredModel(fallback: AIModelId): AIModelId {
  if (typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v && AI_MODELS.some((m) => m.id === v && m.enabled)) {
      return v as AIModelId
    }
  } catch {
    // localStorage disabled / private mode — fall through.
  }
  return fallback
}

export function saveStoredModel(id: AIModelId) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // ignore
  }
}
