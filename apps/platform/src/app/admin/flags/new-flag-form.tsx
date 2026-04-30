'use client'

import { useState, useTransition } from 'react'
import { setFlagAction } from './actions'

// Inline form for creating a new feature flag. Uses the same setFlagAction
// as toggling — upsert handles "doesn't exist yet" cleanly. Two-step
// confirm not needed here: creating a flag at FALSE is harmless, and
// flipping it on after is the dangerous step (handled by FlagRow).

export function NewFlagForm() {
  const [pending, startTransition] = useTransition()
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [value, setValue] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!key.trim()) return
    const fd = new FormData()
    fd.set('key', key.trim())
    fd.set('value', value ? '1' : '0')
    if (description.trim()) fd.set('description', description.trim())
    startTransition(async () => {
      const r = await setFlagAction(fd)
      setResult(r)
      if (r.ok) {
        setKey('')
        setDescription('')
        setValue(false)
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-2 border border-stone-300 bg-white p-4">
      <div className="text-xs text-stone-500 tracking-wider">{'>'} NEW FLAG</div>
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto_auto] gap-2 items-start">
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="snake_case_key"
          required
          pattern="[a-z][a-z0-9_]{1,63}"
          title="lowercase letters, digits, underscores; 2-64 chars; must start with a letter"
          className="border border-stone-300 px-3 py-1.5 text-sm font-mono"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="what does this flag do?"
          className="border border-stone-300 px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer select-none px-2">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => setValue(e.target.checked)}
            className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-400/40"
          />
          <span>start ON</span>
        </label>
        <button
          type="submit"
          disabled={pending || !key.trim()}
          className="bg-[#00703c] text-white text-xs px-4 py-1.5 tracking-wider hover:bg-[#005a30] disabled:opacity-50"
        >
          {pending ? 'CREATING…' : 'CREATE'}
        </button>
      </div>
      {result && (
        <div
          className={`text-xs px-3 py-1.5 inline-block ${
            result.ok
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {result.message}
        </div>
      )}
    </form>
  )
}
