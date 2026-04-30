import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Status = 'all' | 'waitlist' | 'invited' | 'authed'

type Row = {
  id: string
  email: string
  created_at: string
  ip_country: string | null
  referral_code: string | null
  direct_referrals: number
  indirect_referrals: number
  invite_code: string | null
  invited_at: string | null
  invite_used_at: string | null
  referred_by_code: string | null
  account_type: 'individual' | 'business' | null
  company_name: string | null
  plan_tier: 'free' | 'pro' | 'elite' | 'business' | null
}

const PLAN_TIER_CLS: Record<string, string> = {
  free: 'bg-stone-200 text-stone-700',
  pro: 'bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-400/40',
  elite: 'bg-amber-500/20 text-amber-700 ring-1 ring-amber-400/40',
  business: 'bg-violet-500/20 text-violet-700 ring-1 ring-violet-400/40',
}

function fmt(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toISOString().replace('T', ' ').slice(0, 16)
}

function statusOf(r: Row): { label: string; cls: string } {
  if (r.invite_used_at) return { label: 'AUTHED', cls: 'bg-[#00703c] text-white' }
  if (r.invite_code) return { label: 'INVITED', cls: 'bg-amber-500 text-white' }
  return { label: 'WAITLIST', cls: 'bg-stone-400 text-white' }
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: Status; page?: string }>
}) {
  const sp = await searchParams
  const rawQ = (sp.q ?? '').trim().toLowerCase()
  // Restrict the search input to a safe charset before it's interpolated
  // into a PostgREST .or() filter string. Disallowed chars (',', '(', ')',
  // '.', operators) could otherwise rewrite the query (audit LOW #8).
  const q = rawQ.replace(/[^a-z0-9@_-]/gi, '').slice(0, 64)
  const status: Status = sp.status ?? 'all'
  const pageNum = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const pageSize = 50

  const admin = getServerClient()
  let query = admin
    .from('waitlist')
    .select(
      'id, email, created_at, ip_country, referral_code, direct_referrals, indirect_referrals, invite_code, invited_at, invite_used_at, referred_by_code, account_type, company_name, plan_tier',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })

  if (q) {
    query = query.or(
      `email.ilike.%${q}%,referral_code.ilike.%${q.toUpperCase()}%,invite_code.ilike.%${q.toUpperCase()}%`,
    )
  }
  if (status === 'waitlist') {
    query = query.is('invite_code', null)
  } else if (status === 'invited') {
    query = query.not('invite_code', 'is', null).is('invite_used_at', null)
  } else if (status === 'authed') {
    query = query.not('invite_used_at', 'is', null)
  }

  const from = (pageNum - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query

  // PostgREST returns "Requested range not satisfiable" when ?page is past
  // the last page. Silently treat that as an empty page rather than leaking
  // the raw error string. Any OTHER error (real query failure) still shows.
  const rangeError =
    error && /range not satisfiable|requested range/i.test(error.message)
  if (error && !rangeError) {
    return (
      <div className="border border-red-400 bg-red-50 p-4 text-sm text-red-800">
        Couldn&apos;t load users right now. Try a refresh; if it sticks, check the
        admin system page.
      </div>
    )
  }

  const rows = (data ?? []) as Row[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pastLastPage = rangeError || (rows.length === 0 && pageNum > totalPages)

  const buildUrl = (overrides: Partial<{ q: string; status: Status; page: number }>) => {
    const params = new URLSearchParams()
    const qv = overrides.q ?? q
    const sv = overrides.status ?? status
    const pv = overrides.page ?? pageNum
    if (qv) params.set('q', qv)
    if (sv && sv !== 'all') params.set('status', sv)
    if (pv > 1) params.set('page', String(pv))
    const qs = params.toString()
    return `/admin/users${qs ? '?' + qs : ''}`
  }

  const statusOptions: Status[] = ['all', 'waitlist', 'invited', 'authed']

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} USERS</div>
          <h1 className="text-2xl font-bold text-stone-900">
            {total.toLocaleString()} <span className="text-stone-500 text-base font-normal">rows</span>
          </h1>
        </div>
        <form method="GET" action="/admin/users" className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="email, referral code, invite code"
            className="border border-stone-300 px-3 py-1.5 text-sm w-72"
          />
          {status !== 'all' && <input type="hidden" name="status" value={status} />}
          <button className="bg-[#00703c] text-white text-xs px-3 py-1.5 tracking-wider">
            SEARCH
          </button>
        </form>
      </div>

      <div className="flex gap-1 text-xs">
        {statusOptions.map((opt) => (
          <Link
            key={opt}
            href={buildUrl({ status: opt, page: 1 })}
            className={`px-3 py-1.5 tracking-wider border ${
              status === opt
                ? 'bg-[#00703c] text-white border-[#00703c]'
                : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
            }`}
          >
            {opt.toUpperCase()}
          </Link>
        ))}
      </div>

      <div className="border border-stone-300 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-100 text-stone-600 tracking-wider">
            <tr>
              <th className="text-left px-3 py-2">EMAIL</th>
              <th className="text-left px-3 py-2">STATUS</th>
              <th className="text-left px-3 py-2">TYPE</th>
              <th className="text-left px-3 py-2">PLAN</th>
              <th className="text-left px-3 py-2">REF CODE</th>
              <th className="text-right px-3 py-2">DIR/IND</th>
              <th className="text-left px-3 py-2">GEO</th>
              <th className="text-left px-3 py-2">JOINED</th>
              <th className="text-left px-3 py-2">INVITED</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = statusOf(r)
              const isBiz = r.account_type === 'business'
              const planCls = PLAN_TIER_CLS[r.plan_tier ?? 'free'] ?? PLAN_TIER_CLS.free
              return (
                <tr key={r.id} className="border-t border-stone-200 hover:bg-stone-50">
                  <td className="px-3 py-2 font-mono text-stone-900">
                    {r.email}
                    {isBiz && r.company_name && (
                      <div className="text-[10px] text-stone-500 font-sans">{r.company_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 text-[10px] tracking-wider ${s.cls}`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {isBiz ? (
                      <span className="inline-block px-2 py-0.5 text-[10px] tracking-wider bg-violet-500/20 text-violet-700 ring-1 ring-violet-400/40">
                        BUSINESS
                      </span>
                    ) : (
                      <span className="text-stone-400">individual</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 text-[10px] tracking-wider ${planCls}`}>
                      {(r.plan_tier ?? 'free').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-stone-700">{r.referral_code ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.direct_referrals}/{r.indirect_referrals}
                  </td>
                  <td className="px-3 py-2 text-stone-600">{r.ip_country ?? '—'}</td>
                  <td className="px-3 py-2 text-stone-600">{fmt(r.created_at)}</td>
                  <td className="px-3 py-2 text-stone-600">{fmt(r.invited_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/admin/users/${r.id}`} className="text-[#00703c] hover:underline">
                      view →
                    </Link>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-stone-500">
                  {pastLastPage ? (
                    <>
                      Page {pageNum} is past the last page ({totalPages}).{' '}
                      <Link href={buildUrl({ page: 1 })} className="text-[#00703c] underline">
                        Jump to page 1
                      </Link>
                      .
                    </>
                  ) : (
                    'No users match these filters.'
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between text-xs text-stone-600">
        <div>
          Page {pageNum} of {totalPages}
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
