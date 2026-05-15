'use client'

import { useState, useTransition } from 'react'
import {
  bulkFetchSourcesAction,
  createGlobalSourceAction,
} from './actions'
import type { GlobalSourceKind } from '@/lib/otoole-global-memory'

type FetchedRow = {
  url: string
  ok: true
  kind: GlobalSourceKind
  label: string
  content: string
  include: boolean
  status: 'ready' | 'creating' | 'created' | 'failed'
  statusMsg?: string
}
type ErrorRow = { url: string; ok: false; message: string }
type Row = FetchedRow | ErrorRow

const KIND_BADGE: Record<GlobalSourceKind, string> = {
  twitter: 'bg-sky-100 text-sky-800 ring-sky-300',
  github: 'bg-stone-100 text-stone-800 ring-stone-300',
  article: 'bg-violet-100 text-violet-800 ring-violet-300',
  note: 'bg-amber-100 text-amber-800 ring-amber-300',
}

export function BulkImportForm() {
  const [open, setOpen] = useState(false)
  const [urlsText, setUrlsText] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [fetching, startFetch] = useTransition()
  const [creating, startCreate] = useTransition()
  const [topMsg, setTopMsg] = useState<{ ok: boolean; message: string } | null>(
    null,
  )

  function reset() {
    setUrlsText('')
    setRows([])
    setTopMsg(null)
  }

  function toggleInclude(i: number) {
    setRows((prev) =>
      prev.map((r, j) =>
        j === i && r.ok && (r.status === 'ready' || r.status === 'failed')
          ? { ...r, include: !r.include }
          : r,
      ),
    )
  }

  function fetchAll() {
    setTopMsg(null)
    setRows([])
    const fd = new FormData()
    fd.set('urls', urlsText)
    startFetch(async () => {
      const r = await bulkFetchSourcesAction(fd)
      if (!r.ok) {
        setTopMsg(r)
        return
      }
      const newRows: Row[] = r.rows.map((row) =>
        row.ok
          ? {
              url: row.url,
              ok: true,
              kind: row.source.kind,
              label: row.source.label,
              content: row.source.content,
              include: true,
              status: 'ready',
            }
          : { url: row.url, ok: false, message: row.message },
      )
      setRows(newRows)
      const okCount = newRows.filter((rr) => rr.ok).length
      setTopMsg({
        ok: okCount > 0,
        message: `fetched ${okCount}/${newRows.length} ok · review and create`,
      })
    })
  }

  async function createCheckedFromSnapshot(
    snapshot: Row[],
  ): Promise<{ created: number; failed: number }> {
    let created = 0
    let failed = 0
    const indices: number[] = []
    snapshot.forEach((r, i) => {
      if (r.ok && r.include && r.status === 'ready') indices.push(i)
    })
    for (const i of indices) {
      const row = snapshot[i] as FetchedRow
      setRows((prev) =>
        prev.map((rr, j) =>
          j === i && rr.ok ? { ...rr, status: 'creating' } : rr,
        ),
      )
      const fd = new FormData()
      fd.set('kind', row.kind)
      fd.set('label', row.label)
      fd.set('content', row.content)
      fd.set('market_filter', '')
      const r = await createGlobalSourceAction(fd)
      if (r.ok) {
        created += 1
        setRows((prev) =>
          prev.map((rr, j) =>
            j === i && rr.ok
              ? { ...rr, status: 'created', statusMsg: r.message }
              : rr,
          ),
        )
      } else {
        failed += 1
        setRows((prev) =>
          prev.map((rr, j) =>
            j === i && rr.ok
              ? { ...rr, status: 'failed', statusMsg: r.message }
              : rr,
          ),
        )
      }
    }
    return { created, failed }
  }

  function createChecked() {
    const snapshot = rows
    const checkedReady = snapshot.filter(
      (r) => r.ok && r.include && r.status === 'ready',
    ).length
    if (checkedReady === 0) {
      setTopMsg({ ok: false, message: 'nothing checked / ready' })
      return
    }
    startCreate(async () => {
      const { created, failed } = await createCheckedFromSnapshot(snapshot)
      setTopMsg({
        ok: created > 0,
        message: `created ${created} · failed ${failed}`,
      })
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 tracking-wider border border-stone-400 text-stone-700 hover:bg-stone-50"
      >
        + BULK ADD
      </button>
    )
  }

  const readyCount = rows.filter(
    (r) => r.ok && r.include && r.status === 'ready',
  ).length

  return (
    <div className="border border-stone-300 bg-white p-4 space-y-3 w-full">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#004225] tracking-wider">
          {'>'} BULK ADD SOURCES{' '}
          <span className="text-stone-500 normal-case">
            (up to 10 URLs · fetched in parallel · created with empty filter — tune individually after)
          </span>
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

      <textarea
        value={urlsText}
        onChange={(e) => setUrlsText(e.target.value)}
        placeholder={'One URL per line, or comma-separated…\nhttps://x.com/handle/status/…\nhttps://example.com/article'}
        rows={5}
        className="w-full font-mono text-xs px-3 py-2 border border-stone-300 bg-stone-50"
        disabled={fetching || creating}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {topMsg ? (
          <span
            className={`text-[10px] px-2 py-1 border ${
              topMsg.ok
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {topMsg.message}
          </span>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fetchAll}
            disabled={fetching || creating || !urlsText.trim()}
            className="text-xs px-4 py-1.5 tracking-wider border border-[#00703c] text-[#00703c] hover:bg-emerald-50 disabled:opacity-50"
          >
            {fetching ? 'FETCHING…' : 'FETCH ALL'}
          </button>
          <button
            type="button"
            onClick={createChecked}
            disabled={fetching || creating || readyCount === 0}
            className="text-xs px-4 py-1.5 tracking-wider bg-[#00703c] text-white hover:bg-[#005a30] disabled:opacity-50"
          >
            {creating ? 'CREATING…' : `CREATE ${readyCount} CHECKED`}
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <BulkRow
              key={`${i}-${r.url}`}
              row={r}
              onToggle={() => toggleInclude(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BulkRow({ row, onToggle }: { row: Row; onToggle: () => void }) {
  const [openPreview, setOpenPreview] = useState(false)

  if (!row.ok) {
    return (
      <div className="border border-red-200 bg-red-50 px-3 py-2 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono truncate text-red-900 min-w-0 flex-1">
            {row.url}
          </span>
          <span className="text-red-700 shrink-0">✗ {row.message}</span>
        </div>
      </div>
    )
  }

  const statusBadge = (() => {
    switch (row.status) {
      case 'ready':
        return null
      case 'creating':
        return (
          <span className="text-[10px] tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-800 ring-1 ring-amber-300">
            CREATING…
          </span>
        )
      case 'created':
        return (
          <span className="text-[10px] tracking-wider px-1.5 py-0.5 bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300">
            CREATED
          </span>
        )
      case 'failed':
        return (
          <span className="text-[10px] tracking-wider px-1.5 py-0.5 bg-red-100 text-red-800 ring-1 ring-red-300">
            FAILED
          </span>
        )
    }
  })()

  return (
    <div
      className={`border border-stone-300 bg-white ${
        row.status === 'created' ? 'opacity-70' : ''
      }`}
    >
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
        <input
          type="checkbox"
          checked={row.include}
          onChange={onToggle}
          disabled={row.status === 'created' || row.status === 'creating'}
          className="cursor-pointer"
        />
        <span
          className={`text-[10px] tracking-wider px-1.5 py-0.5 ring-1 ${KIND_BADGE[row.kind]}`}
        >
          {row.kind.toUpperCase()}
        </span>
        <span className="font-semibold text-stone-900 text-sm truncate flex-1 min-w-0">
          {row.label}
        </span>
        {statusBadge}
        <button
          type="button"
          onClick={() => setOpenPreview((o) => !o)}
          className="text-xs px-2 py-0.5 tracking-wider border border-stone-300 hover:bg-stone-50"
        >
          {openPreview ? 'HIDE' : 'PREVIEW'}
        </button>
      </div>
      <div className="px-3 pb-1 text-[10px] text-stone-500 font-mono truncate">
        {row.url}
      </div>
      {row.statusMsg && (
        <div
          className={`px-3 py-1 text-[10px] border-t ${
            row.status === 'failed'
              ? 'bg-red-50 text-red-800 border-red-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          {row.statusMsg}
        </div>
      )}
      {openPreview && (
        <div className="px-3 py-2 border-t border-stone-200 bg-stone-50">
          <pre className="font-mono text-[11px] text-stone-800 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
            {row.content}
          </pre>
        </div>
      )}
    </div>
  )
}
