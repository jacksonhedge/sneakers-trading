import type { GlobalSourceKind } from './otoole-global-memory'

export type FetchedSource = {
  kind: GlobalSourceKind
  label: string
  content: string
}

export type FetchedSourceResult =
  | { ok: true; source: FetchedSource }
  | { ok: false; message: string }

const FETCH_TIMEOUT_MS = 15_000
const MAX_CONTENT = 16 * 1024
const TWITTER_HOSTS = new Set([
  'twitter.com',
  'www.twitter.com',
  'x.com',
  'www.x.com',
  'mobile.twitter.com',
  'mobile.x.com',
])
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com', 'gist.github.com'])

function detectKind(host: string): GlobalSourceKind {
  const h = host.toLowerCase()
  if (TWITTER_HOSTS.has(h)) return 'twitter'
  if (GITHUB_HOSTS.has(h)) return 'github'
  return 'article'
}

export async function fetchSourceFromUrl(
  rawUrl: string,
): Promise<FetchedSourceResult> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    return { ok: false, message: 'invalid URL' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'URL must be http(s)' }
  }
  if (!parsed.hostname) {
    return { ok: false, message: 'URL missing host' }
  }

  const kind = detectKind(parsed.hostname)
  const readerUrl = `https://r.jina.ai/${parsed.toString()}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(readerUrl, {
      signal: ctrl.signal,
      headers: { Accept: 'text/plain, text/markdown' },
    })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, message: 'fetch timed out (15s)' }
    }
    const reason = err instanceof Error ? err.message : 'unknown error'
    return { ok: false, message: `fetch failed: ${reason}` }
  }
  clearTimeout(timer)

  if (!res.ok) {
    return { ok: false, message: `reader returned HTTP ${res.status}` }
  }

  const raw = await res.text()
  if (!raw.trim()) {
    return { ok: false, message: 'reader returned empty body' }
  }

  let title = ''
  let body = raw
  const titleMatch = raw.match(/^Title:\s*(.+?)\r?\n/)
  if (titleMatch) title = titleMatch[1].trim()
  const split = raw.split(/\r?\nMarkdown Content:\r?\n/)
  if (split.length > 1) body = split.slice(1).join('\nMarkdown Content:\n')

  if (!title) {
    const firstLine = body.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
    title = firstLine.replace(/^#+\s*/, '').slice(0, 200).trim()
  }
  if (!title) title = parsed.hostname

  const content = body.trim().slice(0, MAX_CONTENT)
  const label = title.slice(0, 200)

  return { ok: true, source: { kind, label, content } }
}
