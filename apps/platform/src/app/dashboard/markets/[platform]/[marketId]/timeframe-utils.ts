// Pure types + helpers for timeframe handling. No React, no client hooks —
// safe to import from server components AND client components. The
// 'use client' file (timeframe-tabs.tsx) re-exports these so existing
// client callers don't have to change their imports.

const TIMEFRAMES = ['5m', '1h', 'D', '1w'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

export const TIMEFRAMES_LIST: readonly Timeframe[] = TIMEFRAMES
export const DEFAULT_TIMEFRAME: Timeframe = '1w'

export function isTimeframe(v: string | null | undefined): v is Timeframe {
  return v != null && (TIMEFRAMES as readonly string[]).includes(v)
}

export function timeframeToDays(tf: Timeframe): number {
  switch (tf) {
    case '5m':
      return 5 / 1440
    case '1h':
      return 1 / 24
    case 'D':
      return 1
    case '1w':
      return 7
  }
}
