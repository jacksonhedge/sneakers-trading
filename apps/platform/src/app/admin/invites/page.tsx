import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'
import { IssueForm } from './issue-form'
import { RevokeButton } from './revoke-button'

export const dynamic = 'force-dynamic'

type InviteRow = {
  id: string
  email: string
  invite_code: string
  invited_at: string | null
  invite_used_at: string | null
}

function fmt(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16)
}

export default async function InvitesPage() {
  const admin = getServerClient()
  const { data, error } = await admin
    .from('waitlist')
    .select('id, email, invite_code, invited_at, invite_used_at')
    .not('invite_code', 'is', null)
    .order('invited_at', { ascending: false })

  if (error) {
    return (
      <div className="border border-red-400 bg-red-50 p-4 text-sm text-red-800">
        Failed to load invites: {error.message}
      </div>
    )
  }

  const rows = (data ?? []) as InviteRow[]
  const pending = rows.filter((r) => !r.invite_used_at)
  const burned = rows.filter((r) => r.invite_used_at)

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} INVITES</div>
          <h1 className="text-2xl font-bold text-stone-900">
            {rows.length.toLocaleString()}{' '}
            <span className="text-stone-500 text-base font-normal">
              issued ({pending.length} pending · {burned.length} burned)
            </span>
          </h1>
        </div>
      </div>

      <IssueForm />

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} PENDING ({pending.length})</div>
        <div className="border border-stone-300 bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-100 text-stone-600 tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">EMAIL</th>
                <th className="text-left px-3 py-2">CODE</th>
                <th className="text-left px-3 py-2">ISSUED</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id} className="border-t border-stone-200">
                  <td className="px-3 py-2 font-mono">
                    <Link href={`/admin/users/${r.id}`} className="hover:underline">
                      {r.email}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-[#00703c] tracking-widest">
                    {r.invite_code}
                  </td>
                  <td className="px-3 py-2 text-stone-600">{fmt(r.invited_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <RevokeButton email={r.email} />
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-stone-500">
                    No pending invites.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} BURNED ({burned.length})</div>
        <div className="border border-stone-300 bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-100 text-stone-600 tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">EMAIL</th>
                <th className="text-left px-3 py-2">CODE</th>
                <th className="text-left px-3 py-2">ISSUED</th>
                <th className="text-left px-3 py-2">USED</th>
              </tr>
            </thead>
            <tbody>
              {burned.map((r) => (
                <tr key={r.id} className="border-t border-stone-200">
                  <td className="px-3 py-2 font-mono">
                    <Link href={`/admin/users/${r.id}`} className="hover:underline">
                      {r.email}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-stone-500 tracking-widest">
                    {r.invite_code}
                  </td>
                  <td className="px-3 py-2 text-stone-600">{fmt(r.invited_at)}</td>
                  <td className="px-3 py-2 text-stone-600">{fmt(r.invite_used_at)}</td>
                </tr>
              ))}
              {burned.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-stone-500">
                    No invites have been burned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
