import { getAdminEmails } from '@/lib/admin-auth'
import { StressCleanupButton } from './cleanup-button'

export const dynamic = 'force-dynamic'

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'WAITLIST_FROM_EMAIL',
  'ADMIN_EMAILS',
] as const

function envStatus(name: string): { set: boolean; hint?: string } {
  const v = process.env[name]
  if (!v) return { set: false }
  if (name === 'ADMIN_EMAILS') {
    const parts = v.split(',').filter(Boolean)
    return { set: true, hint: `${parts.length} allowlisted` }
  }
  if (name.toLowerCase().includes('key')) return { set: true, hint: `${v.length} chars` }
  return { set: true, hint: v.length > 40 ? v.slice(0, 40) + '…' : v }
}

export default async function SystemPage() {
  const envRows = REQUIRED_ENV.map((name) => ({ name, ...envStatus(name) }))
  const adminEmails = getAdminEmails()

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} SYSTEM</div>
        <h1 className="text-2xl font-bold text-stone-900">Infra & API Usage</h1>
      </div>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} ENV VAR STATUS</div>
        <div className="border border-stone-300 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-stone-100 text-stone-600 tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">NAME</th>
                <th className="text-left px-3 py-2">STATUS</th>
                <th className="text-left px-3 py-2">DETAIL</th>
              </tr>
            </thead>
            <tbody>
              {envRows.map((r) => (
                <tr key={r.name} className="border-t border-stone-200">
                  <td className="px-3 py-2 font-mono text-stone-900">{r.name}</td>
                  <td className="px-3 py-2">
                    {r.set ? (
                      <span className="text-emerald-700">✓ set</span>
                    ) : (
                      <span className="text-red-700">✗ missing</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-stone-600 font-mono">{r.hint ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} ADMIN ALLOWLIST</div>
        <div className="border border-stone-300 bg-white p-4">
          {adminEmails.length === 0 ? (
            <div className="text-xs text-red-700">
              ADMIN_EMAILS is empty. Nobody can reach /admin until it's set.
            </div>
          ) : (
            <ul className="space-y-1 text-xs font-mono">
              {adminEmails.map((e) => (
                <li key={e} className="text-stone-800">
                  {e}
                </li>
              ))}
            </ul>
          )}
          <div className="text-[11px] text-stone-500 mt-3">
            Set `ADMIN_EMAILS` in Vercel as a comma-separated list. Changes require redeploy.
          </div>
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} THIRD-PARTY DASHBOARDS</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-stone-300 bg-white hover:bg-stone-50 p-4 transition"
          >
            <div className="text-sm font-semibold text-stone-900">Supabase ↗</div>
            <div className="text-xs text-stone-500 mt-1">
              DB rows, auth users, storage, RLS, quotas
            </div>
          </a>
          <a
            href="https://resend.com/emails"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-stone-300 bg-white hover:bg-stone-50 p-4 transition"
          >
            <div className="text-sm font-semibold text-stone-900">Resend ↗</div>
            <div className="text-xs text-stone-500 mt-1">
              Delivery logs, bounces, API key usage
            </div>
          </a>
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-stone-300 bg-white hover:bg-stone-50 p-4 transition"
          >
            <div className="text-sm font-semibold text-stone-900">Vercel ↗</div>
            <div className="text-xs text-stone-500 mt-1">
              Deploys, function logs, edge traffic
            </div>
          </a>
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} PAYMENTS</div>
        <div className="border border-stone-300 bg-white p-4">
          <div className="text-sm font-semibold text-stone-900 mb-1">Not wired yet</div>
          <div className="text-xs text-stone-500">
            No Stripe / LemonSqueezy integration yet — the Terminal is free during waitlist and
            beta. Wire here once the pricing model is set (ROADMAP → Later → Payments
            integration).
          </div>
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} STRESS-TEST CLEANUP</div>
        <div className="border border-stone-300 bg-white p-4 space-y-3">
          <div className="text-xs text-stone-700">
            Deletes every waitlist row whose email starts with{' '}
            <code className="bg-stone-100 px-1">stress+</code> or{' '}
            <code className="bg-stone-100 px-1">stress-</code>. Use after running{' '}
            <code className="bg-stone-100 px-1">pnpm admin:stress:run</code>.
          </div>
          <StressCleanupButton />
        </div>
      </section>
    </div>
  )
}
