'use client'

import { useState } from 'react'

export function CopyLinkDark({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 bg-black/50 border border-emerald-400/40 text-emerald-300 px-3 py-2 text-xs font-mono overflow-x-auto whitespace-nowrap">
        {value}
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            // clipboard denied — no-op
          }
        }}
        className="border border-emerald-400 bg-emerald-500 text-black text-xs px-3 py-2 font-semibold tracking-wider hover:bg-emerald-400 transition"
      >
        {copied ? 'COPIED' : 'COPY'}
      </button>
    </div>
  )
}
