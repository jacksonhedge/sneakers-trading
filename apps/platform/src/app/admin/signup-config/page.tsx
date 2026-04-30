import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { getSignupConfig } from '@/lib/signup-config'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Signup config — Admin — Sneakers Terminal',
}

// Read-only mirror of the signup feature flags. Lets admins verify
// configuration without digging through Vercel env vars. Editing happens
// at the env layer (vercel env add ... + redeploy).

export default async function AdminSignupConfigPage() {
  await requireAdmin()
  const cfg = getSignupConfig()

  const rows: Array<{
    envVar: string
    label: string
    enabled: boolean
    description: string
  }> = [
    {
      envVar: 'NEXT_PUBLIC_SIGNUP_INDIVIDUAL_ENABLED',
      label: 'Individual signups',
      enabled: cfg.individualEnabled,
      description: 'Sign Up as Individual button on landing + /hardware. /api/waitlist gate.',
    },
    {
      envVar: 'NEXT_PUBLIC_SIGNUP_ORG_ENABLED',
      label: 'Organization signups',
      enabled: cfg.organizationEnabled,
      description:
        'Sign Up as Organization button on landing + /hardware. Org pricing CTAs. /api/waitlist gate.',
    },
  ]

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← ADMIN
        </Link>

        <div className="mt-6 mb-8">
          <div className="text-xs text-emerald-700 tracking-wider font-semibold mb-2">
            ADMIN · SIGNUP CONFIG
          </div>
          <h1 className="text-3xl font-bold mb-2">Signup feature flags.</h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            Read-only mirror of the env-driven signup configuration. To change a
            value: <code className="bg-stone-200 px-1.5 py-0.5 rounded text-xs">vercel env add &lt;NAME&gt;</code>{' '}
            + redeploy (or wait for the next push). Admin emails always bypass
            these gates.
          </p>
        </div>

        {/* Overall state */}
        <section className="mb-6">
          <div
            className={`rounded-lg ring-1 px-5 py-4 flex items-center gap-4 ${
              cfg.allClosed
                ? 'bg-red-50 ring-red-300'
                : !cfg.individualEnabled || !cfg.organizationEnabled
                  ? 'bg-amber-50 ring-amber-300'
                  : 'bg-emerald-50 ring-emerald-300'
            }`}
          >
            <div
              className={`w-3 h-3 rounded-full ${
                cfg.allClosed
                  ? 'bg-red-500'
                  : !cfg.individualEnabled || !cfg.organizationEnabled
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              aria-hidden
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-stone-900">
                {cfg.allClosed
                  ? 'All signups paused'
                  : !cfg.individualEnabled || !cfg.organizationEnabled
                    ? 'Partially paused'
                    : 'All signups open'}
              </div>
              <div className="text-xs text-stone-700 mt-0.5">
                {cfg.allClosed
                  ? 'Landing page shows a paused-state card. New signups blocked at API.'
                  : !cfg.individualEnabled || !cfg.organizationEnabled
                    ? 'One signup path is currently disabled. Other path open.'
                    : 'Both Individual and Organization signups are accepting new entries.'}
              </div>
            </div>
          </div>
        </section>

        {/* Per-flag state */}
        <section className="space-y-3 mb-6">
          {rows.map((row) => (
            <div
              key={row.envVar}
              className="rounded-lg ring-1 ring-stone-200 bg-white p-5 flex items-start gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-base font-semibold text-stone-900">{row.label}</h2>
                  <span
                    className={`text-[10px] tracking-[0.15em] font-bold px-2 py-0.5 rounded-full ring-1 ${
                      row.enabled
                        ? 'bg-emerald-100 text-emerald-800 ring-emerald-300'
                        : 'bg-stone-200 text-stone-700 ring-stone-300'
                    }`}
                  >
                    {row.enabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <div className="text-xs text-stone-600 mb-2 leading-relaxed">
                  {row.description}
                </div>
                <div className="text-[11px] text-stone-500 font-mono break-all">
                  {row.envVar}
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Banner */}
        <section className="mb-8">
          <div className="rounded-lg ring-1 ring-stone-200 bg-white p-5">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-base font-semibold text-stone-900">Public banner</h2>
              <span
                className={`text-[10px] tracking-[0.15em] font-bold px-2 py-0.5 rounded-full ring-1 ${
                  cfg.banner
                    ? 'bg-amber-100 text-amber-800 ring-amber-300'
                    : 'bg-stone-200 text-stone-700 ring-stone-300'
                }`}
              >
                {cfg.banner ? 'ACTIVE' : 'NONE'}
              </span>
            </div>
            <div className="text-xs text-stone-600 mb-2 leading-relaxed">
              Optional message shown above the hero CTAs (or in place of them when
              all signups are paused).
            </div>
            {cfg.banner ? (
              <div className="rounded bg-amber-50 ring-1 ring-amber-300 px-4 py-2 text-sm text-stone-800 mb-2">
                {cfg.banner}
              </div>
            ) : (
              <div className="text-xs text-stone-500 italic mb-2">No banner set.</div>
            )}
            <div className="text-[11px] text-stone-500 font-mono break-all">
              NEXT_PUBLIC_SIGNUP_BANNER
            </div>
          </div>
        </section>

        {/* How-to */}
        <section className="rounded-lg ring-1 ring-stone-200 bg-stone-100 p-5 text-xs text-stone-700 leading-relaxed">
          <div className="font-semibold text-stone-900 mb-2">Common operations</div>
          <ul className="space-y-1.5 list-disc pl-5">
            <li>
              <strong>Pause org signups for a week:</strong>{' '}
              <code className="bg-white px-1 py-0.5 rounded">
                vercel env add NEXT_PUBLIC_SIGNUP_ORG_ENABLED 0
              </code>
            </li>
            <li>
              <strong>Show a banner during the pause:</strong>{' '}
              <code className="bg-white px-1 py-0.5 rounded">
                vercel env add NEXT_PUBLIC_SIGNUP_BANNER &quot;Org signups paused — back next Monday&quot;
              </code>
            </li>
            <li>
              <strong>Re-enable:</strong> delete the env var or set it to <code className="bg-white px-1 py-0.5 rounded">1</code>
            </li>
            <li>
              <strong>Falsy values:</strong>{' '}
              <code className="bg-white px-1 py-0.5 rounded">0</code>,{' '}
              <code className="bg-white px-1 py-0.5 rounded">false</code>,{' '}
              <code className="bg-white px-1 py-0.5 rounded">off</code>,{' '}
              <code className="bg-white px-1 py-0.5 rounded">disabled</code>,{' '}
              <code className="bg-white px-1 py-0.5 rounded">no</code>. Anything else (or unset) is enabled.
            </li>
            <li>
              <strong>Admin bypass:</strong> emails in <code className="bg-white px-1 py-0.5 rounded">ADMIN_EMAILS</code> always pass the gate, even when paused.
            </li>
          </ul>
        </section>
      </div>
    </main>
  )
}
