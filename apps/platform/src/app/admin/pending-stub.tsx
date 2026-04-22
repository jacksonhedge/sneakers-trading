import Link from 'next/link'

// Shared empty-state for admin sections whose implementation is pending.
// Each stub page links to its own handoff brief so the delegated Claude
// session has a direct path in, and the admin (you) can see what's
// coming without guessing.

export function PendingStub({
  title,
  brief,
  eventualFeatures,
}: {
  title: string
  brief: string
  eventualFeatures: string[]
}) {
  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <div className="inline-block text-[10px] tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded mb-2">
          NOT YET IMPLEMENTED
        </div>
        <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
        <p className="text-sm text-stone-600 mt-2">
          This admin surface is scaffolded and reserved. Implementation lives in{' '}
          <code className="bg-stone-100 px-1.5 py-0.5 rounded text-[11px]">{brief}</code>
          .
        </p>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <div className="text-[10px] text-stone-400 tracking-wider mb-3">WHEN BUILT, THIS PAGE WILL SHOW</div>
        <ul className="space-y-2 text-sm text-stone-700">
          {eventualFeatures.map((f, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-emerald-500 mt-0.5">•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-3 text-xs text-stone-500">
        <Link href="/admin" className="text-emerald-700 hover:underline">
          ← Back to Admin Overview
        </Link>
        <span className="text-stone-300">·</span>
        <span>To kick off implementation, hand the brief above to a fresh Claude Code session.</span>
      </div>
    </main>
  )
}
