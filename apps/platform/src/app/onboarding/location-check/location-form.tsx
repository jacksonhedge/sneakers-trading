'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function LocationForm({
  ipCountry,
  ipState,
  claimState,
}: {
  ipCountry: string | null
  ipState: string | null
  claimState: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [geo, setGeo] = useState<{
    lat: number
    lng: number
    accuracy: number
  } | null>(null)
  const [denied, setDenied] = useState(false)

  // Match flag: does the IP-state agree with what the user claimed?
  // null until we have both pieces.
  const ipMatchesClaim =
    ipState && claimState
      ? ipState.toUpperCase() === claimState.toUpperCase()
      : null

  function shareLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Your browser blocks geolocation. Skip — we already have your IP location.')
      return
    }
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setDenied(true)
        else setError(`Couldn't read your location (${err.message}). Continue anyway?`)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    )
  }

  async function submit() {
    setBusy(true)
    setError(null)
    const payload: Record<string, unknown> = {
      current_step: 'location-check',
      geo_ip_country: ipCountry ?? undefined,
      geo_ip_state: ipState ?? undefined,
      geo_matches_claim: ipMatchesClaim,
    }
    if (geo) {
      payload.geo_lat = geo.lat
      payload.geo_lng = geo.lng
    }
    const res = await fetch('/api/onboarding/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      setBusy(false)
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      setError(body.message ?? 'Something went wrong. Try again.')
      return
    }
    router.push('/onboarding/done')
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {/* IP-derived facts */}
      <div className="border border-emerald-400/20 bg-black/40 rounded p-4 space-y-1.5 text-xs font-mono">
        <Row label="ip_country" value={ipCountry ?? '—'} />
        <Row label="ip_state" value={ipState ?? '—'} />
        <Row label="claimed_state" value={claimState ?? '—'} />
        <Row
          label="ip_matches_claim"
          value={
            ipMatchesClaim === null ? '—' : ipMatchesClaim ? 'YES ✓' : 'NO ✗'
          }
          color={ipMatchesClaim === null ? 'muted' : ipMatchesClaim ? 'good' : 'warn'}
        />
      </div>

      {ipMatchesClaim === false && (
        <div className="border border-amber-400/40 bg-amber-500/10 text-amber-200 rounded p-3 text-xs leading-relaxed">
          Your IP says <span className="font-mono">{ipState}</span> but you said{' '}
          <span className="font-mono">{claimState}</span>. We&apos;ll trust your claim and
          tailor accordingly. If you&apos;re traveling, that&apos;s normal. If you got the
          state wrong, fix it from your profile after onboarding.
        </div>
      )}

      {/* Optional: precise geolocation */}
      <div className="space-y-2">
        <div className="text-[10px] tracking-[0.15em] text-emerald-300/70 font-semibold">
          OPTIONAL — SHARE PRECISE LOCATION
        </div>
        {geo ? (
          <div className="text-xs text-emerald-300 bg-emerald-500/5 border border-emerald-400/40 rounded px-3 py-2 font-mono">
            ✓ {geo.lat.toFixed(3)}°, {geo.lng.toFixed(3)}° (±{Math.round(geo.accuracy)}m)
          </div>
        ) : denied ? (
          <div className="text-xs text-white/55 bg-black/40 border border-white/15 rounded px-3 py-2">
            Permission denied. We&apos;ll continue with IP-derived location only.
          </div>
        ) : (
          <button
            type="button"
            onClick={shareLocation}
            className="text-xs tracking-wider text-emerald-300 border border-emerald-400/50 bg-emerald-500/5 hover:bg-emerald-500/10 px-4 py-2 rounded transition"
          >
            SHARE LOCATION (BROWSER PROMPT)
          </button>
        )}
        <div className="text-[10px] text-white/45 leading-relaxed">
          Used only to confirm we route you to compliant markets. We don&apos;t track you
          after onboarding.
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition disabled:opacity-50 tracking-wider"
        >
          {busy ? 'SAVING…' : 'CONTINUE →'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-400/40 rounded px-3 py-2">
          {'>'} {error}
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  color = 'normal',
}: {
  label: string
  value: string
  color?: 'normal' | 'muted' | 'good' | 'warn'
}) {
  const cls =
    color === 'good'
      ? 'text-emerald-300'
      : color === 'warn'
        ? 'text-amber-300'
        : color === 'muted'
          ? 'text-white/45'
          : 'text-white/85'
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-emerald-300/70">{label}:</span>
      <span className={cls}>{value}</span>
    </div>
  )
}
