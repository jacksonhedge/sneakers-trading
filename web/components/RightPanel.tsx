"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  ORDER_BOOK,
  OPEN_POSITIONS,
  RECENT_TRADES,
  formatUsd,
} from "@/lib/mockData";

type Tab = "book" | "trades" | "positions";

export function RightPanel() {
  const [tab, setTab] = useState<Tab>("book");

  const maxBidSize = Math.max(...ORDER_BOOK.bids.map((l) => l.size));
  const maxAskSize = Math.max(...ORDER_BOOK.asks.map((l) => l.size));
  const maxSize = Math.max(maxBidSize, maxAskSize);

  return (
    <aside className="w-[280px] shrink-0 flex flex-col bg-bg-surface border-l border-border overflow-hidden">
      {/* Tabs */}
      <div className="h-8 shrink-0 flex border-b border-border">
        <TabBtn active={tab === "book"} onClick={() => setTab("book")}>
          Order Book
        </TabBtn>
        <TabBtn active={tab === "trades"} onClick={() => setTab("trades")}>
          Trades
        </TabBtn>
        <TabBtn active={tab === "positions"} onClick={() => setTab("positions")}>
          Positions
        </TabBtn>
      </div>

      {tab === "book" && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="h-6 px-3 grid grid-cols-3 items-center text-[9px] tracking-[0.1em] uppercase text-neutral-mid border-b border-border font-mono">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Depth</span>
          </div>

          {/* Asks top → bottom (reverse so best ask is at the bottom of asks stack) */}
          <div className="flex-1 overflow-y-auto flex flex-col-reverse">
            {ORDER_BOOK.asks.map((lvl) => (
              <BookRow
                key={`a-${lvl.priceCents}`}
                price={lvl.priceCents}
                size={lvl.size}
                max={maxSize}
                side="ask"
              />
            ))}
          </div>

          {/* Mid / spread */}
          <div className="h-7 px-3 flex items-center justify-between border-y border-border bg-bg-base">
            <span className="font-mono num text-[11px] text-neutral-strong font-semibold">
              62.40¢
            </span>
            <span className="font-mono num text-[10px] text-neutral-data">
              spread 0.2¢
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {ORDER_BOOK.bids.map((lvl) => (
              <BookRow
                key={`b-${lvl.priceCents}`}
                price={lvl.priceCents}
                size={lvl.size}
                max={maxSize}
                side="bid"
              />
            ))}
          </div>
        </div>
      )}

      {tab === "trades" && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="h-6 px-3 grid grid-cols-[1fr_64px_60px] items-center text-[9px] tracking-[0.1em] uppercase text-neutral-mid border-b border-border font-mono">
            <span>Time</span>
            <span className="text-right">Price</span>
            <span className="text-right">Size</span>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {RECENT_TRADES.map((t) => (
              <li
                key={t.id}
                className="h-6 px-3 grid grid-cols-[1fr_64px_60px] items-center font-mono num text-[11px] hairline-b"
              >
                <span className="text-neutral-data">{t.ts}</span>
                <span
                  className={cn(
                    "text-right font-semibold",
                    t.side === "BUY" ? "text-accent" : "text-danger",
                  )}
                >
                  {t.priceCents.toFixed(1)}¢
                </span>
                <span className="text-right text-neutral-strong">
                  {t.size.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "positions" && (
        <div className="flex-1 min-h-0 flex flex-col">
          <ul className="flex-1 overflow-y-auto">
            {OPEN_POSITIONS.map((p) => {
              const pnlCents = (p.last - p.entry) * (p.side === "YES" ? 1 : -1);
              const pnlUsd = (pnlCents / 100) * p.size;
              const positive = pnlUsd >= 0;
              return (
                <li
                  key={p.id}
                  className="px-3 py-2 border-b border-border hover:bg-bg-elevated transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-neutral-strong truncate pr-2">
                      {p.market}
                    </span>
                    <span
                      className={cn(
                        "font-mono num text-[11px] font-semibold shrink-0",
                        p.side === "YES" ? "text-accent" : "text-danger",
                      )}
                    >
                      {p.side}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1 font-mono num text-[10px]">
                    <Kv k="SIZE" v={p.size.toLocaleString("en-US")} />
                    <Kv k="ENTRY" v={`${p.entry.toFixed(1)}¢`} />
                    <Kv k="LAST" v={`${p.last.toFixed(1)}¢`} />
                  </div>
                  <div
                    className={cn(
                      "mt-1 font-mono num text-[11px] font-semibold",
                      positive ? "text-accent" : "text-danger",
                    )}
                  >
                    {formatUsd(pnlUsd, { sign: true })}
                    <span className="ml-1 text-[10px] text-neutral-data">
                      ({((pnlCents / p.entry) * 100).toFixed(2)}%)
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="px-3 py-2 border-t border-border bg-bg-base">
            <button className="w-full h-8 rounded bg-accent/15 border border-accent/40 text-accent font-mono text-[11px] font-semibold tracking-[0.06em] hover:bg-accent/25 transition-colors">
              PLACE ORDER
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 text-[11px] font-medium tracking-[0.04em] transition-colors relative",
        active ? "text-neutral-strong" : "text-neutral-data hover:text-neutral-strong",
      )}
    >
      {children}
      <span
        className={cn(
          "absolute left-2 right-2 bottom-0 h-[2px] rounded-t-sm transition-colors",
          active ? "bg-neutral-strong" : "bg-transparent",
        )}
      />
    </button>
  );
}

function BookRow({
  price,
  size,
  max,
  side,
}: {
  price: number;
  size: number;
  max: number;
  side: "bid" | "ask";
}) {
  const pct = Math.min(100, (size / max) * 100);
  return (
    <div className="relative h-6 px-3 grid grid-cols-3 items-center font-mono num text-[11px] border-b border-border/50">
      <span
        className="absolute right-0 top-0 bottom-0 pointer-events-none"
        style={{
          width: `${pct}%`,
          background:
            side === "bid" ? "rgba(0,255,136,0.08)" : "rgba(255,59,92,0.08)",
        }}
      />
      <span
        className={cn(
          "relative font-semibold",
          side === "bid" ? "text-accent" : "text-danger",
        )}
      >
        {price.toFixed(1)}¢
      </span>
      <span className="relative text-right text-neutral-strong">
        {size.toLocaleString("en-US")}
      </span>
      <span className="relative text-right text-neutral-data">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-neutral-mid">{k}</span>
      <span className="text-neutral-strong">{v}</span>
    </div>
  );
}
