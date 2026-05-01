'use client'

import { useState, useTransition } from 'react'
import { broadcastAction } from './actions'

type Group = 'all' | 'invited' | 'authed' | 'waitlist' | 'custom'

const GROUP_LABEL: Record<Group, string> = {
  all: 'Everyone — waitlist + invited + authed (capped at 500)',
  invited: 'Invited (has unburned code, hasn’t signed in)',
  authed: 'Authed (has signed in)',
  waitlist: 'Waitlist only (no code yet, hasn’t signed in)',
  custom: 'Custom list (paste emails below)',
}

type PreviewState = {
  recipientCount: number
  sample: string[]
  message: string
} | null

export function BroadcastComposer() {
  const [pending, startTransition] = useTransition()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [group, setGroup] = useState<Group>('invited')
  const [custom, setCustom] = useState('')
  const [preview, setPreview] = useState<PreviewState>(null)
  const [error, setError] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [armed, setArmed] = useState(false)

  function buildFormData(mode: 'preview' | 'send'): FormData {
    const fd = new FormData()
    fd.set('mode', mode)
    fd.set('subject', subject)
    fd.set('body', body)
    fd.set('group', group)
    if (group === 'custom') fd.set('custom', custom)
    return fd
  }

  function runPreview() {
    setError(null)
    setSendResult(null)
    setArmed(false)
    startTransition(async () => {
      const r = await broadcastAction(buildFormData('preview'))
      if (!r.ok) {
        setError(r.message)
        setPreview(null)
        return
      }
      setPreview({ recipientCount: r.recipientCount, sample: r.sample, message: r.message })
    })
  }

  function runSend() {
    setError(null)
    setSendResult(null)
    startTransition(async () => {
      const r = await broadcastAction(buildFormData('send'))
      if (!r.ok) {
        setError(r.message)
        setArmed(false)
        return
      }
      setSendResult({ ok: true, message: r.message })
      setArmed(false)
      // Clear the form after a successful send so a misclick can't re-fire.
      setSubject('')
      setBody('')
      setCustom('')
      setPreview(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="subject"
          maxLength={200}
          className="border border-stone-300 px-3 py-2 text-sm"
        />
        <div className="text-[10px] text-stone-500 self-center text-right">
          {subject.length}/200
        </div>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Plain text body. Two newlines = paragraph break. HTML version is auto-generated."
        rows={10}
        className="w-full border border-stone-300 px-3 py-2 text-sm font-mono"
      />

      <fieldset className="space-y-2 border border-stone-300 bg-white p-3">
        <legend className="px-2 text-xs text-stone-500 tracking-wider">RECIPIENTS</legend>
        {(Object.keys(GROUP_LABEL) as Group[]).map((g) => (
          <label key={g} className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="group"
              value={g}
              checked={group === g}
              onChange={() => {
                setGroup(g)
                setPreview(null)
                setArmed(false)
              }}
              className="mt-1"
            />
            <span>{GROUP_LABEL[g]}</span>
          </label>
        ))}
        {group === 'custom' && (
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="emails separated by commas, spaces, or newlines"
            rows={4}
            className="w-full border border-stone-300 px-3 py-2 text-xs font-mono mt-2"
          />
        )}
      </fieldset>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={runPreview}
          disabled={pending || !subject.trim() || !body.trim()}
          className="bg-white border border-stone-300 text-stone-700 text-xs px-4 py-2 tracking-wider hover:bg-stone-50 disabled:opacity-50"
        >
          {pending && !armed ? 'PREVIEWING…' : 'PREVIEW RECIPIENTS'}
        </button>
        {preview && !armed && (
          <button
            type="button"
            onClick={() => {
              setSendResult(null)
              setArmed(true)
            }}
            disabled={pending}
            className="bg-[#00703c] text-white text-xs px-4 py-2 tracking-wider hover:bg-[#005a30] disabled:opacity-50"
          >
            SEND TO {preview.recipientCount}
          </button>
        )}
        {armed && (
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={runSend}
              disabled={pending}
              className="bg-red-700 text-white text-xs px-4 py-2 tracking-wider hover:bg-red-800 disabled:opacity-50"
            >
              {pending ? 'SENDING…' : `CONFIRM SEND TO ${preview!.recipientCount}`}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              disabled={pending}
              className="text-xs text-stone-500 hover:underline"
            >
              cancel
            </button>
          </span>
        )}
      </div>

      {error && (
        <div className="text-xs px-3 py-2 bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {preview && !sendResult && (
        <div className="text-xs px-3 py-3 bg-amber-50 text-amber-900 border border-amber-200 space-y-1">
          <div className="font-semibold">{preview.message}</div>
          <div className="text-amber-800">First {Math.min(10, preview.sample.length)} recipients:</div>
          <ul className="font-mono">
            {preview.sample.map((e) => (
              <li key={e}>· {e}</li>
            ))}
          </ul>
        </div>
      )}

      {sendResult && (
        <div
          className={`text-xs px-3 py-2 ${
            sendResult.ok
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {sendResult.message}
        </div>
      )}
    </div>
  )
}
