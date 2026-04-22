import { getAuthClient } from '@/lib/supabase-auth'
import {
  listUserProviderKeys,
  upsertProviderKey,
  deleteProviderKey,
  markVerified,
} from '@/lib/provider-keys'
import type { AIProvider } from '@/lib/ai-models'
import { getAdapter, ChatAdapterError } from '@/lib/ai-providers'

const VALID_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'google', 'xai']

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const keys = await listUserProviderKeys(user.id)
  return Response.json({ keys })
}

export async function POST(req: Request) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    provider?: unknown
    apiKey?: unknown
    label?: unknown
    verify?: unknown
  }
  const provider = typeof body.provider === 'string' ? body.provider : null
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const label = typeof body.label === 'string' ? body.label.slice(0, 80) : undefined
  const verify = body.verify === true

  if (!provider || !(VALID_PROVIDERS as string[]).includes(provider)) {
    return Response.json({ error: 'invalid_provider' }, { status: 400 })
  }
  if (!apiKey || apiKey.length < 10) {
    return Response.json({ error: 'invalid_api_key' }, { status: 400 })
  }

  try {
    await upsertProviderKey(user.id, provider as AIProvider, apiKey, label)
  } catch (err) {
    console.error('[settings/api-keys] upsert failed', err)
    return Response.json({ error: 'save_failed' }, { status: 500 })
  }

  // Optional verification: cheap test call with the provided key to confirm
  // it actually works. On success, stamp verified_at. On failure, store the
  // key but return a verification failure so the UI can flag it.
  if (verify) {
    try {
      const adapter = getAdapter(provider as AIProvider)
      // Small 1-token probe — cheapest meaningful call per provider.
      // We ignore the response; any non-error is a pass.
      await adapter.chat({
        modelId: probeModelFor(provider as AIProvider),
        systemPrompt: "You are verifying this key. Respond with 'ok' only.",
        marketContext: '',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 16,
        apiKey,
      })
      await markVerified(user.id, provider as AIProvider)
      return Response.json({ ok: true, verified: true })
    } catch (err) {
      if (err instanceof ChatAdapterError) {
        return Response.json(
          {
            ok: true,
            verified: false,
            verificationError: err.message,
          },
          { status: 200 },
        )
      }
      return Response.json(
        {
          ok: true,
          verified: false,
          verificationError: err instanceof Error ? err.message : 'unknown',
        },
        { status: 200 },
      )
    }
  }

  return Response.json({ ok: true })
}

export async function DELETE(req: Request) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const url = new URL(req.url)
  const provider = url.searchParams.get('provider')
  if (!provider || !(VALID_PROVIDERS as string[]).includes(provider)) {
    return Response.json({ error: 'invalid_provider' }, { status: 400 })
  }

  try {
    await deleteProviderKey(user.id, provider as AIProvider)
  } catch (err) {
    console.error('[settings/api-keys] delete failed', err)
    return Response.json({ error: 'delete_failed' }, { status: 500 })
  }
  return Response.json({ ok: true })
}

// Cheapest model per provider for key verification. We use the smallest
// offering so a successful probe costs ~pennies at most.
function probeModelFor(provider: AIProvider): string {
  switch (provider) {
    case 'anthropic': return 'claude-haiku-4-5'
    case 'openai': return 'gpt-4o-mini'
    case 'google': return 'gemini-2-5-flash'
    case 'xai': return 'grok-3'
  }
}
