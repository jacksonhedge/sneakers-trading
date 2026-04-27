'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Real search input for the dashboard topbar. Replaces the previous
// `<div>` placeholder that looked like a search field but had no <input>
// behind it — clicks did nothing, no `/` hotkey, no submission.
//
// Behavior:
//   - Type a query, hit Enter → routes to /markets?q=<query>
//   - `/` anywhere on the page (when no other input has focus) focuses
//     the search box. Same Bloomberg/Notion-style hotkey users expect.
//   - Cmd/Ctrl-K also focuses (matches the "command bar" idiom).
//   - Esc unfocuses + clears.

export function DashboardSearchBox() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack the key when the user is already typing in an input,
      // textarea, or contenteditable element.
      const t = e.target as HTMLElement | null
      const tag = t?.tagName?.toLowerCase()
      const inField = tag === 'input' || tag === 'textarea' || t?.isContentEditable
      if (inField) return

      if (e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = q.trim()
    if (!trimmed) return
    router.push(`/markets?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form onSubmit={submit} className="flex-1 max-w-xl">
      <div className="flex items-center gap-2 bg-stone-100 rounded-full px-4 py-2 text-sm text-stone-700 hover:bg-stone-200/60 focus-within:bg-white focus-within:ring-1 focus-within:ring-emerald-400/50 transition">
        <span className="text-base shrink-0" aria-hidden>⌕</span>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQ('')
              inputRef.current?.blur()
            }
          }}
          placeholder="Search markets, events, outcomes…"
          className="flex-1 bg-transparent outline-none placeholder:text-stone-500"
          aria-label="Search markets"
        />
        <span className="text-[10px] text-stone-800 bg-white rounded px-1.5 py-0.5 ring-1 ring-stone-200 font-mono shrink-0">
          /
        </span>
      </div>
    </form>
  )
}
