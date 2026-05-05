import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import {
  ASSET_EMOJI,
  SIZE_LABEL,
  VENUE_NAME,
  cashFor,
  fmtCountdown,
  generateSchedule,
  type Tournament,
  type TournamentStatus,
} from '@/lib/horse-race-schedule'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Tournaments — Admin — Sneakers Terminal',
}

// Read-only ops view of the rolling Crypto Horse Race schedule.
//
// v1 limits, surfaced in the page copy: the schedule is generated
// client-side from a hardcoded cadence array (apps/platform/src/lib/
// horse-race-schedule.ts) — there is no `tournaments` DB table yet,
// so we can't pause / cancel / refund a specific round from this UI.
// Once we wire the table, this page grows admin actions per row.

const VISIBLE = 30

const STATUS_PILL: Record<TournamentStatus, { label: string; cls: string }> = {
  waiting: { label: 'WAITING', cls: 'bg-stone-100 text-stone-700 ring-stone-300' },
  locked: { label: 'LOCKED', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
  underfilled: { label: 'UNDERFILLED', cls: 'bg-amber-100 text-amber-800 ring-amber-300' },
  starting: { label: 'STARTING', cls: 'bg-rose-100 text-rose-800 ring-rose-300 animate-pulse' },
  live: { label: 'LIVE', cls: 'bg-rose-600 text-white ring-rose-700' },
  resolved: { label: 'RESOLVED', cls: 'bg-stone-200 text-stone-700 ring-stone-300' },
}

export default async function TournamentsAdminPage() {
  await requireAdmin()
  const all = generateSchedule(new Date())
  const upcoming = all.slice(0, VISIBLE)

  // Derive admin-useful summary numbers from the visible window.
  const liveCount = all.filter((t) => t.status === 'live' || t.status === 'starting').length
  const lockedCount = all.filter((t) => t.status === 'locked').length
  const underfilledCount = all.filter((t) => t.status === 'underfilled').length
  const totalRegistered = upcoming.reduce((s, t) => s + t.registered, 0)
  const totalCap = upcoming.reduce((s, t) => s + t.cap, 0)
  const fillPct = totalCap > 0 ? Math.round((totalRegistered / totalCap) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} TOURNAMENTS</div>
        <h1 className="text-2xl font-bold text-stone-900">
          {all.length}{' '}
          <span className="text-stone-500 text-base font-normal">
            in rolling window · {liveCount} live · {lockedCount} locked · {underfilledCount} underfilled
          </span>
        </h1>
        <p className="text-sm text-stone-600 mt-1 max-w-2xl">
          Read-only ops view of the Crypto Horse Race schedule. The cadence (assets, durations, sizes,
          buy-ins, settlement venue) lives in <code className="bg-stone-100 px-1">lib/horse-race-schedule.ts</code>.
          Edit there + redeploy to change what rounds the lobby spins up.
        </p>
        <p className="text-sm text-stone-500 mt-1 max-w-2xl">
          v1 caveat: there is no <code className="bg-stone-100 px-1">tournaments</code> DB table yet, so
          this page can't pause / cancel / refund individual rounds. When that table lands, per-row admin
          actions (force-resolve, refund, comp seats) attach here.
        </p>
      </div>

      {/* Summary tile — at-a-glance fill across the window */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <SummaryStat
          label="Window"
          value={`${upcoming.length} rounds`}
          sub={all.length > upcoming.length ? `of ${all.length} generated` : undefined}
        />
        <SummaryStat label="Total fill" value={`${totalRegistered}/${totalCap}`} sub={`${fillPct}%`} />
        <SummaryStat label="Locked + ready" value={`${lockedCount}`} sub="will run" />
        <SummaryStat
          label="Underfilled"
          value={`${underfilledCount}`}
          sub="would refund"
          tone={underfilledCount > 0 ? 'warn' : 'ok'}
        />
      </div>

      <div className="border border-stone-300 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-100 text-stone-600 tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 w-24">STARTS IN</th>
              <th className="text-left px-3 py-2 w-32">FLAVOR</th>
              <th className="text-left px-3 py-2 w-24">SIZE</th>
              <th className="text-left px-3 py-2 w-20">DURATION</th>
              <th className="text-left px-3 py-2 w-20">MODE</th>
              <th className="text-left px-3 py-2 w-24">VENUE</th>
              <th className="text-right px-3 py-2 w-20">BUY-IN</th>
              <th className="text-right px-3 py-2 w-20">CASH</th>
              <th className="text-right px-3 py-2 w-24">FILL</th>
              <th className="text-right px-3 py-2 w-28">PRIZE POOL</th>
              <th className="text-left px-3 py-2 w-28">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((t) => (
              <TournamentAdminRow key={t.id} t={t} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-stone-500 max-w-2xl">
        Refresh the page to advance the schedule — the rolling window is regenerated from the server clock
        on every render. The consumer dashboard's Tournaments tile and the live lobby tick once per second
        client-side from the same cadence config.
      </div>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'ok' | 'warn'
}) {
  const valueCls = tone === 'warn' ? 'text-amber-700' : 'text-stone-900'
  return (
    <div className="border border-stone-300 bg-white p-3">
      <div className="text-[10px] tracking-wider text-stone-500 font-bold uppercase">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${valueCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-stone-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function TournamentAdminRow({ t }: { t: Tournament }) {
  const startsLabel = t.startsInSec === 0 ? 'NOW' : fmtCountdown(t.startsInSec)
  const status = STATUS_PILL[t.status]
  const fillPct = Math.min(100, Math.round((t.registered / t.cap) * 100))
  const pool = t.buyInUsd * 0.9 * t.cap
  const urgent = t.startsInSec > 0 && t.startsInSec <= 30

  return (
    <tr className="border-t border-stone-200 align-middle">
      <td className={`px-3 py-2 font-mono tabular-nums whitespace-nowrap ${urgent ? 'text-rose-700 font-bold' : 'text-stone-700'}`}>
        {startsLabel}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span aria-hidden className="mr-1.5">{ASSET_EMOJI[t.asset]}</span>
        <span className="font-semibold text-stone-900">{t.flavor}</span>
      </td>
      <td className="px-3 py-2 text-stone-700 whitespace-nowrap">{SIZE_LABEL[t.size]}</td>
      <td className="px-3 py-2 text-stone-700 whitespace-nowrap">{t.durationMin}min</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span
          className={`text-[10px] tracking-wider px-1.5 py-0.5 rounded font-bold ${
            t.mode === 'autobot'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-stone-100 text-stone-700'
          }`}
        >
          {t.mode === 'autobot' ? '🤖 BOT' : 'MANUAL'}
        </span>
      </td>
      <td className="px-3 py-2 text-stone-700 whitespace-nowrap">
        <Link
          href={`/affiliates`}
          className="text-stone-700 hover:text-[#00703c] hover:underline"
          title="Edit affiliate link for this venue"
        >
          {VENUE_NAME[t.venue]}
        </Link>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-900">${t.buyInUsd}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">
        ${cashFor(t.buyInUsd).toFixed(2)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
        <span className={t.registered >= t.cap ? 'text-emerald-700 font-bold' : 'text-stone-700'}>
          {t.registered}/{t.cap}
        </span>
        <span className="text-stone-400 ml-1">({fillPct}%)</span>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-900">${pool.toFixed(0)}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span
          className={`inline-block text-[10px] tracking-wider px-1.5 py-0.5 ring-1 font-bold ${status.cls}`}
        >
          {status.label}
        </span>
      </td>
    </tr>
  )
}
