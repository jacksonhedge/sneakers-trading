import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import { getBalance } from '@/lib/credits'
import { UserActionPanel } from './action-panel'
import { AccountPanel } from './account-panel'

type AuditEvent = {
  id: string
  ts: string
  actor_email: string
  action: string
  metadata: Record<string, unknown> | null
}

type ClickEvent = {
  id: string
  ts: string
  event_name: string
  page: string | null
  target: string | null
  ip_country: string | null
  metadata: Record<string, unknown> | null
}

const EVENT_CLS: Record<string, string> = {
  page_view: 'bg-stone-100 text-stone-700 ring-stone-300',
}

const ACTION_CLS: Record<string, string> = {
  grant_access: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  issue_invite: 'bg-amber-100 text-amber-800 ring-amber-300',
  reissue_invite: 'bg-amber-100 text-amber-800 ring-amber-300',
  revoke_invite: 'bg-red-100 text-red-800 ring-red-300',
  adjust_credits: 'bg-violet-100 text-violet-800 ring-violet-300',
  set_user_tier: 'bg-sky-100 text-sky-800 ring-sky-300',
}

function fmtAudit(ts: string): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19)
}

function safeStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

export const dynamic = 'force-dynamic'

type WaitlistRow = {
  id: string
  email: string
  source: string | null
  referrer: string | null
  ip_country: string | null
  created_at: string
  referral_code: string | null
  referred_by_code: string | null
  direct_referrals: number
  indirect_referrals: number
  invite_code: string | null
  invited_at: string | null
  invite_used_at: string | null
  plan_tier: 'free' | 'pro' | 'elite' | 'business' | null
}

function fmt(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16)
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = getServerClient()

  const { data: row, error } = await admin
    .from('waitlist')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return (
      <div className="border border-red-400 bg-red-50 p-4 text-sm text-red-800">
        Lookup failed: {error.message}
      </div>
    )
  }
  if (!row) notFound()
  const user = row as WaitlistRow

  // Referral tree + audit history loaded in parallel.
  const [{ data: parent }, { data: children }, { data: auditRowsRaw }] = await Promise.all([
    user.referred_by_code
      ? admin
          .from('waitlist')
          .select('id, email, referral_code')
          .eq('referral_code', user.referred_by_code)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
    admin
      .from('waitlist')
      .select('id, email, referral_code, created_at, invite_used_at')
      .eq('referred_by_code', user.referral_code ?? '__none__')
      .order('created_at', { ascending: false }),
    admin
      .from('admin_audit_events')
      .select('id, ts, actor_email, action, metadata')
      .eq('target_email', user.email.toLowerCase())
      .order('ts', { ascending: false })
      .limit(50),
  ])
  const auditEvents = (auditRowsRaw ?? []) as AuditEvent[]

  // Resolve email → auth.users.id so we can pull the user's click_events.
  // listUsers is paginated; with a small user count (under a few hundred) one
  // page is fine. Switch to a server-side filter or a SQL view when this
  // starts paging beyond perPage.
  const { data: { users: authUsers = [] } = {} } = await admin.auth.admin
    .listUsers({ page: 1, perPage: 200 })
    .catch(() => ({ data: { users: [] } }))
  const targetEmailLower = user.email.toLowerCase()
  const authUser = authUsers.find((u) => u.email?.toLowerCase() === targetEmailLower) ?? null

  // Last 50 click_events for this user. Empty if they haven't authenticated
  // yet (no auth.users row → no user_id in click_events).
  const { data: clickRowsRaw } = authUser
    ? await admin
        .from('click_events')
        .select('id, ts, event_name, page, target, ip_country, metadata')
        .eq('user_id', authUser.id)
        .order('ts', { ascending: false })
        .limit(50)
    : { data: [] as ClickEvent[] }
  const clickEvents = (clickRowsRaw ?? []) as ClickEvent[]

  // Credit balance — bound to auth.users.id, so only fetchable for users
  // who've signed in at least once. Pre-auth users see a "no auth row" hint
  // in the credit panel.
  const creditBalance = authUser ? (await getBalance(authUser.id)).balance : 0

  // Grandchildren: children of children
  const childCodes = (children ?? [])
    .map((c) => c.referral_code)
    .filter((c): c is string => typeof c === 'string' && c.length > 0)

  const { data: grandchildren } = childCodes.length
    ? await admin
        .from('waitlist')
        .select('id, email, referral_code, referred_by_code, created_at, invite_used_at')
        .in('referred_by_code', childCodes)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ id: string; email: string; referral_code: string | null; referred_by_code: string | null; created_at: string; invite_used_at: string | null }> }

  const status = user.invite_used_at
    ? { label: 'AUTHED', cls: 'bg-[#00703c] text-white' }
    : user.invite_code
      ? { label: 'INVITED', cls: 'bg-amber-500 text-white' }
      : { label: 'WAITLIST', cls: 'bg-stone-400 text-white' }

  const fields: Array<[string, string | number | null]> = [
    ['email', user.email],
    ['id', user.id],
    ['source', user.source],
    ['referrer url', user.referrer],
    ['ip country', user.ip_country],
    ['joined', fmt(user.created_at)],
    ['referral code', user.referral_code],
    ['referred by', user.referred_by_code],
    ['direct referrals', user.direct_referrals],
    ['indirect referrals', user.indirect_referrals],
    ['invite code', user.invite_code],
    ['invited at', fmt(user.invited_at)],
    ['invite used', fmt(user.invite_used_at)],
  ]

  return (
    <div className="space-y-8">
      <div>
        <Link href="/users" className="text-xs text-stone-500 hover:underline">
          ← back to users
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-stone-900 font-mono">{user.email}</h1>
          <span className={`px-2 py-0.5 text-[10px] tracking-wider ${status.cls}`}>
            {status.label}
          </span>
        </div>
      </div>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} ACTIONS</div>
        <div className="border border-stone-300 bg-white p-4">
          <UserActionPanel
            email={user.email}
            status={status.label as 'WAITLIST' | 'INVITED' | 'AUTHED'}
          />
        </div>
      </section>

      <section>
        <AccountPanel
          email={user.email}
          currentBalance={creditBalance}
          currentTier={(user.plan_tier as 'free' | 'pro' | 'elite' | 'business' | null) ?? 'free'}
          hasAuthUser={Boolean(authUser)}
        />
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">
          {'>'} ADMIN ACTIVITY ({auditEvents.length})
        </div>
        <div className="border border-stone-300 bg-white">
          {auditEvents.length === 0 ? (
            <div className="px-3 py-4 text-xs text-stone-500">
              No admin actions recorded against this user yet. Actions taken from the panel
              above will appear here.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-stone-100 text-stone-600 tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 w-44">WHEN</th>
                  <th className="text-left px-3 py-2">ACTOR</th>
                  <th className="text-left px-3 py-2 w-40">ACTION</th>
                  <th className="text-left px-3 py-2">METADATA</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((e) => {
                  const cls =
                    ACTION_CLS[e.action] ?? 'bg-stone-200 text-stone-700 ring-stone-300'
                  return (
                    <tr key={e.id} className="border-t border-stone-200 align-top">
                      <td className="px-3 py-2 font-mono text-stone-600 whitespace-nowrap">
                        {fmtAudit(e.ts)}
                      </td>
                      <td className="px-3 py-2 font-mono text-stone-900">{e.actor_email}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] tracking-wider ring-1 ${cls}`}
                        >
                          {e.action.toUpperCase()}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2 font-mono text-stone-600 max-w-md truncate"
                        title={safeStr(e.metadata)}
                      >
                        {safeStr(e.metadata)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">
          {'>'} USER ACTIVITY ({clickEvents.length})
        </div>
        <div className="border border-stone-300 bg-white">
          {!authUser ? (
            <div className="px-3 py-4 text-xs text-stone-500">
              User hasn&apos;t authenticated yet — no auth.users row, no
              page-views to show. Once they sign in, recent activity will
              surface here.
            </div>
          ) : clickEvents.length === 0 ? (
            <div className="px-3 py-4 text-xs text-stone-500">
              Authenticated as{' '}
              <span className="font-mono text-stone-700">{authUser.id}</span>{' '}
              but no click_events recorded. Either they signed in and
              haven&apos;t loaded a page since the tracker shipped, or
              tracker is broken — check{' '}
              <Link href="/clicks" className="text-[#00703c] underline">
                /clicks
              </Link>{' '}
              for global event flow.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-stone-100 text-stone-600 tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 w-44">WHEN</th>
                  <th className="text-left px-3 py-2 w-32">EVENT</th>
                  <th className="text-left px-3 py-2">PAGE</th>
                  <th className="text-left px-3 py-2">TARGET</th>
                  <th className="text-left px-3 py-2 w-20">GEO</th>
                </tr>
              </thead>
              <tbody>
                {clickEvents.map((e) => {
                  const cls =
                    EVENT_CLS[e.event_name] ?? 'bg-emerald-50 text-emerald-800 ring-emerald-300'
                  return (
                    <tr key={e.id} className="border-t border-stone-200 align-top">
                      <td className="px-3 py-2 font-mono text-stone-600 whitespace-nowrap">
                        {fmtAudit(e.ts)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] tracking-wider ring-1 ${cls}`}
                        >
                          {e.event_name.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-stone-700 truncate max-w-xs" title={e.page ?? ''}>
                        {e.page ?? '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-stone-600 truncate max-w-xs" title={e.target ?? safeStr(e.metadata)}>
                        {e.target ?? (e.metadata ? safeStr(e.metadata) : '—')}
                      </td>
                      <td className="px-3 py-2 text-stone-600">
                        {e.ip_country ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} RECORD</div>
        <div className="border border-stone-300 bg-white">
          <table className="w-full text-xs">
            <tbody>
              {fields.map(([k, v]) => (
                <tr key={k} className="border-t border-stone-200 first:border-t-0">
                  <td className="px-3 py-2 text-stone-500 tracking-wider w-48">{k.toUpperCase()}</td>
                  <td className="px-3 py-2 font-mono text-stone-900">{v ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} REFERRAL TREE</div>
        <div className="border border-stone-300 bg-white p-4 space-y-4 text-xs">
          <div>
            <div className="text-stone-500 tracking-wider mb-1">PARENT (who referred them)</div>
            {parent ? (
              <Link href={`/admin/users/${parent.id}`} className="font-mono text-stone-900 hover:underline">
                {parent.email} <span className="text-stone-500">({parent.referral_code})</span>
              </Link>
            ) : (
              <div className="text-stone-500">— direct signup, no referrer</div>
            )}
          </div>

          <div>
            <div className="text-stone-500 tracking-wider mb-1">
              DIRECT REFERRALS ({(children ?? []).length})
            </div>
            {(children ?? []).length === 0 ? (
              <div className="text-stone-500">— none yet</div>
            ) : (
              <ul className="space-y-1">
                {(children ?? []).map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/users/${c.id}`} className="font-mono text-stone-900 hover:underline">
                      {c.email}
                    </Link>
                    <span className="text-stone-500 ml-2">
                      {c.invite_used_at ? '✓ authed' : '— waitlist'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="text-stone-500 tracking-wider mb-1">
              INDIRECT REFERRALS ({(grandchildren ?? []).length})
            </div>
            {(grandchildren ?? []).length === 0 ? (
              <div className="text-stone-500">— none yet</div>
            ) : (
              <ul className="space-y-1">
                {(grandchildren ?? []).map((g) => (
                  <li key={g.id}>
                    <Link href={`/admin/users/${g.id}`} className="font-mono text-stone-900 hover:underline">
                      {g.email}
                    </Link>
                    <span className="text-stone-500 ml-2">
                      via {g.referred_by_code} · {g.invite_used_at ? '✓ authed' : '— waitlist'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
