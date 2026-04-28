'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface InitialState {
  hasCreds: boolean
  testConnectionOk: boolean
  testConnectionAt: string | null
  hasPrivateKey: boolean
  funderAddress: string | null
  label: string | null
}

export function PolymarketConnectForm({ initial }: { initial: InitialState }) {
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [funderAddress, setFunderAddress] = useState(initial.funderAddress ?? '')
  const [label, setLabel] = useState(initial.label ?? '')
  const [showSecrets, setShowSecrets] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<
    | { kind: 'ok'; message: string }
    | { kind: 'err'; message: string }
    | null
  >(null)

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
    }
    // Reset only the secret fields — keep the address + label visible.
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
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {initial.hasCreds && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="font-semibold mb-0.5">
            {initial.testConnectionOk ? '✓ Connected' : '⚠ Saved, last test failed'}
          </div>
          <div className="text-xs text-emerald-800/80">
            {initial.label ? `Label: ${initial.label} · ` : ''}
            {initial.hasPrivateKey ? 'Trading wallet: configured' : 'Read-only mode — no signing key saved'}
            {initial.funderAddress
              ? ` · Funder: ${initial.funderAddress.slice(0, 6)}…${initial.funderAddress.slice(-4)}`
              : ''}
            {initial.testConnectionAt
              ? ` · Last verified: ${new Date(initial.testConnectionAt).toLocaleString()}`
              : ''}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={disconnect}
              className="text-xs text-red-700 hover:text-red-900 underline"
            >
              Disconnect + clear credentials
            </button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <Field label="API KEY" required>
          <input
            type={showSecrets ? 'text' : 'password'}
            required
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="from polymarket.com → Settings → API"
            className={inputCls}
          />
        </Field>
        <Field label="API SECRET" required>
          <input
            type={showSecrets ? 'text' : 'password'}
            required
            autoComplete="off"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder="•••••••••••••••••••••"
            className={inputCls}
          />
        </Field>
        <Field label="PASSPHRASE" required>
          <input
            type={showSecrets ? 'text' : 'password'}
            required
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="•••••••"
            className={inputCls}
          />
        </Field>
        <Field
          label="WALLET PRIVATE KEY"
          hint="optional — required to place trades"
        >
          <input
            type={showSecrets ? 'text' : 'password'}
            autoComplete="off"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="0x… 64 hex characters"
            className={inputCls}
          />
        </Field>
        <Field label="FUNDER ADDRESS" hint="your Polymarket proxy / Safe address">
          <input
            type="text"
            autoComplete="off"
            value={funderAddress}
            onChange={(e) => setFunderAddress(e.target.value)}
            placeholder="0x… 40 hex characters"
            className={inputCls}
          />
        </Field>
        <Field label="LABEL" hint="optional, just for you">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. main trading wallet"
            className={inputCls}
          />
        </Field>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={busy || !apiKey || !apiSecret || !passphrase}
            className="rounded-full bg-emerald-500 ring-1 ring-emerald-400 text-black font-semibold px-5 py-2.5 text-sm tracking-wider hover:bg-emerald-400 transition disabled:opacity-50"
          >
            {busy ? 'SAVING…' : initial.hasCreds ? 'UPDATE & TEST →' : 'SAVE & TEST →'}
          </button>
          <label className="text-xs text-stone-600 flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showSecrets}
              onChange={(e) => setShowSecrets(e.target.checked)}
              className="accent-emerald-500"
            />
            Show secrets
          </label>
        </div>

        {feedback && (
          <div
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${
              feedback.kind === 'ok'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                : 'bg-red-50 text-red-700 border border-red-300'
            }`}
          >
            {feedback.message}
          </div>
        )}
      </form>

      <div className="text-[11px] text-stone-500 leading-relaxed border-t border-stone-200 pt-3">
        <strong>Where to find these:</strong> log in to{' '}
        <a
          href="https://polymarket.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 underline"
        >
          polymarket.com
        </a>{' '}
        → top-right menu → Settings → API. The first time, you&apos;ll generate a
        new key set (key + secret + passphrase) signed by your wallet. Your
        wallet&apos;s private key + funder address come from the same wallet —
        export it from your wallet provider only after funding a dedicated
        trading wallet you&apos;re comfortable with us holding the key for.
      </div>
    </div>
  )
}

const inputCls =
  'w-full bg-stone-50 border border-stone-300 text-stone-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400/40 placeholder:text-stone-400 transition'

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
