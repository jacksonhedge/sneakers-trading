'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type AccountType = 'individual' | 'business'

export function AccountTypeSwitcher({ initial }: { initial: AccountType }) {
  const router = useRouter()
  const [current, setCurrent] = useState<AccountType>(initial)
  const [pending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save(next: AccountType) {
    if (next === current || saving) return
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      const res = await fetch('/api/me/account-type', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: next }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? `Failed (${res.status})`)
        return
      }
      setCurrent(next)
      setSaved(true)
      // Refresh server components (pricing table reads account_type).
      startTransition(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        <Tile
          title="Individual"
          desc="Single-trader account. Unlocks Pro ($39/mo) and Elite ($99/mo)."
          active={current === 'individual'}
          disabled={saving || pending}
          onClick={() => save('individual')}
        />
        <Tile
          title="Business"
          desc="Team / fraternity account. Unlocks Business and Fraternity tiers."
          active={current === 'business'}
          disabled={saving || pending}
          onClick={() => save('business')}
        />
      </div>

      {error && (
        <div className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="mt-4 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
          Account type updated. New tier options will appear on the billing page.
        </div>
      )}
    </div>
  )
}

function Tile({
  title,
  desc,
  active,
  disabled,
  onClick,
}: {
  title: string
  desc: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      className={`text-left rounded border p-4 transition focus:outline-none ${
        active
          ? 'border-[#00703c] ring-2 ring-[#00703c]/40 bg-[#00703c]/5 cursor-default'
          : 'border-stone-200 bg-white hover:border-stone-400 hover:bg-stone-50'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold text-stone-900">{title}</div>
        {active && (
          <span className="text-[10px] tracking-wider text-[#00703c] font-semibold">
            CURRENT
          </span>
        )}
      </div>
      <div className="text-xs text-stone-600 leading-relaxed">{desc}</div>
    </button>
  )
}
