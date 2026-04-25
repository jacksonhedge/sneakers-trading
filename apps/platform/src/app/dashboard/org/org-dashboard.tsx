'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { MembersTab } from './members-tab'

interface Org {
  id: string
  name: string
  type: string | null
  college: string | null
  leaderName: string | null
  status: string
}

interface Invitation {
  id: string
  invited_email: string
  status: string
  invited_at: string
  sent_at: string | null
  accepted_at: string | null
}

type Tab = 'members' | 'seats' | 'treasury' | 'bot' | 'settings'

const TABS: Array<{ id: Tab; label: string; pending?: boolean }> = [
  { id: 'members', label: 'Members' },
  { id: 'seats', label: 'Seats', pending: true },
  { id: 'treasury', label: 'Treasury' },
  { id: 'bot', label: 'Bot', pending: true },
  { id: 'settings', label: 'Settings', pending: true },
]

interface Props {
  org: Org
  initialInvitations: Invitation[]
  initialTab: Tab
}

export function OrgDashboard({ org, initialInvitations, initialTab }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>(initialTab)

  function selectTab(id: Tab) {
    setTab(id)
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', id)
    router.replace(`/dashboard/org?${params.toString()}`, { scroll: false })
  }

  const acceptedCount = initialInvitations.filter((i) => i.status === 'accepted').length
  const pendingCount = initialInvitations.filter(
    (i) => i.status === 'pending' || i.status === 'sent',
  ).length

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href="/dashboard"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← DASHBOARD
        </Link>

        {/* Header */}
        <div className="mt-6 mb-6 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs text-emerald-700 tracking-wider font-semibold mb-2">
              CAPTAIN · ORGANIZATION
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
            <div className="mt-1 text-sm text-stone-600">
              {org.type ? <span className="capitalize">{org.type}</span> : null}
              {org.type && org.college ? <span className="mx-2 text-stone-300">·</span> : null}
              {org.college}
            </div>
          </div>
          <div className="flex flex-col items-end">
            <StatusPill status={org.status} />
            <div className="mt-2 text-[11px] text-stone-500 tracking-wider">
              {acceptedCount} accepted · {pendingCount} pending
            </div>
          </div>
        </div>

        {/* Tab nav */}
        <div className="border-b border-stone-200 mb-6">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => {
              const active = t.id === tab
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTab(t.id)}
                  disabled={t.pending}
                  className={`px-4 py-2.5 text-sm font-semibold tracking-wider transition border-b-2 -mb-[2px] ${
                    active
                      ? 'border-emerald-600 text-emerald-700'
                      : t.pending
                        ? 'border-transparent text-stone-400 cursor-not-allowed'
                        : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
                  }`}
                >
                  {t.label}
                  {t.pending && (
                    <span className="ml-2 text-[9px] tracking-[0.15em] font-bold text-stone-400">
                      SOON
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab content */}
        {tab === 'members' && (
          <MembersTab orgId={org.id} initialInvitations={initialInvitations} />
        )}

        {tab === 'seats' && <SeatsPlaceholder />}

        {tab === 'treasury' && <TreasuryShortcut />}

        {tab === 'bot' && <BotPlaceholder />}

        {tab === 'settings' && <SettingsPlaceholder />}
      </div>
    </main>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: {
      label: 'PENDING REVIEW',
      cls: 'bg-amber-100 text-amber-800 ring-amber-300',
    },
    approved: {
      label: 'APPROVED',
      cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
    },
    active: {
      label: 'ACTIVE',
      cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
    },
    rejected: {
      label: 'REJECTED',
      cls: 'bg-red-100 text-red-800 ring-red-300',
    },
  }
  const meta = map[status] ?? { label: status.toUpperCase(), cls: 'bg-stone-100 text-stone-700 ring-stone-300' }
  return (
    <span
      className={`text-[10px] tracking-[0.15em] font-bold px-2.5 py-1 rounded-full ring-1 ${meta.cls}`}
    >
      {meta.label}
    </span>
  )
}

function SeatsPlaceholder() {
  return (
    <div className="rounded-lg ring-1 ring-stone-200 bg-white p-8 text-center">
      <div className="text-4xl mb-3">🪑</div>
      <h2 className="text-lg font-semibold text-stone-900 mb-2">Seat management — coming soon</h2>
      <p className="text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
        Inline seat upgrades, downgrades, and per-seat billing. For now, your tier
        includes 25 seats; need more? <a className="text-emerald-700 underline" href="mailto:desk@sneakersterminal.com">Contact us</a>.
      </p>
    </div>
  )
}

function TreasuryShortcut() {
  return (
    <div className="rounded-lg ring-1 ring-stone-200 bg-white p-6">
      <h2 className="text-lg font-semibold mb-2">Chapter Treasury</h2>
      <p className="text-sm text-stone-600 mb-4 leading-relaxed">
        The chapter treasury setup lives at <code className="bg-stone-100 px-1 rounded text-xs">/dashboard/treasury</code>.
        Captain configures a Safe multisig on Polygon (3-5 officers as signers); the
        wallet is what your group bot uses for Polymarket execution.
      </p>
      <Link
        href="/dashboard/treasury"
        className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold tracking-wider px-5 py-2.5 rounded transition"
      >
        OPEN TREASURY SETTINGS →
      </Link>
    </div>
  )
}

function BotPlaceholder() {
  return (
    <div className="rounded-lg ring-1 ring-stone-200 bg-white p-8 text-center">
      <div className="text-4xl mb-3">⚡</div>
      <h2 className="text-lg font-semibold text-stone-900 mb-2">Group bot — shipping with autotrade</h2>
      <p className="text-sm text-stone-600 max-w-md mx-auto leading-relaxed mb-4">
        Once autotrade ships, your chapter gets a shared bot configured by you, executing
        on the Safe treasury, with optional captain-approval for trades over a threshold.
        Members see fills + P&amp;L in real time.
      </p>
      <Link
        href="/dashboard/settings/autotrade"
        className="inline-block bg-stone-100 hover:bg-stone-200 text-stone-900 text-xs font-semibold tracking-wider px-5 py-2.5 rounded transition"
      >
        Join the autotrade waitlist →
      </Link>
    </div>
  )
}

function SettingsPlaceholder() {
  return (
    <div className="rounded-lg ring-1 ring-stone-200 bg-white p-8 text-center">
      <div className="text-4xl mb-3">⚙</div>
      <h2 className="text-lg font-semibold text-stone-900 mb-2">Settings — coming soon</h2>
      <p className="text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
        Captain transfer, group description, notification prefs, disband. Until these
        ship, email <a className="text-emerald-700 underline" href="mailto:desk@sneakersterminal.com">desk@sneakersterminal.com</a> for changes.
      </p>
    </div>
  )
}
