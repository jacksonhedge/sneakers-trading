import { getServerClient } from './supabase-server'

export type GlobalMemory = {
  persona_addendum: string
  content: string
  enabled: boolean
  updated_at: string | null
  updated_by: string | null
}

export type GlobalSourceKind = 'twitter' | 'github' | 'article' | 'note'

export type GlobalSource = {
  id: number
  kind: GlobalSourceKind
  label: string
  content: string
  market_filter: string | null
  enabled: boolean
  created_at: string
  updated_at: string | null
  updated_by: string | null
}

const EMPTY_MEMORY: GlobalMemory = {
  persona_addendum: '',
  content: '',
  enabled: false,
  updated_at: null,
  updated_by: null,
}

export async function getGlobalMemory(): Promise<GlobalMemory> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('otoole_global_memory')
    .select('persona_addendum, content, enabled, updated_at, updated_by')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data) return EMPTY_MEMORY
  return {
    persona_addendum: data.persona_addendum ?? '',
    content: data.content ?? '',
    enabled: data.enabled ?? false,
    updated_at: data.updated_at ?? null,
    updated_by: data.updated_by ?? null,
  }
}

export async function getGlobalSources(): Promise<GlobalSource[]> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('otoole_global_sources')
    .select(
      'id, kind, label, content, market_filter, enabled, created_at, updated_at, updated_by',
    )
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data as GlobalSource[]
}

/**
 * Build the global block to inject into O'Toole's system prompt at chat time.
 *
 * Returns the persona-addendum + memory content + matching sources concatenated
 * as a single string (markdown-style headed sections), or empty string if
 * nothing's enabled / nothing matches.
 *
 * `userMessage` is matched against each source's `market_filter` (comma-
 * separated keywords, case-insensitive substring). Empty/null filter = always
 * fire.
 *
 * The other tool's per-user `buildUserContext` should be called separately;
 * the chat route concatenates them in order. This function is intentionally
 * scope-pure — it does NOT read user_otoole_* tables.
 */
export async function buildGlobalContext(userMessage: string): Promise<string> {
  const [memory, sources] = await Promise.all([
    getGlobalMemory(),
    getGlobalSources(),
  ])

  const parts: string[] = []

  if (memory.enabled) {
    if (memory.persona_addendum.trim()) {
      parts.push(
        `# Operator persona addendum\n\n${memory.persona_addendum.trim()}`,
      )
    }
    if (memory.content.trim()) {
      parts.push(
        `# O'Toole baseline knowledge & strategy\n\n${memory.content.trim()}`,
      )
    }
  }

  const lower = userMessage.toLowerCase()
  for (const s of sources) {
    if (!s.enabled) continue
    if (s.market_filter && s.market_filter.trim()) {
      const keywords = s.market_filter
        .toLowerCase()
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
      if (keywords.length && !keywords.some((k) => lower.includes(k))) continue
    }
    parts.push(`# Source — ${s.label}\n\n${s.content.trim()}`)
  }

  return parts.join('\n\n---\n\n')
}
