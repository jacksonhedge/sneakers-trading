'use client'

import { useState, useTransition } from 'react'
import {
  deleteGlobalSourceAction,
  setGlobalSourceEnabledAction,
} from './actions'
import type { GlobalSource } from '@/lib/otoole-global-memory'

const KIND_BADGE: Record<GlobalSource['kind'], string> = {
  twitter: 'bg-sky-100 text-sky-800 ring-sky-300',
  github: 'bg-stone-100 text-stone-800 ring-stone-300',
  article: 'bg-violet-100 text-violet-800 ring-violet-300',
  note: 'bg-amber-100 text-amber-800 ring-amber-300',
}

export function SourceRow({ source }: { source: GlobalSource }) {
  const [pending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(source.enabled)
  const [armDelete, setArmDelete] = useState(false)
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  )

  function toggleEnabled() {
    const next = !enabled
    const fd = new FormData()
    fd.set('id', String(source.id))
    fd.set('enabled', next ? '1' : '0')
    startTransition(async () => {
      const r = await setGlobalSourceEnabledAction(fd)
      setResult(r)
      if (r.ok) setEnabled(next)
    })
  }

  function commitDelete() {
    const fd = new FormData()
    fd.set('id', String(source.id))
    startTransition(async () => {
      const r = await deleteGlobalSourceAction(fd)
      setResult(r)
      // server-action revalidate will refresh the list; row vanishes
      setArmDelete(false)
    })
  }

  return (
    <div className="border border-stone-300 bg-white">
      <div className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={`text-[10px] tracking-wider px-1.5 py-0.5 ring-1 ${KIND_BADGE[source.kind]}`}
          >
            {source.kind.toUpperCase()}
          </span>
          <span className="font-semibold text-stone-900 text-sm truncate">
            {source.label}
          </span>
          <span
            className={`text-[10px] tracking-wider px-1.5 py-0.5 ring-1 ${
              enabled
                ? 'bg-emerald-100 text-emerald-800 ring-emerald-300'
                : 'bg-stone-200 text-stone-600 ring-stone-300'
            }`}
          >
            {enabled ? 'ON' : 'OFF'}
          </span>
          {source.market_filter && (
            <span className="text-[10px] text-stone-500 font-mono truncate">
              filter: {source.market_filter}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="px-2 py-1 tracking-wider border border-stone-300 hover:bg-stone-50"
          >
            {open ? 'HIDE' : 'VIEW'}
          </button>
          <button
            type="button"
            onClick={toggleEnabled}
            disabled={pending}
            className="px-2 py-1 tracking-wider border border-stone-300 hover:bg-stone-50 disabled:opacity-50"
          >
            {enabled ? 'DISABLE' : 'ENABLE'}
          </button>
          {!armDelete ? (
            <button
              type="button"
              onClick={() => setArmDelete(true)}
              disabled={pending}
              className="px-2 py-1 tracking-wider text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50"
            >
              DELETE
            </button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={commitDelete}
                disabled={pending}
                className="px-2 py-1 tracking-wider bg-red-700 text-white hover:bg-red-800 disabled:opacity-50"
              >
                {pending ? 'WORKING…' : 'CONFIRM DELETE'}
              </button>
              <button
                type="button"
                onClick={() => setArmDelete(false)}
                disabled={pending}
                className="text-stone-500 hover:underline"
              >
                cancel
              </button>
            </span>
          )}
        </div>
      </div>

      {result && (
        <div
          className={`px-3 py-1 text-[10px] border-t ${
            result.ok
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {result.message}
        </div>
      )}

      {open && (
        <div className="px-3 py-2 border-t border-stone-200 bg-stone-50">
          <pre className="font-mono text-[11px] text-stone-800 whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
            {source.content}
          </pre>
          <div className="mt-2 text-[10px] text-stone-500 flex items-center gap-3">
            <span>id #{source.id}</span>
            <span>created {new Date(source.created_at).toISOString().slice(0, 10)}</span>
            {source.updated_by && <span>by {source.updated_by}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
