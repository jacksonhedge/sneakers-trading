import Link from 'next/link'
import {
  getGlobalMemory,
  getGlobalSources,
} from '@/lib/otoole-global-memory'
import { MemoryEditor } from './memory-editor'
import { SourceRow } from './source-row'
import { NewSourceForm } from './new-source-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: "O'Toole memory — Admin — Sneakers Terminal",
}

export default async function AdminOTooleMemoryPage() {
  const [memory, sources] = await Promise.all([
    getGlobalMemory(),
    getGlobalSources(),
  ])
  const enabledCount = sources.filter((s) => s.enabled).length

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">
          {'>'} O&apos;TOOLE — GLOBAL MEMORY &amp; STRATEGY
        </div>
        <h1 className="text-2xl font-bold text-stone-900">
          Bot-wide baseline
        </h1>
        <p className="text-sm text-stone-600 mt-1 max-w-3xl">
          Everything below is injected into <em>every</em> user&apos;s O&apos;Toole
          chat. Users layer their own &ldquo;how I trade&rdquo; notes + pasted
          insight sources on top via{' '}
          <Link
            href="/dashboard/settings/otoole"
            className="text-[#00703c] underline"
          >
            /dashboard/settings/otoole
          </Link>
          ; that surface is owned by the user, not editable here. Edits to this
          page are audit-logged (
          <Link href="/audit" className="text-[#00703c] underline">/admin/audit</Link>
          ).
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-stone-800 tracking-wider">
            MEMORY &amp; PERSONA
          </h2>
          <span className="text-[10px] text-stone-500">
            singleton row · master toggle below disables both fields at once
          </span>
        </div>
        <MemoryEditor initial={memory} />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-stone-800 tracking-wider">
            SOURCES{' '}
            <span className="text-stone-500 font-normal">
              ({sources.length} total · {enabledCount} enabled)
            </span>
          </h2>
          <NewSourceForm />
        </div>
        <p className="text-[11px] text-stone-500 max-w-3xl">
          Operator-curated snippets. Each fires when the user&apos;s message
          contains any of its filter keywords (case-insensitive substring match);
          empty filter = always fire. Disable individually instead of deleting
          if you might want it back.
        </p>

        {sources.length === 0 ? (
          <div className="border border-stone-300 bg-white p-6 text-sm text-stone-500">
            No global sources yet. Click <strong>+ ADD SOURCE</strong> above to
            paste a tweet, README excerpt, article paragraph, or freeform note.
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-stone-200 pt-4 text-[11px] text-stone-500">
        <div className="font-semibold text-stone-600 tracking-wider mb-1">
          {'>'} OTHER O&apos;TOOLE ADMIN (planned)
        </div>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            Cost telemetry · per-tier query &amp; spend rollups (was the
            placeholder previously living on this page; tracker:
            <code className="bg-stone-100 px-1 mx-1">docs/HANDOFF_STRIPE_SUBSCRIPTIONS.md</code>
            phase 8e).
          </li>
          <li>
            Per-user memory drilldown · view what an individual user has saved.
          </li>
        </ul>
      </section>
    </div>
  )
}
