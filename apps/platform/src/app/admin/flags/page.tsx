import Link from 'next/link'
import { listFlags } from '@/lib/feature-flags'
import { FlagRow } from './flag-row'
import { NewFlagForm } from './new-flag-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Feature flags — Admin — Sneakers Terminal',
}

export default async function FlagsPage() {
  const flags = await listFlags()

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} FEATURE FLAGS</div>
        <h1 className="text-2xl font-bold text-stone-900">
          {flags.length.toLocaleString()}{' '}
          <span className="text-stone-500 text-base font-normal">flags</span>
        </h1>
        <p className="text-sm text-stone-600 mt-1 max-w-2xl">
          DB-backed boolean flags. Read at runtime via <code className="bg-stone-100 px-1">getFlag(key, default)</code>.
          Flipping a flag is logged to the{' '}
          <Link href="/audit" className="text-[#00703c] underline">audit log</Link> with the prior value, the
          new value, and the actor.
        </p>
        <p className="text-sm text-stone-500 mt-1 max-w-2xl">
          Note: env-driven config (in <Link href="/signup-config" className="text-[#00703c] underline">/signup-config</Link>)
          still requires a Vercel env edit + redeploy. Flags here are the live-toggle alternative for new
          knobs going forward.
        </p>
      </div>

      <NewFlagForm />

      {flags.length === 0 ? (
        <div className="border border-stone-300 bg-white p-6 text-sm text-stone-500">
          No flags defined yet. Create one above — pick a snake_case key + a one-line description.
        </div>
      ) : (
        <div className="border border-stone-300 bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-100 text-stone-600 tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 w-56">KEY</th>
                <th className="text-left px-3 py-2">DESCRIPTION</th>
                <th className="text-left px-3 py-2 w-24">VALUE</th>
                <th className="text-left px-3 py-2 w-44">UPDATED</th>
                <th className="px-3 py-2 w-44 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <FlagRow
                  key={f.key}
                  flagKey={f.key}
                  initialValue={f.value_bool}
                  description={f.description}
                  updatedAt={f.updated_at}
                  updatedBy={f.updated_by}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
