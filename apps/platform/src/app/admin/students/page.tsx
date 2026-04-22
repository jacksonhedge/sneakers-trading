import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'
import { StudentReviewActions } from './review-actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

interface Row {
  id: string
  edu_email: string
  instagram_handle: string
  linkedin_url: string
  university_name: string | null
  university_domain: string | null
  grad_year: number
  status: string
  submitted_at: string
  verified_at: string | null
  verified_by: string | null
  rejection_reason: string | null
  expires_at: string | null
}

function fmt(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16)
}

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>
}) {
  const sp = await searchParams
  const tab: 'pending' | 'approved' | 'rejected' = (
    sp.tab === 'approved' || sp.tab === 'rejected' ? sp.tab : 'pending'
  )
  const pageNum = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const offset = (pageNum - 1) * PAGE_SIZE

  const sb = getServerClient()
  const [{ data: rows, count }, { data: counts }] = await Promise.all([
    sb
      .from('student_verification')
      .select('*', { count: 'exact' })
      .eq('status', tab)
      .order('submitted_at', { ascending: tab === 'pending' })
      .range(offset, offset + PAGE_SIZE - 1),
    sb.from('student_verification').select('status'),
  ])

  const tabCounts = (counts as { status: string }[] | null)?.reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    { pending: 0, approved: 0, rejected: 0 },
  ) ?? { pending: 0, approved: 0, rejected: 0 }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
  const list = (rows ?? []) as Row[]

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Student verifications</h1>
        <p className="text-sm text-stone-600 mt-2">
          Approve or reject pending submissions. Approved users get the 75% Stripe coupon
          attached server-side at Pro/Elite checkout.
        </p>
      </div>

      <nav className="flex items-center gap-1 border-b border-stone-200">
        <TabLink current={tab} value="pending" label={`Pending (${tabCounts.pending ?? 0})`} />
        <TabLink current={tab} value="approved" label={`Approved (${tabCounts.approved ?? 0})`} />
        <TabLink current={tab} value="rejected" label={`Rejected (${tabCounts.rejected ?? 0})`} />
      </nav>

      {list.length === 0 ? (
        <div className="rounded border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          No {tab} submissions.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <RowCard key={r.id} row={r} tab={tab} />
          ))}
        </div>
      )}

      {totalPages > 1 && <Paginator tab={tab} page={pageNum} totalPages={totalPages} />}
    </main>
  )
}

function TabLink({ current, value, label }: { current: string; value: string; label: string }) {
  const active = current === value
  return (
    <Link
      href={`/admin/students?tab=${value}`}
      className={`px-4 py-2 text-xs tracking-wider font-semibold border-b-2 ${
        active
          ? 'border-stone-900 text-stone-900'
          : 'border-transparent text-stone-500 hover:text-stone-700'
      }`}
    >
      {label}
    </Link>
  )
}

function RowCard({ row, tab }: { row: Row; tab: 'pending' | 'approved' | 'rejected' }) {
  const igUrl = `https://www.instagram.com/${row.instagram_handle}`
  const liUrl = row.linkedin_url
  const isUnknownDomain = !row.university_name && row.university_domain
  return (
    <div className="rounded border border-stone-200 bg-white p-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-7 space-y-2">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-mono text-sm text-stone-900">{row.edu_email}</span>
          {row.university_name && (
            <span className="text-xs text-stone-600">{row.university_name}</span>
          )}
          {isUnknownDomain && (
            <span className="text-[10px] tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
              UNKNOWN .EDU
            </span>
          )}
          <span className="text-xs text-stone-400">class of {row.grad_year}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-stone-400 tracking-wider mb-0.5">INSTAGRAM</div>
            <a
              href={igUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 hover:underline font-mono"
            >
              @{row.instagram_handle} ↗
            </a>
          </div>
          <div>
            <div className="text-stone-400 tracking-wider mb-0.5">LINKEDIN</div>
            <a
              href={liUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 hover:underline break-all"
            >
              {liUrl.length > 50 ? liUrl.slice(0, 50) + '…' : liUrl} ↗
            </a>
          </div>
        </div>

        <div className="text-[11px] text-stone-500 mt-2 flex items-center gap-3 flex-wrap">
          <span>submitted {fmt(row.submitted_at)}</span>
          {tab !== 'pending' && row.verified_at && (
            <>
              <span>·</span>
              <span>
                {tab === 'approved' ? 'approved' : 'rejected'} {fmt(row.verified_at)}
                {row.verified_by ? ` by ${row.verified_by}` : ''}
              </span>
            </>
          )}
          {tab === 'rejected' && row.rejection_reason && (
            <>
              <span>·</span>
              <span className="text-red-700">reason: {row.rejection_reason}</span>
            </>
          )}
          {tab === 'approved' && row.expires_at && (
            <>
              <span>·</span>
              <span>expires {fmt(row.expires_at)}</span>
            </>
          )}
        </div>
      </div>

      {tab === 'pending' && (
        <div className="lg:col-span-5 flex items-center justify-end">
          <StudentReviewActions id={row.id} />
        </div>
      )}
    </div>
  )
}

function Paginator({ tab, page, totalPages }: { tab: string; page: number; totalPages: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <Link
        href={`/admin/students?tab=${tab}&page=${Math.max(1, page - 1)}`}
        className={`px-3 py-1.5 rounded border border-stone-300 ${
          page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-stone-50'
        }`}
      >
        ← PREV
      </Link>
      <span className="text-stone-500">
        Page {page} of {totalPages}
      </span>
      <Link
        href={`/admin/students?tab=${tab}&page=${Math.min(totalPages, page + 1)}`}
        className={`px-3 py-1.5 rounded border border-stone-300 ${
          page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-stone-50'
        }`}
      >
        NEXT →
      </Link>
    </div>
  )
}
