'use client'
import { useState } from 'react'

export function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // no-op — clipboard denied
    }
  }

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 bg-white border border-[#00703c]/40 px-4 py-3 text-sm text-stone-800 font-semibold overflow-x-auto whitespace-nowrap">
        {value}
      </div>
      <button
        type="button"
        onClick={copy}
        className="border border-[#00703c] bg-[#00703c] text-white px-4 py-3 text-xs tracking-wider hover:bg-[#004225] hover:border-[#004225] transition"
      >
        {copied ? 'COPIED' : 'COPY'}
      </button>
    </div>
  )
}
