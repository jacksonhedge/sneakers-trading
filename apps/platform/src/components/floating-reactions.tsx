'use client'

import { useEffect } from 'react'

// Live "Instagram Reels" style emoji bursts. Each reaction starts small
// at its origin (xPct, yPct as %), pops to full size, floats upward
// while drifting slightly horizontally, then fades at the top. Used by
// the horse-race surface so every buy event visibly "puffs" — yours
// pops from your trade button area, others pop from spots scattered
// across the chart pane simulating live activity from rival players.

export interface Reaction {
  id: string
  emoji: string
  /** Starting x in % of container width (0–100). */
  xPct: number
  /** Starting y in % from bottom of container (0–100). Default 8. */
  yPct?: number
  /** Tiny tag emoji rendered next to the main one (e.g. 🤖 for bots). */
  tag?: string
}

export const REACTION_TTL_MS = 2800

interface Props {
  reactions: Reaction[]
  onExpire: (id: string) => void
}

export function FloatingReactions({ reactions, onExpire }: Props) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <style>{`
        @keyframes insta-float {
          0%   { transform: translateY(0) translateX(0) scale(0.3); opacity: 0; }
          10%  { transform: translateY(-12px) translateX(0) scale(1.1); opacity: 1; }
          18%  { transform: translateY(-22px) translateX(0) scale(1); opacity: 1; }
          70%  { opacity: 1; }
          100% {
            transform: translateY(-220px) translateX(var(--insta-drift, 0px)) scale(0.95);
            opacity: 0;
          }
        }
      `}</style>
      {reactions.map((r) => (
        <Bubble key={r.id} reaction={r} onExpire={() => onExpire(r.id)} />
      ))}
    </div>
  )
}

function Bubble({ reaction, onExpire }: { reaction: Reaction; onExpire: () => void }) {
  useEffect(() => {
    const t = setTimeout(onExpire, REACTION_TTL_MS)
    return () => clearTimeout(t)
  }, [onExpire])

  // Deterministic drift from id so re-renders don't jitter the path.
  const driftSeed = hashStr(reaction.id) % 100
  const driftPx = ((driftSeed - 50) / 50) * 36 // -36..36 px

  const yBottom = reaction.yPct ?? 8

  return (
    <div
      className="absolute"
      style={{
        left: `${reaction.xPct}%`,
        bottom: `${yBottom}%`,
        transform: 'translateX(-50%)',
        animation: `insta-float ${REACTION_TTL_MS}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
        // Custom prop consumed by the keyframes block above.
        ['--insta-drift' as string]: `${driftPx}px`,
        willChange: 'transform, opacity',
      }}
    >
      <span
        className="inline-flex items-center gap-0.5 select-none"
        style={{
          fontSize: 28,
          lineHeight: 1,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
        }}
        aria-hidden
      >
        <span>{reaction.emoji}</span>
        {reaction.tag && (
          <span style={{ fontSize: 14, marginLeft: -2 }}>{reaction.tag}</span>
        )}
      </span>
    </div>
  )
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
