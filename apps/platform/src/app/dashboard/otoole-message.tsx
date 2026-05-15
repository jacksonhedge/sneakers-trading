'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

// Inline-only markdown renderer for O'Toole's chat replies. Supports:
//   - **bold**         → <strong>
//   - [text](/path)    → <Link prefetch={false}>
// Anything else is plain text. We deliberately don't pull in
// react-markdown — the chat panel only needs these two primitives,
// and a 200-line parser beats a 50KB dep.
//
// Links are restricted to same-origin paths starting with "/" so the
// model can't sneak an off-site URL into a click. External links would
// need a separate <a target="_blank"> branch, which we don't want
// O'Toole to emit anyway.

interface Token {
  kind: 'text' | 'bold' | 'link'
  body: string
  href?: string
}

const BOLD_RE = /\*\*([^*]+?)\*\*/g
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g

function tokenize(line: string): Token[] {
  // Walk the line and find the earliest match of either pattern.
  // Emit plain text up to it, then the matched token, then continue.
  const out: Token[] = []
  let cursor = 0
  while (cursor < line.length) {
    BOLD_RE.lastIndex = cursor
    LINK_RE.lastIndex = cursor
    const boldMatch = BOLD_RE.exec(line)
    const linkMatch = LINK_RE.exec(line)
    let next:
      | { kind: 'bold'; start: number; end: number; body: string }
      | { kind: 'link'; start: number; end: number; body: string; href: string }
      | null = null

    if (boldMatch && (!linkMatch || boldMatch.index <= linkMatch.index)) {
      next = {
        kind: 'bold',
        start: boldMatch.index,
        end: boldMatch.index + boldMatch[0].length,
        body: boldMatch[1],
      }
    } else if (linkMatch) {
      next = {
        kind: 'link',
        start: linkMatch.index,
        end: linkMatch.index + linkMatch[0].length,
        body: linkMatch[1],
        href: linkMatch[2],
      }
    }

    if (!next) {
      out.push({ kind: 'text', body: line.slice(cursor) })
      break
    }
    if (next.start > cursor) {
      out.push({ kind: 'text', body: line.slice(cursor, next.start) })
    }
    if (next.kind === 'bold') {
      out.push({ kind: 'bold', body: next.body })
    } else {
      out.push({ kind: 'link', body: next.body, href: next.href })
    }
    cursor = next.end
  }
  return out
}

function renderTokens(tokens: Token[], lineKey: string): ReactNode[] {
  return tokens.map((t, i) => {
    const k = `${lineKey}:${i}`
    if (t.kind === 'bold') {
      return (
        <strong key={k} className="font-semibold text-stone-900">
          {t.body}
        </strong>
      )
    }
    if (t.kind === 'link') {
      const safe = typeof t.href === 'string' && t.href.startsWith('/') && !t.href.startsWith('//')
      if (!safe) {
        return <span key={k}>{t.body}</span>
      }
      return (
        <Link
          key={k}
          href={t.href!}
          prefetch={false}
          className="text-emerald-700 hover:text-emerald-800 underline underline-offset-2 decoration-emerald-300 hover:decoration-emerald-500"
        >
          {t.body}
        </Link>
      )
    }
    return <span key={k}>{t.body}</span>
  })
}

export type OtooleTextSize = 'sm' | 'md' | 'lg'

const SIZE_CLASS: Record<OtooleTextSize, string> = {
  sm: 'text-xs leading-relaxed',
  md: 'text-sm leading-relaxed',
  lg: 'text-base leading-relaxed',
}

export function OtooleMessage({
  content,
  size = 'md',
}: {
  content: string
  size?: OtooleTextSize
}) {
  // Split on newlines so paragraphs render as separate blocks; the
  // model uses them as soft breaks. Each line is then tokenized for
  // bold + link inlines.
  const lines = content.split('\n')
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        if (line.trim() === '') {
          // Preserve blank-line spacing between paragraphs.
          return <div key={`blank-${i}`} className="h-1" />
        }
        const tokens = tokenize(line)
        return (
          <p key={i} className={SIZE_CLASS[size]}>
            {renderTokens(tokens, String(i))}
          </p>
        )
      })}
    </div>
  )
}

// Three-dot typing indicator. Looks like an iMessage bubble — three
// circles bouncing on a stagger, wrapped in a stone-50 pill. Drops in
// while pending replaces the old "Thinking…" text.
export function OtooleTyping() {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-2xl rounded-bl-sm bg-stone-100 ring-1 ring-stone-200">
      <style>{`
        @keyframes otoole-typing {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%           { transform: translateY(-3px); opacity: 1; }
        }
        .otoole-dot { animation: otoole-typing 1.2s ease-in-out infinite; }
      `}</style>
      <span
        className="otoole-dot inline-block w-1.5 h-1.5 rounded-full bg-stone-500"
        style={{ animationDelay: '0s' }}
        aria-hidden
      />
      <span
        className="otoole-dot inline-block w-1.5 h-1.5 rounded-full bg-stone-500"
        style={{ animationDelay: '0.2s' }}
        aria-hidden
      />
      <span
        className="otoole-dot inline-block w-1.5 h-1.5 rounded-full bg-stone-500"
        style={{ animationDelay: '0.4s' }}
        aria-hidden
      />
      <span className="sr-only">O&apos;Toole is typing…</span>
    </div>
  )
}
