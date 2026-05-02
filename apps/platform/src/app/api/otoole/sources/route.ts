import { getAuthClient } from '@/lib/supabase-auth'
import {
  addSource,
  deleteSource,
  listSources,
  type SourceKind,
} from '@/lib/otoole-memory'

// GET    /api/otoole/sources         → { ok, sources }
// POST   /api/otoole/sources         body: { kind, label, content, marketFilter? }
// DELETE /api/otoole/sources?id=     → { ok }

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS: readonly SourceKind[] = ['twitter', 'github', 'article', 'note'] as const

function parseKind(v: unknown): SourceKind | null {
  if (typeof v !== 'string') return null
  return (KINDS as readonly string[]).includes(v) ? (v as SourceKind) : null
}

export async function GET() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const sources = await listSources(user.id)
  return Response.json({ ok: true, sources })
}

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const kind = parseKind(body.kind) ?? 'note'
  const label = typeof body.label === 'string' ? body.label : ''
  const content = typeof body.content === 'string' ? body.content : ''
  const marketFilter =
    typeof body.marketFilter === 'string' ? body.marketFilter : null

  if (!label.trim() || !content.trim()) {
    return Response.json(
      { error: 'missing_fields', message: 'Label and content are both required.' },
      { status: 400 },
    )
  }

  try {
    const source = await addSource(user.id, { kind, label, content, marketFilter })
    return Response.json({ ok: true, source })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to save'
    return Response.json({ error: 'save_failed', message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const idParam = new URL(req.url).searchParams.get('id')
  const id = idParam ? Number(idParam) : NaN
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'invalid_id' }, { status: 400 })
  }
  await deleteSource(user.id, id)
  return Response.json({ ok: true })
}
