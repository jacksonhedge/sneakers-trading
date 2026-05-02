import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  ts: string
  actor_email: string
  action: string
  target_kind: string | null
  target_email: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
}

const ACTION_CLS: Record<string, string> = {
  grant_access: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  issue_invite: 'bg-amber-100 text-amber-800 ring-amber-300',
  reissue_invite: 'bg-amber-100 text-amber-800 ring-amber-300',
  revoke_invite: 'bg-red-100 text-red-800 ring-red-300',
  cleanup_stress_emails: 'bg-violet-100 text-violet-800 ring-violet-300',
  adjust_credits: 'bg-violet-100 text-violet-800 ring-violet-300',
  set_user_tier: 'bg-sky-100 text-sky-800 ring-sky-300',
}

function fmt(ts: string): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19)
}

function safeStr(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; target?: string; action?: string; page?: string }>
}) {
  const sp = await searchParams
  const actorRaw = (sp.actor ?? '').trim().toLowerCase()
  const targetRaw = (sp.target ?? '').trim().toLowerCase()
  const actionRaw = (sp.action ?? '').trim()
  // Same input-sanitization pattern as the users page — restrict to a safe
  // charset before interpolating into a PostgREST .ilike() filter.
  const actor = actorRaw.replace(/[^a-z0-9@_+.-]/gi, '').slice(0, 80)
  const target = targetRaw.replace(/[^a-z0-9@_+.-]/gi, '').slice(0, 80)
  const action = actionRaw.replace(/[^a-z0-9_]/gi, '').slice(0, 40)
  const pageNum = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const pageSize = 100

  const admin = getServerClient()
  let query = admin
    .from('admin_audit_events')
    .select('id, ts, actor_email, action, target_kind, target_email, target_id, metadata, ip', {
      count: 'exact',
    })
    .order('ts', { ascending: false })

  if (actor) query = query.ilike('actor_email', `%${actor}%`)
  if (target) query = query.ilike('target_email', `%${target}%`)
  if (action) query = query.eq('action', action)

  const from = (pageNum - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query

  const rangeError =
    error && /range not satisfiable|requested range/i.test(error.message)
  if (error && !rangeError) {
    return (
      <div className="border border-red-400 bg-red-50 p-4 text-sm text-red-800">
        Couldn&apos;t load audit events.
      </div>
    )
  }

  const rows = (data ?? []) as Row[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pastLastPage = rangeError || (rows.length === 0 && pageNum > totalPages)

  // Distinct actions list, used to render quick-filter chips. Cheap because
  // the admin_audit_events_action_ts_idx index covers it.
  const { data: actionsData } = await admin
    .from('admin_audit_events')
    .select('action')
    .limit(500)
  const distinctActions = Array.from(
    new Set((actionsData ?? []).map((r) => r.action as string)),
  ).sort()

  const buildUrl = (overrides: Partial<{ actor: string; target: string; action: string; page: number }>) => {
    const params = new URLSearchParams()
    const av = overrides.actor ?? actor
    const tv = overrides.target ?? target
    const ac = overrides.action ?? action
    const pv = overrides.page ?? pageNum
    if (av) params.set('actor', av)
    if (tv) params.set('target', tv)
    if (ac) params.set('action', ac)
    if (pv > 1) params.set('page', String(pv))
    const qs = params.toString()
    return `/audit${qs ? '?' + qs : ''}`
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} ADMIN AUDIT</div>
        <h1 className="text-2xl font-bold text-stone-900">
          {total.toLocaleString()} <span className="text-stone-500 text-base font-normal">events</span>
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          Append-only log of every admin write action — grant / issue / revoke / cleanup. Inserts are
          server-side only via lib/admin-audit.ts; rows are never edited or deleted.
        </p>
      </div>

      <form method="GET" action="/audit" className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[10px] text-stone-500 tracking-wider mb-0.5">ACTOR</label>
          <input
            type="text"
            name="actor"
            defaultValue={actor}
            placeholder="actor email contains…"
            className="border border-stone-300 px-3 py-1.5 text-sm w-56"
          />
        </div>
        <div>
          <label className="block text-[10px] text-stone-500 tracking-wider mb-0.5">TARGET</label>
          <input
            type="text"
            name="target"
            defaultValue={target}
            placeholder="target email contains…"
            className="border border-stone-300 px-3 py-1.5 text-sm w-56"
          />
        </div>
        {action && <input type="hidden" name="action" value={action} />}
        <button className="bg-[#00703c] text-white text-xs px-3 py-1.5 tracking-wider">
          SEARCH
        </button>
        {(actor || target || action) && (
          <Link
            href="/audit"
            className="text-xs text-stone-600 hover:underline ml-2 self-center"
          >
            clear
          </Link>
        )}
      </form>

      {distinctActions.length > 0 && (
        <div className="flex flex-wrap gap-1 text-xs">
          <Link
            href={buildUrl({ action: '', page: 1 })}
            className={`px-3 py-1.5 tracking-wider border ${
              !action
                ? 'bg-[#00703c] text-white border-[#00703c]'
                : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
            }`}
          >
            ALL
          </Link>
          {distinctActions.map((a) => (
            <Link
              key={a}
              href={buildUrl({ action: a, page: 1 })}
              className={`px-3 py-1.5 tracking-wider border ${
                action === a
                  ? 'bg-[#00703c] text-white border-[#00703c]'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
              }`}
            >
              {a.toUpperCase()}
            </Link>
          ))}
        </div>
      )}

      <div className="border border-stone-300 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-100 text-stone-600 tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 w-44">WHEN</th>
              <th className="text-left px-3 py-2">ACTOR</th>
              <th className="text-left px-3 py-2 w-40">ACTION</th>
              <th className="text-left px-3 py-2">TARGET</th>
              <th className="text-left px-3 py-2">METADATA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cls = ACTION_CLS[r.action] ?? 'bg-stone-200 text-stone-700 ring-stone-300'
              return (
                <tr key={r.id} className="border-t border-stone-200 align-top">
                  <td className="px-3 py-2 font-mono text-stone-600 whitespace-nowrap">{fmt(r.ts)}</td>
                  <td className="px-3 py-2 font-mono text-stone-900">{r.actor_email}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] tracking-wider ring-1 ${cls}`}
                    >
                      {r.action.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-stone-700">
                    {r.target_email ?? r.target_id ?? r.target_kind ?? '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-stone-600 max-w-md truncate" title={safeStr(r.metadata)}>
                    {safeStr(r.metadata)}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-stone-500">
                  {pastLastPage ? (
                    <>
                      Page {pageNum} is past the last page ({totalPages}).{' '}
                      <Link href={buildUrl({ page: 1 })} className="text-[#00703c] underline">
                        Jump to page 1
                      </Link>
                      .
                    </>
                  ) : (
                    'No audit events match these filters.'
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between text-xs text-stone-600">
        <div>
          Page {Math.min(pageNum, totalPages)} of {totalPages}
        </div>
        <div className="flex gap-2">
          {pageNum > 1 && (
            <Link href={buildUrl({ page: pageNum - 1 })} className="border border-stone-300 px-3 py-1 hover:bg-stone-50">
              ← prev
            </Link>
          )}
          {pageNum < totalPages && (
            <Link href={buildUrl({ page: pageNum + 1 })} className="border border-stone-300 px-3 py-1 hover:bg-stone-50">
              next →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
