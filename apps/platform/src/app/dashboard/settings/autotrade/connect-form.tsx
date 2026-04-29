'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

interface InitialState {
  hasCreds: boolean
  testConnectionOk: boolean
  testConnectionAt: string | null
  hasPrivateKey: boolean
  funderAddress: string | null
  label: string | null
}

type Status = 'connected' | 'needs_reconnect' | 'disconnected'

export function PolymarketConnectForm({ initial }: { initial: InitialState }) {
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [funderAddress, setFunderAddress] = useState(initial.funderAddress ?? '')
  const [label, setLabel] = useState(initial.label ?? '')
  const [showSecrets, setShowSecrets] = useState(false)
  const [editing, setEditing] = useState(!initial.hasCreds)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<
    | { kind: 'ok'; message: string }
    | { kind: 'err'; message: string }
    | null
  >(null)

  const status: Status = initial.hasCreds
    ? initial.testConnectionOk
      ? 'connected'
      : 'needs_reconnect'
    : 'disconnected'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFeedback(null)
    const res = await fetch('/api/autotrade/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        apiSecret,
        passphrase,
        privateKey: privateKey.trim() || undefined,
        funderAddress: funderAddress.trim() || undefined,
        label: label.trim() || undefined,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      message?: string
      test?: { ok: boolean; reason?: string; signerAddress?: string }
    }
    setBusy(false)
    if (!res.ok || !data.ok) {
      setFeedback({
        kind: 'err',
        message: data.message ?? 'Failed to save credentials.',
      })
      return
    }
    if (data.test && !data.test.ok) {
      setFeedback({
        kind: 'err',
        message: `Saved, but the test API call failed: ${data.test.reason ?? 'unknown error'}. Double-check the values.`,
      })
    } else {
      setFeedback({
        kind: 'ok',
        message: data.test?.signerAddress
          ? `Connected. Signing wallet: ${data.test.signerAddress.slice(0, 6)}…${data.test.signerAddress.slice(-4)}`
          : 'Connected.',
      })
      setEditing(false)
    }
    setApiKey('')
    setApiSecret('')
    setPassphrase('')
    setPrivateKey('')
    router.refresh()
  }

  async function disconnect() {
    if (!confirm('Disconnect Polymarket? Stored credentials will be deleted.')) return
    setBusy(true)
    await fetch('/api/autotrade/credentials', { method: 'DELETE' })
    setBusy(false)
    setEditing(true)
    router.refresh()
  }

  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-stone-200 bg-white">
      {/* ── Polymarket branded header ───────────────────────────────── */}
      <div className="relative px-5 py-4 bg-gradient-to-r from-[#1652F0] via-[#2563eb] to-[#1652F0] text-white flex items-center gap-3">
        <span className="w-11 h-11 rounded-full bg-white ring-2 ring-white/40 flex items-center justify-center overflow-hidden shrink-0">
          <Image
            src="/SneakersLogos/partners/polymarket.png"
            alt="Polymarket"
            width={44}
            height={44}
            className="w-full h-full object-cover"
          />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] tracking-[0.18em] font-semibold text-white/80">
            VENUE
          </div>
          <div className="text-base font-bold leading-tight">Polymarket</div>
        </div>
        <StatusPill status={status} />
      </div>

      {/* ── Connected card OR connect form ──────────────────────────── */}
      {status !== 'disconnected' && !editing ? (
        <ConnectedCard
          status={status}
          initial={initial}
          onEdit={() => setEditing(true)}
          onDisconnect={disconnect}
          busy={busy}
        />
      ) : (
        <ConnectForm
          editing={editing}
          hasExisting={initial.hasCreds}
          apiKey={apiKey}
          apiSecret={apiSecret}
          passphrase={passphrase}
          privateKey={privateKey}
          funderAddress={funderAddress}
          label={label}
          showSecrets={showSecrets}
          busy={busy}
          feedback={feedback}
          onApiKey={setApiKey}
          onApiSecret={setApiSecret}
          onPassphrase={setPassphrase}
          onPrivateKey={setPrivateKey}
          onFunderAddress={setFunderAddress}
          onLabel={setLabel}
          onShowSecrets={setShowSecrets}
          onCancelEdit={() => {
            setEditing(false)
            setFeedback(null)
          }}
          onSubmit={submit}
        />
      )}
    </div>
  )
}

function StatusPill({ status }: { status: Status }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] tracking-wider font-bold bg-emerald-400 text-black ring-1 ring-emerald-300 px-2.5 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
        CONNECTED
      </span>
    )
  }
  if (status === 'needs_reconnect') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] tracking-wider font-bold bg-amber-300 text-amber-900 ring-1 ring-amber-200 px-2.5 py-1 rounded-full">
        ⚠ NEEDS RECONNECT
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] tracking-wider font-bold bg-white/20 text-white ring-1 ring-white/40 px-2.5 py-1 rounded-full">
      • NOT CONNECTED
    </span>
  )
}

function ConnectedCard({
  status,
  initial,
  onEdit,
  onDisconnect,
  busy,
}: {
  status: Status
  initial: InitialState
  onEdit: () => void
  onDisconnect: () => void
  busy: boolean
}) {
  const lastVerified = initial.testConnectionAt
    ? new Date(initial.testConnectionAt)
    : null
  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="TRADING">
          {initial.hasPrivateKey ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
              ✓ Live
            </span>
          ) : (
            <span className="text-stone-500">Read-only</span>
          )}
        </Stat>
        <Stat label="FUNDER">
          {initial.funderAddress ? (
            <code className="text-[12px] font-mono text-stone-800">
              {initial.funderAddress.slice(0, 6)}…{initial.funderAddress.slice(-4)}
            </code>
          ) : (
            <span className="text-stone-400">—</span>
          )}
        </Stat>
        <Stat label="LAST VERIFIED">
          {lastVerified ? (
            <span className="text-[12px] text-stone-700">
              {lastVerified.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          ) : (
            <span className="text-stone-400">—</span>
          )}
        </Stat>
      </div>

      {initial.label && (
        <div className="text-[11px] text-stone-600">
          <span className="text-stone-400">label:</span>{' '}
          <span className="font-mono">{initial.label}</span>
        </div>
      )}

      {status === 'needs_reconnect' && (
        <div className="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-900">
          Saved credentials failed the last test call. Re-enter them below.
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="rounded-full bg-stone-900 text-white font-semibold px-4 py-2 text-xs tracking-wider hover:bg-stone-800 transition disabled:opacity-50"
        >
          UPDATE KEYS →
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={busy}
          className="rounded-full ring-1 ring-stone-300 text-stone-700 font-semibold px-4 py-2 text-xs tracking-wider hover:bg-stone-100 transition disabled:opacity-50"
        >
          DISCONNECT
        </button>
      </div>

      <TrustSignals />
    </div>
  )
}

function ConnectForm(props: {
  editing: boolean
  hasExisting: boolean
  apiKey: string
  apiSecret: string
  passphrase: string
  privateKey: string
  funderAddress: string
  label: string
  showSecrets: boolean
  busy: boolean
  feedback:
    | { kind: 'ok'; message: string }
    | { kind: 'err'; message: string }
    | null
  onApiKey: (v: string) => void
  onApiSecret: (v: string) => void
  onPassphrase: (v: string) => void
  onPrivateKey: (v: string) => void
  onFunderAddress: (v: string) => void
  onLabel: (v: string) => void
  onShowSecrets: (v: boolean) => void
  onCancelEdit: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const ready =
    props.apiKey.trim() && props.apiSecret.trim() && props.passphrase.trim()
  return (
    <form onSubmit={props.onSubmit} className="p-5 space-y-5">
      {/* Step 1 — API trio */}
      <Section
        index={1}
        title="API credentials"
        subtitle="Generated by Polymarket → Settings → API"
        helpHref="https://polymarket.com"
      >
        <Field label="API KEY" required>
          <input
            type={props.showSecrets ? 'text' : 'password'}
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
            type={props.showSecrets ? 'text' : 'password'}
            required
            autoComplete="off"
            value={props.apiSecret}
            onChange={(e) => props.onApiSecret(e.target.value)}
            placeholder="•••••••••••••••••••••"
            className={inputCls}
          />
        </Field>
        <Field label="PASSPHRASE" required>
          <input
            type={props.showSecrets ? 'text' : 'password'}
            required
            autoComplete="off"
            value={props.passphrase}
            onChange={(e) => props.onPassphrase(e.target.value)}
            placeholder="•••••••"
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Step 2 — Wallet */}
      <Section
        index={2}
        title="Trading wallet"
        subtitle="Required to sign and place orders"
      >
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900 leading-relaxed">
          <strong>Important:</strong> use a dedicated wallet you&apos;ve
          funded only with the USDC you&apos;re comfortable trading with.
          The private key is AES-256-GCM encrypted at rest, but a server
          compromise + access to our key would still drain a funded wallet.
        </div>
        <Field label="WALLET PRIVATE KEY" hint="0x + 64 hex chars">
          <input
            type={props.showSecrets ? 'text' : 'password'}
            autoComplete="off"
            value={props.privateKey}
            onChange={(e) => props.onPrivateKey(e.target.value)}
            placeholder="0x…"
            className={inputCls}
          />
        </Field>
        <Field
          label="FUNDER ADDRESS"
          hint="your Polymarket proxy / Safe address (0x + 40 hex)"
        >
          <input
            type="text"
            autoComplete="off"
            value={props.funderAddress}
            onChange={(e) => props.onFunderAddress(e.target.value)}
            placeholder="0x…"
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Step 3 — Optional label */}
      <Section index={3} title="Label (optional)" subtitle="Just for you">
        <Field label="LABEL">
          <input
            type="text"
            value={props.label}
            onChange={(e) => props.onLabel(e.target.value)}
            placeholder="e.g. main trading wallet"
            className={inputCls}
          />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={props.busy || !ready}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 ring-1 ring-emerald-400 text-black font-semibold px-5 py-2.5 text-sm tracking-wider hover:bg-emerald-400 transition disabled:opacity-50"
        >
          {props.busy && (
            <span
              className="w-3.5 h-3.5 rounded-full border-2 border-black/30 border-t-black animate-spin"
              aria-hidden
            />
          )}
          {props.busy
            ? 'TESTING…'
            : props.hasExisting
              ? 'UPDATE & TEST →'
              : 'SAVE & TEST →'}
        </button>
        {props.editing && props.hasExisting && (
          <button
            type="button"
            onClick={props.onCancelEdit}
            disabled={props.busy}
            className="text-xs text-stone-500 hover:text-stone-900 underline"
          >
            cancel
          </button>
        )}
        <label className="text-xs text-stone-600 flex items-center gap-1.5 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={props.showSecrets}
            onChange={(e) => props.onShowSecrets(e.target.checked)}
            className="accent-emerald-500"
          />
          Show secrets
        </label>
      </div>

      {props.feedback && (
        <div
          className={`rounded-lg px-3 py-2.5 text-xs font-semibold leading-relaxed ${
            props.feedback.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-red-50 text-red-700 border border-red-300'
          }`}
        >
          {props.feedback.message}
        </div>
      )}

      <TrustSignals />
    </form>
  )
}

function Section({
  index,
  title,
  subtitle,
  helpHref,
  children,
}: {
  index: number
  title: string
  subtitle: string
  helpHref?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5 mb-3">
        <span className="w-6 h-6 rounded-full bg-stone-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-stone-900 leading-tight">{title}</div>
          <div className="text-[11px] text-stone-500 leading-tight">{subtitle}</div>
        </div>
        {helpHref && (
          <a
            href={helpHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold whitespace-nowrap"
          >
            open polymarket.com →
          </a>
        )}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function Stat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg bg-stone-50 ring-1 ring-stone-200 px-3 py-2">
      <div className="text-[10px] tracking-wider text-stone-500 font-semibold mb-0.5">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function TrustSignals() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 mt-1 border-t border-stone-100">
      <TrustItem
        title="AES-256-GCM"
        body="Credentials encrypted at rest. Decrypted only inside the order-placing process."
      />
      <TrustItem
        title="Non-custodial"
        body="Sneakers never holds funds. Trades go directly against your Polymarket wallet."
      />
      <TrustItem
        title="5-gate confirm"
        body="Every co-pilot proposal runs caps + balance + market checks before placing."
      />
    </div>
  )
}

function TrustItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg bg-stone-50/60 px-3 py-2.5">
      <div className="text-[10px] tracking-wider text-emerald-700 font-bold mb-0.5">
        ✓ {title}
      </div>
      <div className="text-[11px] text-stone-600 leading-snug">{body}</div>
    </div>
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
