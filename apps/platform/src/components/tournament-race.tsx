'use client'

import { Reorder } from 'motion/react'
import { RollingNumber } from './rolling-number'

// Live tournament race — strikes are the horses, probabilities are the
// horse positions, user trades YES/NO on each strike with their cash.
//
// Per strike:
//   - YES side: long the strike. price = strike's current probability.
//   - NO  side: short the strike. price = 1 - probability.
//   - User can BUY either side (spends cash, gets shares) or SELL their
//     position back at the current mark price.
//
// Lanes reorder (FLIP) when probabilities cross — same Reorder.Group
// trick as the leaderboard race.

export interface Strike {
  id: string
  label: string
  emoji: string
  yesProb: number
  yesPosition: number  // shares held
  yesAvgPrice: number  // weighted-avg cost basis
  noPosition: number
  noAvgPrice: number
}

export type Side = 'yes' | 'no'

interface Props {
  strikes: Strike[]
  cash: number
  startingCash: number
  /** Trade size in dollars per BUY click. Default $5. */
  buyAmountUsd?: number
  /** Locked = read-only (resolved or pre-start). Buttons stay visible
   *  but disabled. */
  locked?: boolean
  /** Tournament mode. 'manual' = user clicks BUY/SELL. 'autobot' = O'Toole
   *  drives every trade; user-side buttons are disabled and a banner
   *  surfaces who's running the trades. */
  mode?: 'manual' | 'autobot'
  onBuy: (strikeId: string, side: Side) => void
  onSell: (strikeId: string, side: Side) => void
}

export function TournamentRace({
  strikes,
  cash,
  startingCash,
  buyAmountUsd = 5,
  locked = false,
  mode = 'manual',
  onBuy,
  onSell,
}: Props) {
  const isAutobot = mode === 'autobot'
  const totalEquity =
    cash +
    strikes.reduce((acc, s) => {
      const yesValue = s.yesPosition * s.yesProb
      const noValue = s.noPosition * (1 - s.yesProb)
      return acc + yesValue + noValue
    }, 0)
  const returnPct = startingCash > 0 ? (totalEquity - startingCash) / startingCash : 0

  // Sort strikes descending by yesProb so the leader is on top.
  const sorted = [...strikes].sort((a, b) => b.yesProb - a.yesProb)

  return (
    <div className="space-y-4">
      {isAutobot && (
        <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-4 py-3 flex items-center gap-3 shadow-md">
          <span className="text-2xl leading-none" aria-hidden>🤖</span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold tracking-[0.2em] text-emerald-100 uppercase">
              Auto-Bot Round
            </div>
            <div className="font-bold text-sm leading-tight">
              O&apos;Toole is racing this one for you
            </div>
            <div className="text-[11px] text-emerald-100 mt-0.5 leading-snug">
              Manual buttons are off. Watch the strategy unfold; if you want to take
              the wheel, switch to a MANUAL round in the lobby.
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </span>
        </div>
      )}

      <ScoreBar
        cash={cash}
        startingCash={startingCash}
        totalEquity={totalEquity}
        returnPct={returnPct}
        isAutobot={isAutobot}
      />
      <Reorder.Group
        axis="y"
        values={sorted}
        onReorder={() => {
          /* noop */
        }}
        className="space-y-3"
      >
        {sorted.map((s, idx) => (
          <Reorder.Item
            key={s.id}
            value={s}
            drag={false}
            layout="position"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <StrikeLane
              strike={s}
              rank={idx + 1}
              cash={cash}
              buyAmountUsd={buyAmountUsd}
              locked={locked || isAutobot}
              isAutobot={isAutobot}
              onBuy={onBuy}
              onSell={onSell}
            />
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  )
}

function ScoreBar({
  cash,
  startingCash,
  totalEquity,
  returnPct,
  isAutobot,
}: {
  cash: number
  startingCash: number
  totalEquity: number
  returnPct: number
  isAutobot: boolean
}) {
  const isUp = returnPct >= 0
  const tone = isUp ? 'text-emerald-700' : 'text-red-700'
  return (
    <div className="rounded-2xl bg-stone-900 text-white p-4 flex items-center gap-6 flex-wrap">
      <Stat
        label="CASH"
        value={`$${cash.toFixed(2)}`}
        sub={`of ${`$${startingCash.toFixed(0)}`} start`}
        tone="text-white"
      />
      <Stat
        label="TOTAL EQUITY"
        value={`$${totalEquity.toFixed(2)}`}
        tone="text-white"
        sub={isAutobot ? "🤖 O'Toole driving" : 'manual mode'}
      />
      <div className="flex flex-col">
        <span className="text-[9px] tracking-wider text-stone-700 uppercase">RETURN</span>
        <span className={`text-lg font-bold font-mono tabular-nums ${tone}`}>
          {isUp ? '+' : ''}
          <RollingNumber
            value={returnPct}
            format={(p) => `${(p * 100).toFixed(2)}%`}
            flashScale={0.02}
          />
        </span>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: string
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] tracking-wider text-stone-700 uppercase">{label}</span>
      <span className={`text-lg font-bold font-mono tabular-nums ${tone ?? 'text-white'}`}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-stone-700 font-mono">{sub}</span>}
    </div>
  )
}

function StrikeLane({
  strike,
  rank,
  cash,
  buyAmountUsd,
  locked,
  isAutobot,
  onBuy,
  onSell,
}: {
  strike: Strike
  rank: number
  cash: number
  buyAmountUsd: number
  locked: boolean
  isAutobot: boolean
  onBuy: (id: string, side: Side) => void
  onSell: (id: string, side: Side) => void
}) {
  const yesPrice = strike.yesProb
  const noPrice = 1 - strike.yesProb
  const yesValue = strike.yesPosition * yesPrice
  const noValue = strike.noPosition * noPrice
  const yesPnl = strike.yesPosition > 0 ? yesValue - strike.yesPosition * strike.yesAvgPrice : 0
  const noPnl = strike.noPosition > 0 ? noValue - strike.noPosition * strike.noAvgPrice : 0

  const canBuyYes = !locked && cash >= 0.5 && yesPrice > 0
  const canBuyNo = !locked && cash >= 0.5 && noPrice > 0
  const canSellYes = !locked && strike.yesPosition > 0
  const canSellNo = !locked && strike.noPosition > 0

  const lanePct = Math.max(2, Math.min(98, yesPrice * 100))

  return (
    <div className="rounded-xl bg-white ring-1 ring-stone-200 overflow-hidden">
      {/* Lane track + horse */}
      <div className="relative h-12 bg-stone-50 border-b border-stone-200">
        {/* Subtle gradient track */}
        <div
          className="absolute inset-y-0 pointer-events-none"
          style={{
            left: '8%',
            right: '4%',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(168,162,158,0.18) 30%, rgba(168,162,158,0.18) 70%, transparent 100%)',
          }}
          aria-hidden
        />
        {/* Start gate */}
        <div className="absolute top-1 bottom-1 w-px bg-stone-300 opacity-60" style={{ left: '7%' }} aria-hidden />
        {/* Finish line — dashed emerald */}
        <div
          className="absolute top-1 bottom-1 w-px"
          style={{
            right: '3%',
            background:
              'repeating-linear-gradient(0deg, rgba(0,112,60,0.7) 0 4px, transparent 4px 8px)',
          }}
          aria-hidden
        />

        {/* Rank + label on left */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
          <span className="font-mono tabular-nums text-[11px] font-bold text-stone-600">
            #{rank}
          </span>
          <span className="text-sm font-bold text-stone-900">{strike.label}</span>
        </div>

        {/* Horse pill — slides via left transition */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20"
          style={{
            left: `calc(8% + ${(lanePct / 100) * 88}%)`,
            transition: 'left 800ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-fuchsia-500 to-rose-500 text-white inline-flex items-center justify-center text-xl shadow-md ring-2 ring-white">
            <span aria-hidden>{strike.emoji}</span>
          </div>
        </div>

        {/* Probability % on right */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 font-mono tabular-nums text-[12px] font-bold text-stone-700">
          <RollingNumber
            value={yesPrice}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            flashScale={0.05}
          />
        </div>
      </div>

      {/* Trade panel — two columns: YES / NO */}
      <div className="grid grid-cols-2 divide-x divide-stone-200">
        <SidePanel
          side="yes"
          price={yesPrice}
          position={strike.yesPosition}
          avgPrice={strike.yesAvgPrice}
          value={yesValue}
          pnl={yesPnl}
          buyAmount={buyAmountUsd}
          canBuy={canBuyYes}
          canSell={canSellYes}
          isAutobot={isAutobot}
          onBuy={() => onBuy(strike.id, 'yes')}
          onSell={() => onSell(strike.id, 'yes')}
        />
        <SidePanel
          side="no"
          price={noPrice}
          position={strike.noPosition}
          avgPrice={strike.noAvgPrice}
          value={noValue}
          pnl={noPnl}
          buyAmount={buyAmountUsd}
          canBuy={canBuyNo}
          canSell={canSellNo}
          isAutobot={isAutobot}
          onBuy={() => onBuy(strike.id, 'no')}
          onSell={() => onSell(strike.id, 'no')}
        />
      </div>
    </div>
  )
}

function SidePanel({
  side,
  price,
  position,
  avgPrice,
  value,
  pnl,
  buyAmount,
  canBuy,
  canSell,
  isAutobot,
  onBuy,
  onSell,
}: {
  side: Side
  price: number
  position: number
  avgPrice: number
  value: number
  pnl: number
  buyAmount: number
  canBuy: boolean
  canSell: boolean
  isAutobot: boolean
  onBuy: () => void
  onSell: () => void
}) {
  const isYes = side === 'yes'
  const headerCls = isYes
    ? 'bg-emerald-50 text-emerald-800'
    : 'bg-rose-50 text-rose-800'
  const buyCls = isYes
    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
    : 'bg-rose-600 text-white hover:bg-rose-700'
  const sellCls = 'border border-stone-300 text-stone-700 hover:bg-stone-50'
  const pnlTone = pnl > 0.01 ? 'text-emerald-700' : pnl < -0.01 ? 'text-red-700' : 'text-stone-700'

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <span
          className={`text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded ${headerCls}`}
        >
          {side.toUpperCase()}
        </span>
        <span className="font-mono tabular-nums font-bold text-sm text-stone-900">
          <RollingNumber
            value={price}
            format={(v) => `${Math.round(v * 100)}¢`}
            flashScale={0.05}
          />
        </span>
      </div>
      {position > 0 ? (
        <div className="text-[10px] text-stone-700 font-mono tabular-nums leading-tight">
          <div>
            pos {position.toFixed(2)}sh · avg {Math.round(avgPrice * 100)}¢
          </div>
          <div className={pnlTone}>
            value ${value.toFixed(2)} {pnl !== 0 ? `(${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})` : ''}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-stone-700 font-mono">no position</div>
      )}
      <div className="flex gap-1.5">
        {isAutobot ? (
          <div className="flex-1 text-[10px] tracking-wider font-bold px-2 py-1.5 rounded bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 inline-flex items-center justify-center gap-1">
            <span aria-hidden>🤖</span>
            <span>O&apos;TOOLE DRIVING</span>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onBuy}
              disabled={!canBuy}
              className={`flex-1 text-[10px] tracking-wider font-bold px-2 py-1.5 rounded transition disabled:opacity-40 disabled:cursor-not-allowed ${buyCls}`}
            >
              BUY +${buyAmount}
            </button>
            {position > 0 && (
              <button
                type="button"
                onClick={onSell}
                disabled={!canSell}
                className={`text-[10px] tracking-wider font-bold px-2 py-1.5 rounded transition disabled:opacity-40 disabled:cursor-not-allowed ${sellCls}`}
              >
                SELL
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
