import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: "O'Toole settings — Sneakers Terminal",
}

// O'Toole settings page. Referenced from the OtooleSpotlight card on the
// dashboard. Three sections: Configure (live), Teach (memory, partial), and
// Safety (placeholder for the future autotrade rule-engine).
//
// This is a deliberate stub — the real functional bits (memory editor, model
// routing rules, credit budget) will land as part of PLAN_OTOOLE.md Level
// 1 + Level 2. The page exists now so the spotlight CTAs don't 404.

export default async function OtooleSettingsPage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/signup')

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/dashboard"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← DASHBOARD
        </Link>

        <div className="mt-6 mb-8">
          <div className="text-xs text-emerald-700 tracking-wider font-semibold mb-2">
            O&apos;TOOLE · SETTINGS
          </div>
          <h1 className="text-3xl font-bold mb-2">Configure your AI trading desk.</h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            O&apos;Toole is the Sneakers AI co-pilot. Pick the model, set voice preferences,
            teach it what you care about. It remembers across sessions so it stops giving
            generic advice.
          </p>
        </div>

        {/* Configure — live */}
        <section className="mb-10 rounded-lg bg-white ring-1 ring-stone-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-2xl">⚙</div>
            <div>
              <h2 className="text-lg font-semibold">Configure</h2>
              <div className="text-[10px] tracking-widest text-emerald-700 font-semibold">LIVE</div>
            </div>
          </div>
          <div className="text-sm text-stone-700 mb-4 leading-relaxed">
            Pick which model handles your prompts. Faster + cheaper for everyday questions,
            Opus 4.7 for hard reasoning. You can also override per-message inside the chat.
          </div>
          <div className="rounded border border-stone-200 divide-y divide-stone-100">
            <ModelRow name="Haiku 4.5" speed="Fastest" cost="3 credits" />
            <ModelRow name="Sonnet 4.6" speed="Default" cost="30 credits" />
            <ModelRow name="Opus 4.7" speed="Smartest" cost="150 credits" />
            <ModelRow name="GPT-5" speed="Alternate" cost="30 credits" />
            <ModelRow name="GPT-5 mini" speed="Cheap" cost="5 credits" />
          </div>
          <div className="mt-4 text-[11px] text-stone-500">
            Full picker lives inside the chat panel on your dashboard. This page tracks your
            account-wide default — editor coming in Level 1 (see{' '}
            <Link href="/dashboard" className="text-emerald-700 underline">
              PLAN_OTOOLE.md
            </Link>
            ).
          </div>
        </section>

        {/* Teach — beta / memory anchor */}
        <section
          id="memory"
          className="mb-10 rounded-lg bg-white ring-1 ring-stone-200 p-6 scroll-mt-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="text-2xl">📖</div>
            <div>
              <h2 className="text-lg font-semibold">Teach</h2>
              <div className="text-[10px] tracking-widest text-amber-700 font-semibold">BETA</div>
            </div>
          </div>
          <div className="text-sm text-stone-700 mb-4 leading-relaxed">
            Facts you drop here become permanent context. Bankroll size, preferred markets,
            sizing preferences, hard rules (&quot;never touch crypto perpetuals&quot;) — O&apos;Toole
            references these on every response.
          </div>
          <div className="rounded-lg border-2 border-dashed border-stone-300 p-6 text-center">
            <div className="text-3xl mb-2">🚧</div>
            <div className="text-sm font-semibold text-stone-800 mb-1">
              Memory editor shipping soon
            </div>
            <div className="text-xs text-stone-500 leading-relaxed max-w-md mx-auto">
              We&apos;re building this into the chat panel directly — when you share something
              worth remembering (&quot;my bankroll is $5k&quot;, &quot;I only bet NBA&quot;), O&apos;Toole will
              offer to save it as a persistent fact. Track progress in PLAN_OTOOLE Level 2.
            </div>
          </div>
        </section>

        {/* Execute — pointer */}
        <section className="rounded-lg bg-stone-950 ring-1 ring-stone-800 p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-2xl">⚡</div>
            <div>
              <h2 className="text-lg font-semibold">Execute</h2>
              <div className="text-[10px] tracking-widest text-stone-400 font-semibold">
                COMING SOON
              </div>
            </div>
          </div>
          <div className="text-sm text-white/80 mb-4 leading-relaxed">
            The final O&apos;Toole layer: natural-language rules that automatically place trades
            when conditions hit. &quot;Buy Lakers moneyline on NoVig if Kalshi diverges 5pp from
            Polymarket, max $50.&quot;
          </div>
          <Link
            href="/dashboard/settings/autotrade"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-xs font-bold tracking-wider text-black hover:bg-emerald-400 transition"
          >
            Join the autotrade waitlist →
          </Link>
        </section>
      </div>
    </main>
  )
}

function ModelRow({ name, speed, cost }: { name: string; speed: string; cost: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <div className="flex-1">
        <div className="font-semibold text-stone-900">{name}</div>
        <div className="text-[11px] text-stone-500">{speed}</div>
      </div>
      <div className="font-mono tabular-nums text-xs text-stone-700">{cost}</div>
    </div>
  )
}
