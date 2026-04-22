'use client'

import { useState } from 'react'

type Existing = {
  keyPreview: string
  verifiedAt: string | null
  lastUsedAt: string | null
  label: string | null
}

export function ApiKeysEditor({
  provider,
  name,
  keyFormat,
  getKeyUrl,
  note,
  modelNames,
  existing,
}: {
  provider: string
  name: string
  keyFormat: string
  getKeyUrl: string
  note: string
  modelNames: string[]
  existing: Existing | null
}) {
  const [editing, setEditing] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [label, setLabel] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)

  async function onSave(verify: boolean) {
    if (!apiKey || apiKey.length < 10) {
      setMessage({ kind: 'error', text: 'Key looks too short. Expected format: ' + keyFormat })
      return
    }
    setPending(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, label: label || undefined, verify }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        verified?: boolean
        verificationError?: string
        error?: string
      }
      if (!res.ok || !data.ok) {
        setMessage({ kind: 'error', text: data.error ?? `HTTP ${res.status}` })
        setPending(false)
        return
      }
      if (verify && !data.verified) {
        setMessage({
          kind: 'error',
          text: `Saved, but verification failed: ${data.verificationError ?? 'unknown error'}. Check the key and try again.`,
        })
        setPending(false)
        return
      }
      setMessage({
        kind: 'success',
        text: verify ? 'Saved & verified. You can now use this provider.' : 'Saved. Click Verify to confirm it works.',
      })
      setApiKey('')
      setLabel('')
      setEditing(false)
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Request failed',
      })
      setPending(false)
    }
  }

  async function onDelete() {
    if (!confirm(`Delete your ${name} key? Future chats with ${name} models will fall back to Sneakers credits.`)) {
      return
    }
    setPending(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/settings/api-keys?provider=${provider}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessage({ kind: 'error', text: (data as { error?: string }).error ?? `HTTP ${res.status}` })
        setPending(false)
        return
      }
      setMessage({ kind: 'info', text: 'Deleted. Page will refresh.' })
      setTimeout(() => window.location.reload(), 500)
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Delete failed' })
      setPending(false)
    }
  }

  return (
    <div className="rounded-lg bg-white ring-1 ring-stone-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold text-stone-900">{name}</h3>
            {existing ? (
              <span className="text-[10px] tracking-wider rounded-full ring-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 ring-emerald-300">
                KEY ON FILE
              </span>
            ) : (
              <span className="text-[10px] tracking-wider rounded-full ring-1 px-2 py-0.5 bg-stone-100 text-stone-600 ring-stone-300">
                NOT SET
              </span>
            )}
            {existing?.verifiedAt && (
              <span className="text-[10px] tracking-wider rounded-full ring-1 px-2 py-0.5 bg-blue-50 text-blue-700 ring-blue-300">
                ✓ VERIFIED
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-1">{note}</p>
          <p className="text-[11px] text-stone-400 mt-1">
            Models unlocked: {modelNames.join(', ')}
          </p>
        </div>
        <a
          href={getKeyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#004225] hover:underline whitespace-nowrap"
        >
          Get key →
        </a>
      </div>

      {existing && !editing && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100">
          <div className="text-xs text-stone-600">
            <div className="font-mono">{existing.keyPreview}</div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {existing.lastUsedAt
                ? `Last used ${new Date(existing.lastUsedAt).toLocaleDateString()}`
                : 'Not used yet'}
              {existing.label ? ` · ${existing.label}` : ''}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-[#004225] hover:underline"
            >
              Replace
            </button>
            <button
              onClick={onDelete}
              disabled={pending}
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {(editing || !existing) && (
        <div className="mt-3 space-y-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`Paste your ${name} key (${keyFormat})`}
            className="w-full text-sm rounded ring-1 ring-stone-300 px-3 py-2 bg-stone-50 focus:outline-none focus:ring-emerald-400 font-mono"
            autoComplete="off"
            spellCheck={false}
          />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional, e.g. 'personal' or 'team')"
            className="w-full text-xs rounded ring-1 ring-stone-300 px-3 py-2 focus:outline-none focus:ring-emerald-400"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSave(true)}
              disabled={pending || !apiKey}
              className="text-xs font-semibold rounded bg-[#004225] hover:bg-[#00703c] text-white py-2 px-4 transition disabled:opacity-60"
            >
              {pending ? 'Verifying…' : 'Save & verify'}
            </button>
            <button
              onClick={() => onSave(false)}
              disabled={pending || !apiKey}
              className="text-xs rounded ring-1 ring-stone-300 text-stone-700 py-2 px-4 hover:bg-stone-50 disabled:opacity-60"
            >
              Save without verify
            </button>
            {editing && (
              <button
                onClick={() => {
                  setEditing(false)
                  setApiKey('')
                  setLabel('')
                  setMessage(null)
                }}
                className="text-xs text-stone-500 hover:text-stone-700"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {message && (
        <div
          className={`mt-3 text-xs rounded px-3 py-2 ${
            message.kind === 'success'
              ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
              : message.kind === 'error'
                ? 'bg-red-50 text-red-900 ring-1 ring-red-200'
                : 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}
