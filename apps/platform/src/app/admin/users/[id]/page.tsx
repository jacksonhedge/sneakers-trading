import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'

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

  // Referral tree: find parent (referred_by_code → row) and children (referral_code ← rows)
  const [{ data: parent }, { data: children }] = await Promise.all([
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
  ])

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
        <Link href="/admin/users" className="text-xs text-stone-500 hover:underline">
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
