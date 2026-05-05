'use client'

import { useState, useTransition } from 'react'
import {
  upsertVenueAffiliateLinkAction,
  resetVenueAffiliateLinkAction,
} from './actions'
import {
  VENUE_AFFILIATE_DEFAULTS,
  VENUE_LABEL,
  type VenueId,
} from '@/lib/venue-affiliate-links'

// Single editable row for one venue's affiliate link. Tracks dirty
// state (so SAVE only enables when the user changes something) and
// shows the inline result of the last save / reset. RESET nukes the
// override and falls back to VENUE_AFFILIATE_DEFAULTS — which is why
// we surface the default URL inline so the user can see what RESET
// would revert to.

export function AffiliateRow({
  venue,
  initialUrl,
  initialCode,
  updatedAt,
  updatedBy,
  isOverridden,
}: {
  venue: VenueId
  initialUrl: string
  initialCode: string | null
  updatedAt: string | null
  updatedBy: string | null
  isOverridden: boolean
}) {
  const defaults = VENUE_AFFILIATE_DEFAULTS[venue]
  const [url, setUrl] = useState(initialUrl)
  const [code, setCode] = useState(initialCode ?? '')
  const [pending, startTransition] = useTransition()
  const [resetting, startReset] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const dirty = url.trim() !== initialUrl || (code.trim() || null) !== (initialCode ?? null)

  function save() {
    const fd = new FormData()
    fd.set('venue', venue)
    fd.set('signup_url', url.trim())
    fd.set('promo_code', code.trim())
    setResult(null)
    startTransition(async () => {
      const r = await upsertVenueAffiliateLinkAction(fd)
      setResult(r)
    })
  }

  function reset() {
    if (!isOverridden && url.trim() === defaults.signupUrl && (code.trim() || null) === defaults.promoCode) {
      setResult({ ok: true, message: `${venue} already on default` })
      return
    }
    const fd = new FormData()
    fd.set('venue', venue)
    setResult(null)
    startReset(async () => {
      const r = await resetVenueAffiliateLinkAction(fd)
      setResult(r)
      if (r.ok) {
        setUrl(defaults.signupUrl)
        setCode(defaults.promoCode ?? '')
      }
    })
  }

  return (
    <div className="border border-stone-300 bg-white p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-bold text-stone-900">{VENUE_LABEL[venue]}</h2>
          <span
            className={`text-[10px] tracking-wider px-1.5 py-0.5 ring-1 ${
              isOverridden
                ? 'bg-emerald-100 text-emerald-800 ring-emerald-300'
                : 'bg-stone-100 text-stone-700 ring-stone-300'
            }`}
          >
            {isOverridden ? 'OVERRIDE' : 'DEFAULT'}
          </span>
        </div>
        <div className="text-[10px] text-stone-500 font-mono whitespace-nowrap">
          {updatedAt ? new Date(updatedAt).toISOString().slice(0, 16).replace('T', ' ') : '—'}
          {updatedBy && <span className="ml-2 text-stone-400">{updatedBy}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr,200px] gap-3">
        <div>
          <label className="block text-[10px] tracking-wider text-stone-600 font-bold mb-1">
            SIGN-UP URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={defaults.signupUrl}
            className="w-full px-3 py-2 text-xs font-mono border border-stone-300 focus:border-[#00703c] focus:outline-none focus:ring-1 focus:ring-[#00703c]/30 rounded"
          />
          <div className="text-[10px] text-stone-500 mt-1">
            Default: <span className="font-mono">{defaults.signupUrl}</span>
          </div>
        </div>
        <div>
          <label className="block text-[10px] tracking-wider text-stone-600 font-bold mb-1">
            PROMO CODE <span className="text-stone-400">(optional)</span>
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={defaults.promoCode ?? 'e.g. SNEAKERS'}
            maxLength={32}
            className="w-full px-3 py-2 text-xs font-mono uppercase tracking-wider border border-stone-300 focus:border-[#00703c] focus:outline-none focus:ring-1 focus:ring-[#00703c]/30 rounded"
          />
          <div className="text-[10px] text-stone-500 mt-1">
            Default: <span className="font-mono">{defaults.promoCode ?? '— none —'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <div>
          {result && (
            <span
              className={`text-[10px] px-2 py-1 ${
                result.ok
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {result.message}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={resetting || pending || !isOverridden}
            onClick={reset}
            className="text-[11px] px-3 py-1.5 tracking-wider border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title={isOverridden ? 'Delete the override row and revert to the hardcoded default' : 'Already on default'}
          >
            {resetting ? 'RESETTING…' : 'RESET TO DEFAULT'}
          </button>
          <button
            type="button"
            disabled={!dirty || pending || resetting || url.trim().length === 0}
            onClick={save}
            className="text-[11px] px-4 py-1.5 tracking-wider bg-[#00703c] text-white hover:bg-[#005a30] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? 'SAVING…' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  )
}
