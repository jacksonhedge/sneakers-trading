"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  CROSS_PLATFORM_PRICES,
  SELECTED_MARKET,
  buildCandles,
  formatUsd,
} from "@/lib/mockData";
import { LogoChip } from "./LogoChip";
import { Badge } from "./Badge";
import { PriceChart } from "./PriceChart";

const RANGES = ["1H", "6H", "1D", "All"] as const;
const INTERVALS = ["1m", "5m", "15m", "1H"] as const;

// Deterministic — built once at module load so SSR + client are identical.
const CANDLES = buildCandles(180, 58, 1337);

export function CenterPanel() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1D");
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]>("5m");
  const m = SELECTED_MARKET;

  const best = Math.max(...CROSS_PLATFORM_PRICES.map((p) => p.priceCents));
  const worst = Math.min(...CROSS_PLATFORM_PRICES.map((p) => p.priceCents));
  const spread = best - worst;

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-bg-base overflow-hidden">
      {/* Action bar: BUY YES / BUY NO + market meta + OHLCV */}
      <div className="flex items-stretch h-[64px] border-b border-border">
        <div className="flex items-center gap-2 pl-4 pr-4 border-r border-border">
          <button className="h-9 px-4 rounded bg-accent/15 border border-accent/40 text-accent font-mono font-semibold tracking-[0.08em] text-[12px] hover:bg-accent/25 hover:border-accent transition-colors">
            BUY YES · 62.4¢
          </button>
          <button className="h-9 px-4 rounded bg-danger/10 border border-danger/40 text-danger font-mono font-semibold tracking-[0.08em] text-[12px] hover:bg-danger/20 hover:border-danger transition-colors">
            BUY NO · 37.6¢
          </button>
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-4 px-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge tone="cftc">{m.platform}</Badge>
              <span className="text-[10px] tracking-[0.1em] uppercase text-neutral-data">
                Prediction Market
              </span>
            </div>
            <div className="truncate text-[14px] font-medium text-neutral-strong mt-0.5">
              {m.question}
            </div>
          </div>

          <div className="ml-auto shrink-0 hidden xl:flex items-center gap-4 font-mono num text-[11px]">
            <Kv k="O" v={`${m.open.toFixed(1)}¢`} />
            <Kv k="H" v={`${m.high.toFixed(1)}¢`} accent="accent" />
            <Kv k="L" v={`${m.low.toFixed(1)}¢`} accent="danger" />
            <Kv k="C" v={`${m.close.toFixed(1)}¢`} />
            <Kv k="V" v={`$${m.volume24h.toLocaleString("en-US")}`} />
          </div>
        </div>
      </div>

      {/* Chart toolbar */}
      <div className="h-9 px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-1">
          {INTERVALS.map((i) => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              className={cn(
                "h-6 px-2 rounded text-[10px] font-mono tracking-[0.04em] transition-colors",
                interval === i
                  ? "bg-bg-elevated text-neutral-strong border border-border-strong"
                  : "text-neutral-data hover:text-neutral-strong",
              )}
            >
              {i}
            </button>
          ))}
          <span className="mx-2 h-4 w-px bg-border" />
          <span className="text-[10px] text-neutral-mid tracking-[0.08em] uppercase">
            Candles
          </span>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "h-6 px-2.5 rounded text-[10px] font-mono tracking-[0.04em] transition-colors",
                range === r
                  ? "bg-bg-elevated text-neutral-strong border border-border-strong"
                  : "text-neutral-data hover:text-neutral-strong",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 relative bg-bg-base bg-grid">
        <PriceChart candles={CANDLES} lastPrice={m.last} />
      </div>

      {/* Cross-platform comparison */}
      <div className="border-t border-border bg-bg-surface/50">
        <div className="h-7 px-4 flex items-center justify-between border-b border-border">
          <span className="text-[10px] tracking-[0.12em] uppercase text-neutral-data font-semibold">
            This market on other platforms
          </span>
          <span className="font-mono num text-[10px]">
            <span className="text-neutral-data mr-1">Arb Edge</span>
            <span className="text-accent font-semibold">
              +{spread.toFixed(1)}¢
            </span>
          </span>
        </div>
        <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto">
          {CROSS_PLATFORM_PRICES.map((p) => {
            const isBest = p.priceCents === best;
            const isWorst = p.priceCents === worst;
            return (
              <div
                key={p.platform}
                className={cn(
                  "shrink-0 h-10 pl-2 pr-3 rounded border flex items-center gap-2 transition-colors",
                  isBest
                    ? "border-accent/50 bg-accent/10"
                    : isWorst
                    ? "border-danger/40 bg-danger/5"
                    : "border-border bg-bg-base",
                )}
              >
                <LogoChip mono={p.mono} tint={p.tint} size="sm" />
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] text-neutral-data">{p.platform}</span>
                  <span
                    className={cn(
                      "font-mono num text-[12px] font-semibold",
                      isBest
                        ? "text-accent"
                        : isWorst
                        ? "text-danger"
                        : "text-neutral-strong",
                    )}
                  >
                    {p.priceCents.toFixed(1)}¢
                  </span>
                </div>
                {isBest && (
                  <span className="ml-1 font-mono text-[9px] tracking-[0.1em] uppercase text-accent">
                    Best
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Kv({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: "accent" | "danger";
}) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-neutral-mid">{k}</span>
      <span
        className={cn(
          accent === "accent" && "text-accent",
          accent === "danger" && "text-danger",
          !accent && "text-neutral-strong",
        )}
      >
        {v}
      </span>
    </span>
  );
}
