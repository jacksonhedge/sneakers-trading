import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { TreasuryForm } from './treasury-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Chapter Treasury — Sneakers Terminal',
}

// Chapter Treasury setup. The "right" wallet for a fraternity isn't a
// personal Crypto.com account — it's a Safe multisig where 3-5 officers
// each hold a key and votes settle on-chain. This page walks the captain
// through external Safe creation, then captures the resulting address so
// we can later wire on-chain Polymarket activity to the chapter's
// leaderboard.
//
// Currently scoped to a user (captain). Once Groups MVP ships, this
// migrates to be group-scoped (one treasury per chapter, attached via
// leaderboard_groups instead of user_profiles).

export default async function TreasuryPage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/signup?next=/dashboard/treasury')

  const admin = getServerClient()
  // Live schema: safe_treasury is its own table, not columns on user_profiles.
  // We fetch the active row created by this user.
  const { data: treasury } = await admin
    .from('safe_treasury')
    .select('safe_address, chain_name, created_at')
    .eq('created_by', user.id)
    .eq('is_active', true)
    .maybeSingle()
  const profile = treasury
    ? {
        safe_treasury_address: treasury.safe_address,
        safe_treasury_chain: treasury.chain_name,
        safe_treasury_added_at: treasury.created_at,
      }
    : null

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
            CHAPTER · TREASURY
          </div>
          <h1 className="text-3xl font-bold mb-2">A wallet your chapter votes on.</h1>
          <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
            Personal wallets put one person on the legal hook for chapter funds.
            A <strong>Safe multisig</strong> on Polygon lets 3–5 officers hold keys
            together — every transaction needs a quorum, every transaction is on-
            chain and auditable, and signers rotate when officers do.
          </p>
        </div>

        {/* Current connection state */}
        {profile?.safe_treasury_address ? (
          <ConnectedState
            address={profile.safe_treasury_address}
            chain={profile.safe_treasury_chain ?? 'polygon'}
            addedAt={profile.safe_treasury_added_at}
          />
        ) : (
          <SetupGuide />
        )}

        {/* Future-state note */}
        <div className="mt-8 rounded-lg ring-1 ring-amber-300 bg-amber-50 px-5 py-4 text-xs text-stone-700 leading-relaxed">
          <div className="font-semibold text-stone-900 mb-1">
            Heads up: this page is captain-scoped today.
          </div>
          When the Groups MVP ships, treasury attachment moves from your personal
          profile to the chapter group itself. Your saved address will migrate
          over automatically — no action needed.
        </div>
      </div>
    </main>
  )
}

function SetupGuide() {
  return (
    <>
      <section className="mb-8">
        <ol className="space-y-4">
          <Step
            n={1}
            title="Open Safe"
            body={
              <>
                Go to{' '}
                <a
                  href="https://app.safe.global"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 font-semibold underline hover:text-emerald-800"
                >
                  app.safe.global
                </a>
                . Connect a wallet (MetaMask, Phantom EVM, Rabby, etc.) using the
                officer who&apos;ll be the primary signer.
              </>
            }
          />
          <Step
            n={2}
            title="Create a new Safe on Polygon"
            body={
              <>
                Pick <strong>Polygon</strong> as the network — Polymarket settles
                there, so the treasury and the markets live on the same chain.
                Add your officers&apos; wallet addresses as signers and pick a
                threshold (3-of-5 is the typical chapter setup).
              </>
            }
          />
          <Step
            n={3}
            title="Fund the Safe"
            body={
              <>
                Send chapter funds (USDC on Polygon is the simplest — bridge
                from Coinbase or Crypto.com). Every officer can verify the
                balance on-chain at any time.
              </>
            }
          />
          <Step
            n={4}
            title="Paste the Safe address below"
            body={
              <>
                Once the Safe is deployed, copy its address (starts with{' '}
                <code className="bg-stone-200 px-1 py-0.5 rounded text-xs">0x</code>
                ) and paste it in the form. We&apos;ll wire it to the chapter
                leaderboard so on-chain Polymarket P&amp;L shows up
                automatically.
              </>
            }
          />
        </ol>
      </section>

      <section className="rounded-lg ring-1 ring-stone-200 bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Connect your Safe</h2>
        <TreasuryForm />
      </section>
    </>
  )
}

function ConnectedState({
  address,
  chain,
  addedAt,
}: {
  address: string
  chain: string
  addedAt: string | null
}) {
  const explorerBase: Record<string, string> = {
    polygon: 'https://polygonscan.com/address/',
    ethereum: 'https://etherscan.io/address/',
    arbitrum: 'https://arbiscan.io/address/',
    base: 'https://basescan.org/address/',
  }
  const explorerUrl = (explorerBase[chain] ?? explorerBase.polygon) + address

  return (
    <section className="rounded-lg ring-1 ring-emerald-300 bg-emerald-50 p-6 mb-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-3 h-3 rounded-full bg-emerald-500" aria-hidden />
        <h2 className="text-lg font-semibold text-stone-900">
          Treasury connected
        </h2>
        <span className="text-[10px] tracking-[0.15em] font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 uppercase">
          {chain}
        </span>
      </div>
      <div className="font-mono text-xs text-stone-700 break-all bg-white rounded px-3 py-2 ring-1 ring-stone-200 mb-3">
        {address}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-600">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 font-semibold hover:underline"
        >
          View on explorer →
        </a>
        <a
          href={`https://app.safe.global/${chain === 'polygon' ? 'matic' : 'eth'}:${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 font-semibold hover:underline"
        >
          Open in Safe →
        </a>
        {addedAt && (
          <span className="text-stone-500">
            Connected {new Date(addedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="mt-5 pt-5 border-t border-emerald-300">
        <h3 className="text-sm font-semibold text-stone-900 mb-2">Want to disconnect?</h3>
        <TreasuryForm initialAddress={address} initialChain={chain} disconnectMode />
      </div>
    </section>
  )
}

function Step({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center">
        {n}
      </span>
      <div className="flex-1 min-w-0 pt-1">
        <div className="font-semibold text-stone-900 mb-1">{title}</div>
        <div className="text-sm text-stone-700 leading-relaxed">{body}</div>
      </div>
    </li>
  )
}
