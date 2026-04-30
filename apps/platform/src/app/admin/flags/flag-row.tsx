'use client'

import { useState, useTransition } from 'react'
import { setFlagAction } from './actions'

// Inline toggle for a single feature flag. Two-step confirm pattern: click
// to arm, click again to commit. Cancel reverts. Result message renders
// below the row.

export function FlagRow({
  flagKey,
  initialValue,
  description,
  updatedAt,
  updatedBy,
}: {
  flagKey: string
  initialValue: boolean
  description: string | null
  updatedAt: string | null
  updatedBy: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [armed, setArmed] = useState(false)
  const [value, setValue] = useState(initialValue)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function arm() {
    setResult(null)
    setArmed(true)
  }

  function commit() {
    const newValue = !value
    const fd = new FormData()
    fd.set('key', flagKey)
    fd.set('value', newValue ? '1' : '0')
    if (description) fd.set('description', description)
    startTransition(async () => {
      const r = await setFlagAction(fd)
      setResult(r)
      if (r.ok) setValue(newValue)
      setArmed(false)
    })
  }

  return (
    <tr className="border-t border-stone-200 align-top">
      <td className="px-3 py-3 font-mono text-stone-900 whitespace-nowrap">{flagKey}</td>
      <td className="px-3 py-3 text-stone-600 max-w-md">{description ?? '—'}</td>
      <td className="px-3 py-3">
        <span
          className={`inline-block px-2 py-0.5 text-[10px] tracking-wider ring-1 ${
            value
              ? 'bg-emerald-100 text-emerald-800 ring-emerald-300'
              : 'bg-stone-200 text-stone-700 ring-stone-300'
          }`}
        >
          {value ? 'TRUE' : 'FALSE'}
        </span>
      </td>
      <td className="px-3 py-3 text-stone-500 text-[10px] whitespace-nowrap">
        {updatedAt ? new Date(updatedAt).toISOString().slice(0, 10) : '—'}
        {updatedBy && <div className="font-mono text-stone-400">{updatedBy}</div>}
      </td>
      <td className="px-3 py-3 text-right">
        {!armed ? (
          <button
            type="button"
            disabled={pending}
            onClick={arm}
            className="text-xs px-3 py-1.5 tracking-wider border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-50"
          >
            FLIP TO {value ? 'FALSE' : 'TRUE'}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 text-xs">
            <button
              type="button"
              disabled={pending}
              onClick={commit}
              className={`px-3 py-1.5 tracking-wider text-white disabled:opacity-50 ${
                value ? 'bg-red-700 hover:bg-red-800' : 'bg-[#00703c] hover:bg-[#005a30]'
              }`}
            >
              {pending ? 'WORKING…' : `CONFIRM → ${value ? 'FALSE' : 'TRUE'}`}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setArmed(false)}
              className="text-stone-500 hover:underline"
            >
              cancel
            </button>
          </span>
        )}
        {result && (
          <div
            className={`mt-2 inline-block text-[10px] px-2 py-1 ${
              result.ok
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {result.message}
          </div>
        )}
      </td>
    </tr>
  )
}
