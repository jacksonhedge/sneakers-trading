'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { findVenue, type Venue } from '@/lib/venues'

// Modal-driven credential wizard. Replaces the connections-grid CONNECT
// button's "open affiliate link, mark connected" behavior for venues
// where we have a working balance/trading adapter (polymarket, kalshi).
//
// For non-credentialed venues, the grid stays on the affiliate-only path.

type Scope = 'read' | 'trade'

type Feedback =
  | { kind: 'ok'; message: string }
  | { kind: 'err'; message: string }

interface Meta {
  scope: Scope
  testConnectionOk: boolean
  hasPrivateKey: boolean
  label: string | null
}

const LOGO_PATH: Record<string, string> = {
  polymarket: '/SneakersLogos/partners/polymarket.png',
  kalshi: '/SneakersLogos/partners/kalshi.png',
  opinion: '/SneakersLogos/partners/opinion.svg',
}

export function CredentialsWizard({
  venueId,
  onClose,
  onConnected,
}: {
  venueId: 'polymarket' | 'kalshi' | 'opinion'
  onClose: () => void
  onConnected?: () => void
}) {
  const venue = findVenue(venueId)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [scope, setScope] = useState<Scope>('read')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Polymarket fields
  const [pmApiKey, setPmApiKey] = useState('')
  const [pmApiSecret, setPmApiSecret] = useState('')
  const [pmPassphrase, setPmPassphrase] = useState('')
  const [pmPrivateKey, setPmPrivateKey] = useState('')
  const [pmFunder, setPmFunder] = useState('')

  // Kalshi fields
  const [kAccessKey, setKAccessKey] = useState('')
  const [kPrivateKey, setKPrivateKey] = useState('')

  // Opinion fields
  const [oApiKey, setOApiKey] = useState('')

  // Load existing meta so user sees current state on open.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/autotrade/credentials?venue=${venueId}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as { meta: Meta | null }) : null))
      .then((res) => {
        if (cancelled) return
        if (res?.meta) {
          setMeta(res.meta)
          setScope(res.meta.scope)
        }
      })
      .catch(() => {
        // Non-fatal — fall back to no-meta state.
      })
    return () => {
      cancelled = true
    }
  }, [venueId])

  // Close on Esc.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!venue) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFeedback(null)

    const body =
      venueId === 'polymarket'
        ? {
            venue: 'polymarket',
            scope,
            apiKey: pmApiKey,
            apiSecret: pmApiSecret,
            passphrase: pmPassphrase,
            privateKey: scope === 'trade' && pmPrivateKey.trim() ? pmPrivateKey : undefined,
            funderAddress: scope === 'trade' && pmFunder.trim() ? pmFunder : undefined,
          }
        : venueId === 'kalshi'
          ? {
              venue: 'kalshi',
              scope,
              apiKey: kAccessKey,
              privateKey: kPrivateKey,
            }
          : {
              venue: 'opinion',
              scope,
              apiKey: oApiKey,
            }

    const res = await fetch('/api/autotrade/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      message?: string
      test?: { ok: boolean; reason?: string }
      meta?: Meta
    }
    setBusy(false)

    if (!res.ok || !data.ok) {
      setFeedback({ kind: 'err', message: data.message ?? 'Failed to save credentials.' })
      return
    }
    // Defensive — the server now blocks the save when test fails (returns
    // ok: false + status 400 above), so this branch is unreachable in
    // normal flow. Kept in case the server response ever comes back with
    // a test failure under ok=true (race / future divergence). Wording
    // dropped the misleading "Saved, but..." prefix accordingly.
    if (data.test && !data.test.ok) {
      setFeedback({
        kind: 'err',
        message: `Couldn't verify: ${data.test.reason ?? 'unknown'}. Double-check the values.`,
      })
      return
    }
    setFeedback({ kind: 'ok', message: 'Connected and verified.' })
    if (data.meta) setMeta(data.meta)
    onConnected?.()
    setTimeout(onClose, 1200)
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${venue?.name ?? venueId}? Stored credentials will be deleted.`)) return
    setBusy(true)
    await fetch(`/api/autotrade/credentials?venue=${venueId}`, { method: 'DELETE' })
    setBusy(false)
    setMeta(null)
    setFeedback({ kind: 'ok', message: 'Disconnected.' })
  }

  const logo = LOGO_PATH[venueId]
  const status: 'connected' | 'needs_reconnect' | 'disconnected' = !meta
    ? 'disconnected'
    : meta.testConnectionOk
      ? 'connected'
      : 'needs_reconnect'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white ring-1 ring-stone-200 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <Header venue={venue} logo={logo} status={status} onClose={onClose} />
        <ScopeToggle scope={scope} onChange={setScope} />
        {!meta && venue.affiliateUrl && <AffiliateNudge venue={venue} />}

        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          {venueId === 'polymarket' ? (
            <PolymarketFields
              scope={scope}
              apiKey={pmApiKey}
              apiSecret={pmApiSecret}
              passphrase={pmPassphrase}
              privateKey={pmPrivateKey}
              funder={pmFunder}
              onApiKey={setPmApiKey}
              onApiSecret={setPmApiSecret}
              onPassphrase={setPmPassphrase}
              onPrivateKey={setPmPrivateKey}
              onFunder={setPmFunder}
            />
          ) : venueId === 'kalshi' ? (
            <KalshiFields
              accessKey={kAccessKey}
              privateKey={kPrivateKey}
              onAccessKey={setKAccessKey}
              onPrivateKey={setKPrivateKey}
            />
          ) : (
            <OpinionFields apiKey={oApiKey} onApiKey={setOApiKey} />
          )}

          {feedback && (
            <div
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold leading-relaxed ${
                feedback.kind === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : 'bg-red-50 text-red-700 border border-red-300'
              }`}
            >
              {feedback.message}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 ring-1 ring-emerald-400 text-black font-semibold px-5 py-2.5 text-sm tracking-wider hover:bg-emerald-400 transition disabled:opacity-50"
            >
              {busy && (
                <span
                  className="w-3.5 h-3.5 rounded-full border-2 border-black/30 border-t-black animate-spin"
                  aria-hidden
                />
              )}
              {busy ? 'TESTING…' : meta ? 'UPDATE & TEST' : 'SAVE & TEST'}
            </button>
            {meta && (
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className="text-xs text-stone-500 hover:text-red-700 underline ml-2"
              >
                disconnect
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="ml-auto text-xs text-stone-500 hover:text-stone-900"
            >
              cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Header({
  venue,
  logo,
  status,
  onClose,
}: {
  venue: Venue
  logo: string | undefined
  status: 'connected' | 'needs_reconnect' | 'disconnected'
  onClose: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-stone-200 bg-stone-50">
      {logo ? (
        <span className="w-10 h-10 rounded-full bg-white ring-1 ring-stone-200 flex items-center justify-center overflow-hidden shrink-0">
          <Image src={logo} alt={venue.name} width={40} height={40} className="w-full h-full object-cover" />
        </span>
      ) : (
        <span className="w-10 h-10 rounded-full bg-stone-900 text-white text-sm font-bold flex items-center justify-center shrink-0">
          {venue.name.slice(0, 1)}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] tracking-[0.18em] font-semibold text-stone-500">CONNECT</div>
        <div className="text-base font-bold text-stone-900 leading-tight">{venue.name}</div>
      </div>
      <StatusPill status={status} />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="text-stone-500 hover:text-stone-900 text-xl leading-none px-1"
      >
        ×
      </button>
    </div>
  )
}

function StatusPill({ status }: { status: 'connected' | 'needs_reconnect' | 'disconnected' }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] tracking-wider font-bold bg-emerald-500 text-white ring-1 ring-emerald-400 px-2.5 py-1 rounded-full">
        ✓ CONNECTED
      </span>
    )
  }
  if (status === 'needs_reconnect') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] tracking-wider font-bold bg-amber-300 text-amber-900 ring-1 ring-amber-200 px-2.5 py-1 rounded-full">
        ⚠ RECONNECT
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] tracking-wider font-bold bg-stone-200 text-stone-700 ring-1 ring-stone-300 px-2.5 py-1 rounded-full">
      • NOT CONNECTED
    </span>
  )
}

function ScopeToggle({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  return (
    <div className="px-5 pt-4">
      <div className="text-[10px] tracking-wider text-stone-500 font-semibold mb-2">PERMISSION</div>
      <div className="grid grid-cols-2 gap-2">
        <ScopeChoice
          active={scope === 'read'}
          onClick={() => onChange('read')}
          title="Read only"
          body="Show my balance and positions. Can't place trades."
        />
        <ScopeChoice
          active={scope === 'trade'}
          onClick={() => onChange('trade')}
          title="Read + trade"
          body="Required for the autotrade co-pilot to place orders."
        />
      </div>
    </div>
  )
}

function ScopeChoice({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean
  onClick: () => void
  title: string
  body: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg px-3 py-2.5 ring-1 transition ${
        active
          ? 'bg-emerald-50 ring-emerald-400 text-stone-900'
          : 'bg-white ring-stone-200 text-stone-700 hover:ring-stone-400'
      }`}
    >
      <div className="text-xs font-semibold">{title}</div>
      <div className="text-[11px] text-stone-600 leading-snug mt-0.5">{body}</div>
    </button>
  )
}

function AffiliateNudge({ venue }: { venue: Venue }) {
  return (
    <div className="mx-5 mt-4 rounded-lg bg-stone-50 ring-1 ring-stone-200 px-3 py-2.5 flex items-center gap-3">
      <div className="text-[11px] text-stone-700 flex-1">
        Don&apos;t have a {venue.name} account yet?
      </div>
      <a
        href={venue.affiliateUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="text-[11px] font-semibold tracking-wider px-3 py-1.5 rounded-full bg-stone-900 text-white hover:bg-stone-800"
      >
        SIGN UP ↗
      </a>
    </div>
  )
}

function PolymarketFields(props: {
  scope: Scope
  apiKey: string
  apiSecret: string
  passphrase: string
  privateKey: string
  funder: string
  onApiKey: (v: string) => void
  onApiSecret: (v: string) => void
  onPassphrase: (v: string) => void
  onPrivateKey: (v: string) => void
  onFunder: (v: string) => void
}) {
  return (
    <>
      <div className="text-[11px] text-stone-600 leading-relaxed">
        Generate these in Polymarket → Settings → API.
      </div>
      <Field label="API KEY" required>
        <input
          type="password"
          required
          autoComplete="off"
          value={props.apiKey}
          onChange={(e) => props.onApiKey(e.target.value)}
          placeholder="poly_…"
          className={inputCls}
        />
      </Field>
      <Field label="API SECRET" required>
        <input
          type="password"
          required
          autoComplete="off"
          value={props.apiSecret}
          onChange={(e) => props.onApiSecret(e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label="PASSPHRASE" required>
        <input
          type="password"
          required
          autoComplete="off"
          value={props.passphrase}
          onChange={(e) => props.onPassphrase(e.target.value)}
          className={inputCls}
        />
      </Field>
      {props.scope === 'trade' && (
        <>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900 leading-relaxed">
            Use a dedicated wallet funded with only the USDC you&apos;re comfortable trading. Encrypted at rest, but a server compromise + key access could drain it.
          </div>
          <Field label="WALLET PRIVATE KEY" hint="0x + 64 hex">
            <input
              type="password"
              autoComplete="off"
              value={props.privateKey}
              onChange={(e) => props.onPrivateKey(e.target.value)}
              placeholder="0x…"
              className={inputCls}
            />
          </Field>
          <Field label="FUNDER ADDRESS" hint="Polymarket proxy / Safe">
            <input
              type="text"
              autoComplete="off"
              value={props.funder}
              onChange={(e) => props.onFunder(e.target.value)}
              placeholder="0x…"
              className={inputCls}
            />
          </Field>
        </>
      )}
    </>
  )
}

function OpinionFields(props: { apiKey: string; onApiKey: (v: string) => void }) {
  return (
    <>
      <div className="text-[11px] text-stone-600 leading-relaxed">
        Opinion access is approval-based. Before requesting an API key you
        need to (1) sign up, (2) send a small USDT amount on BNB Chain to
        seed your contract wallet, and (3) create the contract wallet inside
        Opinion. Once you have the key, paste it below.
      </div>
      <Field label="API KEY" required>
        <input
          type="password"
          required
          autoComplete="off"
          value={props.apiKey}
          onChange={(e) => props.onApiKey(e.target.value)}
          className={inputCls}
        />
      </Field>
      <div className="rounded-lg bg-stone-50 ring-1 ring-stone-200 px-3 py-2 text-[11px] text-stone-600 leading-relaxed">
        Default rate limit is 15 requests/sec. We only call the balance
        endpoint once per dashboard load.
      </div>
    </>
  )
}

function KalshiFields(props: {
  accessKey: string
  privateKey: string
  onAccessKey: (v: string) => void
  onPrivateKey: (v: string) => void
}) {
  return (
    <>
      <div className="text-[11px] text-stone-600 leading-relaxed">
        Generate an RSA keypair locally, upload the public key in Kalshi → Profile → API Keys, then paste the Access Key ID and the matching private-key PEM.
      </div>
      <Field label="ACCESS KEY ID" required>
        <input
          type="text"
          required
          autoComplete="off"
          value={props.accessKey}
          onChange={(e) => props.onAccessKey(e.target.value)}
          placeholder="abc123e4-…"
          className={inputCls}
        />
      </Field>
      <Field label="PRIVATE KEY (PEM)" required hint="full -----BEGIN ... PRIVATE KEY----- block">
        <textarea
          required
          autoComplete="off"
          value={props.privateKey}
          onChange={(e) => props.onPrivateKey(e.target.value)}
          rows={6}
          placeholder="-----BEGIN PRIVATE KEY-----&#10;…&#10;-----END PRIVATE KEY-----"
          className={`${inputCls} font-mono text-[11px] resize-y`}
        />
      </Field>
      <div className="rounded-lg bg-stone-50 ring-1 ring-stone-200 px-3 py-2 text-[11px] text-stone-600 leading-relaxed">
        Kalshi signs every request — the PEM is required even for read-only use.
      </div>
    </>
  )
}

const inputCls =
  'w-full bg-white border border-stone-300 text-stone-900 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400/40 placeholder:text-stone-400 transition'

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] tracking-wider text-stone-700 font-semibold mb-1">
        {label}
        {required && <span className="text-emerald-700"> *</span>}
        {hint && <span className="text-stone-400 normal-case font-normal"> · {hint}</span>}
      </label>
      {children}
    </div>
  )
}
