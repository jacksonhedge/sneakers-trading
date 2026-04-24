'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const CHAINS = [
  { value: 'polygon', label: 'Polygon (recommended — Polymarket lives here)' },
  { value: 'ethereum', label: 'Ethereum mainnet' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'base', label: 'Base' },
] as const

interface Props {
  initialAddress?: string
  initialChain?: string
  disconnectMode?: boolean
}

export function TreasuryForm({ initialAddress, initialChain, disconnectMode }: Props) {
  const router = useRouter()
  const [address, setAddress] = useState(initialAddress ?? '')
  const [chain, setChain] = useState(initialChain ?? 'polygon')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    if (!ADDRESS_RE.test(address.trim())) {
      setErrorMsg('Address must start with 0x and be 40 hex characters.')
      return
    }
    setStatus('submitting')
    const res = await fetch('/api/me/treasury', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.trim(), chain }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
      setStatus('error')
      setErrorMsg(json.detail ?? 'Could not save — try again in a moment.')
      return
    }
    router.refresh()
  }

  async function disconnect() {
    if (!confirm('Disconnect this Safe from your account? You can reconnect anytime.')) return
    setStatus('submitting')
    const res = await fetch('/api/me/treasury', { method: 'DELETE' })
    if (!res.ok) {
      setStatus('error')
      setErrorMsg('Could not disconnect — try again.')
      return
    }
    router.refresh()
  }

  if (disconnectMode) {
    return (
      <button
        type="button"
        onClick={disconnect}
        disabled={status === 'submitting'}
        className="text-xs text-red-700 hover:text-red-800 underline underline-offset-2 disabled:opacity-50"
      >
        {status === 'submitting' ? 'Disconnecting…' : 'Disconnect treasury'}
      </button>
    )
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label
          htmlFor="safe-address"
          className="block text-xs font-semibold text-stone-700 mb-1.5"
        >
          Safe address
        </label>
        <input
          id="safe-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x0000000000000000000000000000000000000000"
          maxLength={42}
          spellCheck={false}
          autoComplete="off"
          className="w-full px-3 py-2.5 text-sm border border-stone-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-500"
        />
        <div className="mt-1 text-[11px] text-stone-500">
          Starts with 0x, followed by 40 hex characters. Copy from app.safe.global.
        </div>
      </div>

      <div>
        <label
          htmlFor="safe-chain"
          className="block text-xs font-semibold text-stone-700 mb-1.5"
        >
          Chain
        </label>
        <select
          id="safe-chain"
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-500 bg-white"
        >
          {CHAINS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {errorMsg && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'submitting' || !address}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-sm font-semibold tracking-wider px-6 py-3 rounded transition"
      >
        {status === 'submitting' ? 'Saving…' : 'Connect Treasury →'}
      </button>
    </form>
  )
}
