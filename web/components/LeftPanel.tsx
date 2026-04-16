"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  BANKROLL,
  CONNECTED_BOOKS,
  formatUsd,
  WATCHLIST,
  type WatchItem,
} from "@/lib/mockData";
import { LogoChip } from "./LogoChip";

export function LeftPanel() {
  const [selected, setSelected] = useState<string>("w1");
  const [sort, setSort] = useState<"edge" | "price" | "alpha">("edge");

  return (
    <aside className="w-[260px] shrink-0 flex flex-col bg-bg-surface border-r border-border overflow-hidden">
      {/* Bankroll */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="text-[10px] tracking-[0.12em] uppercase text-neutral-data font-semibold mb-1">
          Bankroll
        </div>
        <div className="font-mono num text-[22px] font-bold text-neutral-strong leading-none">
          {formatUsd(BANKROLL.total)}
        </div>
        <div className="mt-1 flex items-baseline gap-1.5 font-mono num text-[11px]">
          <span className="text-accent flex items-center gap-0.5">
            <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor">
              <path d="M4 1l3 5H1z" />
            </svg>
            {formatUsd(BANKROLL.todayPnl, { sign: true })}
          </span>
          <span className="text-accent">({BANKROLL.todayPct.toFixed(2)}%)</span>
          <span className="text-neutral-data">Today</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="h-7 text-[11px] font-medium rounded border border-border-strong bg-bg-base/50 hover:bg-bg-elevated hover:border-accent/40 text-neutral-strong transition-colors">
            Deposit
          </button>
          <button className="h-7 text-[11px] font-medium rounded border border-border-strong bg-bg-base/50 hover:bg-bg-elevated text-neutral-strong transition-colors">
            Withdraw
          </button>
        </div>
      </div>

      {/* Connected books */}
      <div className="border-b border-border">
        <SectionHeader label="Connected Platforms" />
        <ul>
          {CONNECTED_BOOKS.map((b) => (
            <li
              key={b.platformId}
              className="h-9 px-4 flex items-center gap-2 hover:bg-bg-elevated transition-colors cursor-pointer"
            >
              <LogoChip mono={b.mono} tint={b.tint} size="sm" />
              <span className="flex-1 truncate text-[12px] text-neutral-strong">
                {b.name}
              </span>
              <span className="font-mono num text-[11px] text-neutral-strong">
                {formatUsd(b.balance)}
              </span>
            </li>
          ))}
          <li>
            <button className="w-full h-9 px-4 flex items-center gap-2 text-[11px] text-neutral-data hover:text-neutral-strong hover:bg-bg-elevated transition-colors">
              <span className="h-6 w-6 grid place-items-center rounded border border-dashed border-border-strong text-neutral-mid">
                +
              </span>
              <span>Connect platform</span>
            </button>
          </li>
        </ul>
      </div>

      {/* Watchlist / Tracking */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="h-7 px-4 flex items-center justify-between border-b border-border">
          <span className="text-[10px] tracking-[0.12em] uppercase text-neutral-data font-semibold">
            Tracking
          </span>
          <button
            onClick={() =>
              setSort((s) => (s === "edge" ? "price" : s === "price" ? "alpha" : "edge"))
            }
            className="font-mono text-[10px] text-neutral-data hover:text-neutral-strong flex items-center gap-1"
          >
            {sort.toUpperCase()}
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 3L4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="h-7 px-4 grid grid-cols-[1fr_52px_44px] items-center text-[9px] tracking-[0.1em] uppercase text-neutral-mid border-b border-border">
          <span>Market</span>
          <span className="text-right">Edge</span>
          <span className="text-right">Last</span>
        </div>

        <ul className="flex-1 overflow-y-auto">
          {WATCHLIST.map((w) => (
            <WatchRow
              key={w.id}
              item={w}
              selected={selected === w.id}
              onSelect={() => setSelected(w.id)}
            />
          ))}
          <li>
            <button className="w-full h-9 px-4 flex items-center gap-2 text-[11px] text-neutral-data hover:text-neutral-strong hover:bg-bg-elevated transition-colors">
              <span className="h-5 w-5 grid place-items-center rounded border border-dashed border-border-strong text-neutral-mid">
                +
              </span>
              <span>Add market</span>
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="h-7 px-4 flex items-center border-b border-border">
      <span className="text-[10px] tracking-[0.12em] uppercase text-neutral-data font-semibold">
        {label}
      </span>
    </div>
  );
}

function WatchRow({
  item,
  selected,
  onSelect,
}: {
  item: WatchItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const positive = item.edgeCents >= 0;
  return (
    <li>
      <button
        onClick={onSelect}
        className={cn(
          "w-full h-9 px-4 grid grid-cols-[1fr_52px_44px] items-center gap-2 text-left transition-colors",
          selected
            ? "bg-bg-elevated border-l-2 border-l-accent pl-[14px]"
            : "hover:bg-bg-elevated border-l-2 border-l-transparent",
        )}
      >
        <div className="min-w-0">
          <div className="truncate text-[12px] text-neutral-strong leading-tight">
            {item.name}
          </div>
          <div className="truncate text-[10px] text-neutral-data leading-tight">
            {item.platform}
          </div>
        </div>
        <span
          className={cn(
            "text-right font-mono num text-[11px] flex items-center justify-end gap-0.5",
            positive ? "text-accent" : "text-danger",
          )}
        >
          <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor" className={cn(!positive && "rotate-180")}>
            <path d="M4 1l3 5H1z" />
          </svg>
          {Math.abs(item.edgeCents).toFixed(1)}¢
        </span>
        <span className="text-right font-mono num text-[11px] text-neutral-strong">
          {item.lastCents}¢
        </span>
      </button>
    </li>
  );
}
