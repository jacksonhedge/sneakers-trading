'use client'

import { useEffect, useRef, useState } from 'react'

// Bloomberg-style rolling number with direction-tinted flash and
// right-anchored digit identity (so 9 → 10 grows a new leftmost digit
// gracefully instead of remounting everything).
//
// Per-digit comparison: only digits that actually changed roll.
// Length change: new digits slide in from the left with a max-width
// grow; removed digits slide out to the left. Existing positions
// (right-anchored) keep their DOM identity so the CSS transform
// transition fires for value changes.

interface Props {
  value: number
  format?: (n: number) => string
  flashScale?: number
  className?: string
  ariaLabel?: string
}

const ROLL_DURATION_MS = 250
const FLASH_FADE_IN_MS = 60
const FLASH_HOLD_MS = 100
const FLASH_FADE_OUT_MS = 240
const FLASH_TOTAL_MS = FLASH_FADE_IN_MS + FLASH_HOLD_MS + FLASH_FADE_OUT_MS

const ROLL_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const FLASH_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'

const UP_FLASH_RGB = '0, 112, 60'
const DOWN_FLASH_RGB = '239, 68, 68'

type Position =
  | { rPos: number; state: 'kept'; newChar: string; oldChar: string }
  | { rPos: number; state: 'added'; newChar: string }
  | { rPos: number; state: 'removed'; oldChar: string }

function computePositions(newStr: string, oldStr: string): Position[] {
  const unionLen = Math.max(newStr.length, oldStr.length)
  const positions: Position[] = []
  for (let r = 0; r < unionLen; r++) {
    const newChar = r < newStr.length ? newStr[newStr.length - 1 - r] : null
    const oldChar = r < oldStr.length ? oldStr[oldStr.length - 1 - r] : null
    if (newChar !== null && oldChar !== null) {
      positions.push({ rPos: r, state: 'kept', newChar, oldChar })
    } else if (newChar !== null) {
      positions.push({ rPos: r, state: 'added', newChar })
    } else if (oldChar !== null) {
      positions.push({ rPos: r, state: 'removed', oldChar })
    }
  }
  // Visual order is left-to-right (highest rPos first).
  return positions.reverse()
}

export function RollingNumber({
  value,
  format,
  flashScale = 1,
  className,
  ariaLabel,
}: Props) {
  const formatted = format ? format(value) : String(value)
  const prevValueRef = useRef(value)
  const prevFormattedRef = useRef(formatted)
  const reducedMotion = usePrefersReducedMotion()

  const [direction, setDirection] = useState<'up' | 'down' | null>(null)
  const [flashStage, setFlashStage] = useState<'idle' | 'in' | 'out'>('idle')
  // Force a re-render after the flash completes so prev refs propagate.
  const [, setRev] = useState(0)

  useEffect(() => {
    if (value === prevValueRef.current) return
    const dir = value > prevValueRef.current ? 'up' : 'down'
    setDirection(dir)
    setFlashStage('in')

    const inT = setTimeout(() => setFlashStage('out'), FLASH_FADE_IN_MS + FLASH_HOLD_MS)
    const outT = setTimeout(() => {
      prevValueRef.current = value
      prevFormattedRef.current = formatted
      setFlashStage('idle')
      setRev((r) => r + 1)
    }, FLASH_TOTAL_MS)

    return () => {
      clearTimeout(inT)
      clearTimeout(outT)
    }
  }, [value, formatted])

  const newStr = formatted
  const oldStr = prevFormattedRef.current
  const positions = computePositions(newStr, oldStr)

  const delta = Math.abs(value - prevValueRef.current)
  const intensity = Math.min(1, delta / flashScale)
  const peakOpacity = 0.1 + intensity * 0.25

  let flashOpacity = 0
  let flashTransitionMs = 0
  if (flashStage === 'in') {
    flashOpacity = peakOpacity
    flashTransitionMs = FLASH_FADE_IN_MS
  } else if (flashStage === 'out') {
    flashOpacity = 0
    flashTransitionMs = FLASH_FADE_OUT_MS
  }

  const flashRgb = direction === 'up' ? UP_FLASH_RGB : DOWN_FLASH_RGB

  return (
    <span
      className={`relative inline-block font-mono tabular-nums leading-none ${className ?? ''}`}
      aria-label={ariaLabel}
      style={{ whiteSpace: 'nowrap' }}
    >
      {/* Inline keyframes so this component is fully self-contained
          (no global CSS file dependency). */}
      <style>{`
        @keyframes sneakers-roll-add {
          from { opacity: 0; max-width: 0; transform: translateX(-0.35em); }
          to   { opacity: 1; max-width: 1ch; transform: translateX(0); }
        }
        @keyframes sneakers-roll-remove {
          from { opacity: 1; max-width: 1ch; transform: translateX(0); }
          to   { opacity: 0; max-width: 0; transform: translateX(-0.35em); }
        }
      `}</style>

      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none rounded-[3px]"
        style={{
          backgroundColor: `rgba(${flashRgb}, ${flashOpacity})`,
          transition: `background-color ${flashTransitionMs}ms ${FLASH_EASE}`,
          marginLeft: '-3px',
          marginRight: '-3px',
          left: '3px',
          right: '3px',
        }}
      />

      <span aria-hidden className="relative">
        {positions.map((pos) => {
          if (pos.state === 'kept') {
            const isDigit = /\d/.test(pos.newChar)
            return isDigit ? (
              <DigitColumn
                key={`kept-${pos.rPos}`}
                digit={parseInt(pos.newChar, 10)}
                reducedMotion={reducedMotion}
              />
            ) : (
              <StaticChar key={`kept-${pos.rPos}`} ch={pos.newChar} />
            )
          }
          if (pos.state === 'added') {
            const isDigit = /\d/.test(pos.newChar)
            return (
              <Column
                key={`add-${pos.rPos}`}
                animation={
                  reducedMotion
                    ? undefined
                    : `sneakers-roll-add ${ROLL_DURATION_MS}ms ${ROLL_EASE} forwards`
                }
              >
                {isDigit ? (
                  <DigitColumn
                    digit={parseInt(pos.newChar, 10)}
                    reducedMotion={reducedMotion}
                  />
                ) : (
                  <StaticChar ch={pos.newChar} />
                )}
              </Column>
            )
          }
          // removed
          const isDigit = /\d/.test(pos.oldChar)
          return (
            <Column
              key={`rm-${pos.rPos}`}
              animation={
                reducedMotion
                  ? undefined
                  : `sneakers-roll-remove ${ROLL_DURATION_MS}ms ${ROLL_EASE} forwards`
              }
            >
              {isDigit ? (
                <DigitColumn
                  digit={parseInt(pos.oldChar, 10)}
                  reducedMotion={reducedMotion}
                />
              ) : (
                <StaticChar ch={pos.oldChar} />
              )}
            </Column>
          )
        })}
      </span>
    </span>
  )
}

// Wrapper that applies an enter / exit CSS animation to its child.
// Used for added + removed positions so length changes feel smooth.
function Column({
  children,
  animation,
}: {
  children: React.ReactNode
  animation: string | undefined
}) {
  return (
    <span
      className="inline-block overflow-hidden"
      style={{
        verticalAlign: 'top',
        animation,
        willChange: animation ? 'opacity, max-width, transform' : undefined,
      }}
    >
      {children}
    </span>
  )
}

function StaticChar({ ch }: { ch: string }) {
  return (
    <span
      className="inline-block"
      style={{
        verticalAlign: 'top',
        minWidth: ch === ' ' ? '0.5ch' : undefined,
      }}
    >
      {ch === ' ' ? ' ' : ch}
    </span>
  )
}

function DigitColumn({
  digit,
  reducedMotion,
}: {
  digit: number
  reducedMotion: boolean
}) {
  return (
    <span
      className="inline-block overflow-hidden"
      style={{
        height: '1em',
        lineHeight: 1,
        verticalAlign: 'top',
        width: '1ch',
      }}
    >
      <span
        className="block"
        style={{
          transform: `translateY(${-digit}em)`,
          transition: reducedMotion
            ? 'none'
            : `transform ${ROLL_DURATION_MS}ms ${ROLL_EASE}`,
          willChange: 'transform',
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span
            key={d}
            className="block text-center"
            style={{ height: '1em', lineHeight: 1 }}
          >
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefers(mq.matches)
    const handler = (e: MediaQueryListEvent) => setPrefers(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return prefers
}
