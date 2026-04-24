import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/me/treasury
// Body: { address: string, chain?: 'polygon' | 'ethereum' | 'arbitrum' | 'base' }
//
// Saves the chapter's Safe multisig to the `safe_treasury` table (one row
// per Safe, created_by = the captain). Also flips
// user_profiles.joined_treasury for fast "is this user a captain" checks.
//
// DELETE: marks the Safe inactive (is_active = false) and unflags
// user_profiles.joined_treasury. Doesn't delete the row — preserves audit
// trail.

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const CHAIN_IDS: Record<string, number> = {
  polygon: 137,
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
}

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

  const chainName =
    typeof body.chain === 'string' && body.chain in CHAIN_IDS ? body.chain : 'polygon'
  const chainId = CHAIN_IDS[chainName]

  const admin = getServerClient()

  // Look up any existing active Safe for this captain. We allow only one
  // active Safe per captain at a time; new connection deactivates the old.
  const { data: existing } = await admin
    .from('safe_treasury')
    .select('id, safe_address, chain_id')
    .eq('created_by', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    // Same address + chain — no-op.
    if (existing.safe_address.toLowerCase() === address && existing.chain_id === chainId) {
      return Response.json({ ok: true, address, chain: chainName, unchanged: true })
    }
    // Different — deactivate old, insert new.
    await admin
      .from('safe_treasury')
      .update({ is_active: false })
      .eq('id', existing.id)
  }

  // Defaults for fields the form doesn't collect today (threshold, owners,
  // owners_count). Real values get reconciled by an on-chain poll later.
  const { error: insertErr } = await admin.from('safe_treasury').insert({
    safe_address: address,
    chain_id: chainId,
    chain_name: chainName,
    threshold: 2,
    owners_count: 3,
    owners: [],
    is_active: true,
    created_by: user.id,
  })

  if (insertErr) {
    console.error('[treasury] insert failed', insertErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  // Quick flag on user_profiles
  await admin
    .from('user_profiles')
    .upsert(
      { user_id: user.id, joined_treasury: true },
      { onConflict: 'user_id' },
    )

  return Response.json({
    ok: true,
    address,
    chain: chainName,
    chain_id: chainId,
    added_at: new Date().toISOString(),
  })
}

// DELETE /api/me/treasury — soft-disconnect (mark Safe inactive, unflag
// user_profiles.joined_treasury). Preserves the audit row.
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

  await admin
    .from('safe_treasury')
    .update({ is_active: false })
    .eq('created_by', user.id)
    .eq('is_active', true)

  await admin
    .from('user_profiles')
    .upsert(
      { user_id: user.id, joined_treasury: false },
      { onConflict: 'user_id' },
    )

  return Response.json({ ok: true })
}
