// Universal email-list parser. Accepts pasted text in any common format —
// CSV, comma/semicolon-separated, newline-separated, mailto-wrapped,
// "Name <email>" pairs, vCard EMAIL: lines, Apple/Outlook/Slack copy-paste.
// Returns a deduped, lowercased, validated list.

const EMAIL_RE = /([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g

export interface ParseResult {
  emails: string[]            // unique, lowercased, sorted
  invalidLines: string[]      // lines with no email-shaped substring
  duplicateCount: number      // how many dupes we deduped
}

export function parseEmailList(input: string): ParseResult {
  if (!input || typeof input !== 'string') {
    return { emails: [], invalidLines: [], duplicateCount: 0 }
  }

  // Find every email-shaped substring. The regex with g flag matches
  // across the whole input, so commas/newlines/wrapping all just get
  // skipped over.
  const matches = input.match(EMAIL_RE) ?? []
  const lowered = matches.map((m) => m.toLowerCase().trim())

  // Dedupe while preserving first-seen order (so the user sees the list
  // in roughly the order they pasted it). Sort at the end for stability.
  const seen = new Set<string>()
  const unique: string[] = []
  let duplicateCount = 0
  for (const e of lowered) {
    if (seen.has(e)) {
      duplicateCount += 1
      continue
    }
    seen.add(e)
    unique.push(e)
  }
  unique.sort()

  // Find lines that had no email at all — useful feedback. Split on any
  // common delimiter, filter out empty + email-bearing lines.
  const lines = input
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const invalidLines = lines.filter((l) => !EMAIL_RE.test(l))
  // Reset regex state since /g is stateful
  EMAIL_RE.lastIndex = 0

  return { emails: unique, invalidLines, duplicateCount }
}

// Lighter-weight check used for the "remove invalid pill" affordance —
// strict enough to reject obviously-broken addresses, loose enough not to
// reject niche-but-valid ones.
export function isValidEmail(email: string): boolean {
  if (!email) return false
  const trimmed = email.trim().toLowerCase()
  // Standard pattern: local@domain.tld with at least 2-char TLD.
  return /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)
}
