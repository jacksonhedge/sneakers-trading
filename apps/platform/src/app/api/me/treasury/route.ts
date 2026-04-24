import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/me/treasury
// Body: { address: string, chain?: 'polygon' | 'ethereum' | 'arbitrum' | 'base' }
//
// Saves the Safe multisig address as the user's chapter treasury. Idempotent —
// re-posting overwrites the address (someone moves to a new Safe).
//
// Validation: must look like a 0x-prefixed 40-char hex string. We don't
// verify the contract on-chain here (network call from the API hot path is
// risky); cron job + the leaderboard reconciler will skip addresses that
// don't actually have transactions.

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const ALLOWED_CHAINS = new Set(['polygon', 'ethereum', 'arbitrum', 'base'])

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser()
  if (authErr || !user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    address?: unknown
    chain?: unknown
  }

  const rawAddress = typeof body.address === 'string' ? body.address.trim() : ''
  if (!ADDRESS_RE.test(rawAddress)) {
    return Response.json(
      { error: 'invalid_address', detail: 'Must be a 0x-prefixed 40-char hex address.' },
      { status: 400 },
    )
  }
  const address = rawAddress.toLowerCase()

  const chain = typeof body.chain === 'string' && ALLOWED_CHAINS.has(body.chain) ? body.chain : 'polygon'

  const admin = getServerClient()
  const now = new Date().toISOString()

  const { error: writeErr } = await admin
    .from('user_profiles')
    .upsert(
      {
        user_id: user.id,
        safe_treasury_address: address,
        safe_treasury_chain: chain,
        safe_treasury_added_at: now,
      },
      { onConflict: 'user_id' },
    )

  if (writeErr) {
    console.error('[treasury] upsert failed', writeErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true, address, chain, added_at: now })
}

// DELETE /api/me/treasury — disconnect the treasury. Captain moved on, etc.
export async function DELETE() {
  const sb = await getAuthClient()
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser()
  if (authErr || !user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServerClient()
  const { error: writeErr } = await admin
    .from('user_profiles')
    .upsert(
      {
        user_id: user.id,
        safe_treasury_address: null,
        safe_treasury_chain: null,
        safe_treasury_added_at: null,
      },
      { onConflict: 'user_id' },
    )

  if (writeErr) {
    console.error('[treasury] disconnect failed', writeErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
