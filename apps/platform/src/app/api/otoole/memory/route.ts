import { getAuthClient } from '@/lib/supabase-auth'
import { loadMemory, saveMemory } from '@/lib/otoole-memory'

// GET /api/otoole/memory  → { ok, content }
// PUT /api/otoole/memory  body: { content }  → { ok }
//
// Single freeform strategy text per user. Injected into O'Toole's
// system prompt every chat turn.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const content = await loadMemory(user.id)
  return Response.json({ ok: true, content })
}

export async function PUT(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { content?: unknown }
  const content = typeof body.content === 'string' ? body.content : ''
  await saveMemory(user.id, content)
  return Response.json({ ok: true })
}
