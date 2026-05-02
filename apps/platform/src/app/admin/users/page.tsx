import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'
import { ApproveButton } from './approve-button'

export const dynamic = 'force-dynamic'

type Status = 'all' | 'waitlist' | 'invited' | 'authed'
type Tier = 'all' | 'free' | 'pro' | 'elite' | 'business'
type AccountType = 'all' | 'individual' | 'business'
// Sort options. created_at is the cheap default (covered by the existing
// table index). last_login is computed in JS after merging waitlist rows
// with auth.users (no DB index — at small user counts this is fine).
type SortKey = 'newest' | 'oldest' | 'last_login'

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
  searchParams: Promise<{
    q?: string
    status?: Status
    tier?: Tier
    type?: AccountType
    country?: string
    sort?: SortKey
    page?: string
  }>
}) {
  const sp = await searchParams
  const rawQ = (sp.q ?? '').trim().toLowerCase()
  // Restrict the search input to a safe charset before it's interpolated
  // into a PostgREST .or() filter string. Disallowed chars (',', '(', ')',
  // '.', operators) could otherwise rewrite the query (audit LOW #8).
  // Allow + and . here so company names and emails like "Jane Co +" search
  // correctly; still no quote/paren/comma/operator chars.
  const q = rawQ.replace(/[^a-z0-9@_+.\- ]/gi, '').slice(0, 64).trim()
  const status: Status = sp.status ?? 'all'
  const tier: Tier =
    sp.tier && ['free', 'pro', 'elite', 'business'].includes(sp.tier as string)
      ? (sp.tier as Tier)
      : 'all'
  const accountType: AccountType =
    sp.type && ['individual', 'business'].includes(sp.type as string)
      ? (sp.type as AccountType)
      : 'all'
  // Country filter: 2-letter ISO code, uppercased. Sanitize to A-Z so it
  // can't escape into the eq() value.
  const country = (sp.country ?? '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase()
  const sort: SortKey =
    sp.sort && ['newest', 'oldest', 'last_login'].includes(sp.sort as string)
      ? (sp.sort as SortKey)
      : 'newest'
  const pageNum = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const pageSize = 50

  const admin = getServerClient()
  let query = admin
    .from('waitlist')
    .select(
      'id, email, created_at, ip_country, referral_code, direct_referrals, indirect_referrals, invite_code, invited_at, invite_used_at, referred_by_code, account_type, company_name, plan_tier',
      { count: 'exact' },
    )
    // For last_login sort we still order by created_at at the DB level —
    // the JS-side re-sort happens after merging with auth.users. For the
    // other two we hit the index directly.
    .order('created_at', { ascending: sort === 'oldest' })

  if (q) {
    // Same sanitized term used in every clause; only the suffix changes
    // because some columns are upper (codes) and some are lower (emails,
    // company names).
    const lower = q
    const upper = q.toUpperCase()
    query = query.or(
      `email.ilike.%${lower}%,company_name.ilike.%${lower}%,referral_code.ilike.%${upper}%,invite_code.ilike.%${upper}%`,
    )
  }
  // Status buckets are keyed off invite_used_at FIRST, then invite_code.
  // Open-signup users (source='open_signup') land with invite_code=null
  // but invite_used_at set — they're AUTHED, not WAITLIST. Filtering on
  // invite_code alone leaks them into the waitlist view.
  if (status === 'waitlist') {
    query = query.is('invite_code', null).is('invite_used_at', null)
  } else if (status === 'invited') {
    query = query.not('invite_code', 'is', null).is('invite_used_at', null)
  } else if (status === 'authed') {
    query = query.not('invite_used_at', 'is', null)
  }
  if (tier !== 'all') {
    query = query.eq('plan_tier', tier)
  }
  if (accountType !== 'all') {
    query = query.eq('account_type', accountType)
  }
  if (country) {
    query = query.eq('ip_country', country)
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

  const baseRows = (data ?? []) as Row[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pastLastPage = rangeError || (baseRows.length === 0 && pageNum > totalPages)

  // Merge in auth.users so we can show last login + sort by it. listUsers
  // returns up to perPage at a time; one page covers the entire user base
  // until we cross 200, at which point we'll switch to pagination here.
  const { data: authData } = await admin.auth.admin
    .listUsers({ page: 1, perPage: 200 })
    .catch(() => ({ data: { users: [] } }))
  const authByEmail = new Map<string, { lastSignInAt: string | null; userId: string }>()
  for (const u of authData?.users ?? []) {
    if (u.email) {
      authByEmail.set(u.email.toLowerCase(), {
        lastSignInAt: (u.last_sign_in_at as string | null) ?? null,
        userId: u.id,
      })
    }
  }

  type EnrichedRow = Row & {
    lastSignInAt: string | null
    hasAuthUser: boolean
  }
  const enriched: EnrichedRow[] = baseRows.map((r) => {
    const a = authByEmail.get(r.email.toLowerCase())
    return {
      ...r,
      lastSignInAt: a?.lastSignInAt ?? null,
      hasAuthUser: Boolean(a),
    }
  })

  // Last-login sort happens here (post-merge). Nulls (never-signed-in)
  // sink to the bottom regardless of direction.
  if (sort === 'last_login') {
    enriched.sort((a, b) => {
      if (!a.lastSignInAt && !b.lastSignInAt) return 0
      if (!a.lastSignInAt) return 1
      if (!b.lastSignInAt) return -1
      return b.lastSignInAt.localeCompare(a.lastSignInAt)
    })
  }
  const rows = enriched

  const buildUrl = (
    overrides: Partial<{
      q: string
      status: Status
      tier: Tier
      type: AccountType
      country: string
      sort: SortKey
      page: number
    }>,
  ) => {
    const params = new URLSearchParams()
    const qv = overrides.q ?? q
    const sv = overrides.status ?? status
    const tv = overrides.tier ?? tier
    const tyv = overrides.type ?? accountType
    const cv = overrides.country ?? country
    const sov = overrides.sort ?? sort
    const pv = overrides.page ?? pageNum
    if (qv) params.set('q', qv)
    if (sv && sv !== 'all') params.set('status', sv)
    if (tv && tv !== 'all') params.set('tier', tv)
    if (tyv && tyv !== 'all') params.set('type', tyv)
    if (cv) params.set('country', cv)
    if (sov && sov !== 'newest') params.set('sort', sov)
    if (pv > 1) params.set('page', String(pv))
    const qs = params.toString()
    return `/users${qs ? '?' + qs : ''}`
  }

  const statusOptions: Status[] = ['all', 'waitlist', 'invited', 'authed']
  const tierOptions: Tier[] = ['all', 'free', 'pro', 'elite', 'business']
  const typeOptions: AccountType[] = ['all', 'individual', 'business']
  const sortOptions: Array<{ value: SortKey; label: string }> = [
    { value: 'newest', label: 'NEWEST' },
    { value: 'oldest', label: 'OLDEST' },
    { value: 'last_login', label: 'LAST LOGIN' },
  ]
  const hasAnyFilter =
    q || status !== 'all' || tier !== 'all' || accountType !== 'all' || country || sort !== 'newest'

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} USERS</div>
          <h1 className="text-2xl font-bold text-stone-900">
            {total.toLocaleString()} <span className="text-stone-500 text-base font-normal">rows</span>
          </h1>
        </div>
        <form method="GET" action="/users" className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="email, company, referral code, invite code"
            className="border border-stone-300 px-3 py-1.5 text-sm w-72"
          />
          <input
            type="text"
            name="country"
            defaultValue={country}
            placeholder="country (US)"
            maxLength={2}
            className="border border-stone-300 px-3 py-1.5 text-sm w-24 uppercase"
          />
          {/* Preserve other filters across the search submit */}
          {status !== 'all' && <input type="hidden" name="status" value={status} />}
          {tier !== 'all' && <input type="hidden" name="tier" value={tier} />}
          {accountType !== 'all' && <input type="hidden" name="type" value={accountType} />}
          <button className="bg-[#00703c] text-white text-xs px-3 py-1.5 tracking-wider">
            SEARCH
          </button>
          {hasAnyFilter && (
            <Link
              href="/users"
              className="text-xs text-stone-600 hover:underline ml-1 self-center"
            >
              clear
            </Link>
          )}
        </form>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-stone-500 tracking-wider w-16">STATUS</span>
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
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-stone-500 tracking-wider w-16">TIER</span>
          {tierOptions.map((opt) => (
            <Link
              key={opt}
              href={buildUrl({ tier: opt, page: 1 })}
              className={`px-3 py-1.5 tracking-wider border ${
                tier === opt
                  ? 'bg-[#00703c] text-white border-[#00703c]'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
              }`}
            >
              {opt.toUpperCase()}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-stone-500 tracking-wider w-16">TYPE</span>
          {typeOptions.map((opt) => (
            <Link
              key={opt}
              href={buildUrl({ type: opt, page: 1 })}
              className={`px-3 py-1.5 tracking-wider border ${
                accountType === opt
                  ? 'bg-[#00703c] text-white border-[#00703c]'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
              }`}
            >
              {opt.toUpperCase()}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-stone-500 tracking-wider w-16">SORT</span>
          {sortOptions.map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ sort: opt.value, page: 1 })}
              className={`px-3 py-1.5 tracking-wider border ${
                sort === opt.value
                  ? 'bg-[#00703c] text-white border-[#00703c]'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
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
              <th className="text-left px-3 py-2">LAST LOGIN</th>
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
                  <td className="px-3 py-2 text-stone-600">
                    {r.lastSignInAt ? (
                      fmt(r.lastSignInAt)
                    ) : r.hasAuthUser ? (
                      <span className="text-stone-400 italic">never</span>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-2 justify-end">
                      <ApproveButton userId={r.id} approved={Boolean(r.invite_used_at)} />
                      <Link href={`/users/${r.id}`} className="text-[#00703c] hover:underline">
                        view →
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-stone-500">
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
          {/* Clamp displayed page to total when the user typed an out-of-range
              ?page=N — avoids "Page 999 of 1" and similar weirdness. */}
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
