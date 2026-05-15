import Anthropic from '@anthropic-ai/sdk'

export type KeywordSuggestionResult =
  | { ok: true; keywords: string[] }
  | { ok: false; message: string }

const MODEL = 'claude-haiku-4-5'
const MAX_INPUT_CHARS = 4000
const MAX_KEYWORDS = 8
const MAX_KEYWORD_LEN = 60

const SYSTEM = `You are a keyword extraction tool for a sports / prediction-market system called O'Toole.

A snippet of text (a tweet, article, README excerpt, or note) is provided. Return a short list of lowercase keywords or short phrases that the operator should match against user chat messages so this snippet fires as relevant context.

Rules:
- 3 to ${MAX_KEYWORDS} items
- lowercase only
- prefer entities and topics: sports, leagues, teams, player names, market types, strategies, venues (e.g. "nfl", "injury", "patrick mahomes", "moneyline", "kelly criterion", "polymarket")
- avoid generic words ("the", "team", "game", "trade", "bet", "market") unless qualified
- avoid synonyms — pick the phrasing a user is most likely to type
- output ONLY a comma-separated list, no labels, no preamble, no explanation`

export async function suggestFilterKeywords(
  label: string,
  content: string,
): Promise<KeywordSuggestionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: false, message: 'ANTHROPIC_API_KEY not set on server' }
  }
  const trimmedLabel = label.trim().slice(0, 200)
  const trimmedContent = content.trim().slice(0, MAX_INPUT_CHARS)
  if (!trimmedLabel && !trimmedContent) {
    return { ok: false, message: 'label or content required' }
  }

  const client = new Anthropic({ apiKey })

  let raw = ''
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Label: ${trimmedLabel || '(none)'}\n\n---\n\n${trimmedContent || '(empty)'}`,
        },
      ],
    })
    raw = res.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim()
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, message: 'Anthropic rate limit — try again' }
    }
    if (err instanceof Anthropic.APIError) {
      return {
        ok: false,
        message: `Anthropic ${err.status ?? '?'}: ${err.message}`,
      }
    }
    return {
      ok: false,
      message: `LLM call failed: ${err instanceof Error ? err.message : 'unknown'}`,
    }
  }

  const keywords = raw
    .split(/[,\n]/)
    .map((k) => k.trim().toLowerCase())
    .map((k) => k.replace(/^[-•*\d.)\s]+/, '').replace(/[.;]+$/, '').trim())
    .filter((k) => k.length > 0 && k.length <= MAX_KEYWORD_LEN)

  const seen = new Set<string>()
  const unique = keywords.filter((k) => {
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  if (unique.length === 0) {
    return { ok: false, message: 'no keywords returned — content too sparse?' }
  }

  return { ok: true, keywords: unique.slice(0, MAX_KEYWORDS) }
}
