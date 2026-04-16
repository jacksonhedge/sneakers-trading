"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  FANTASY_CATEGORIES,
  FANTASY_PLATFORMS,
  PLATFORM_TOTAL,
  PREDICTION_MARKETS,
  SPORTSBOOKS,
  SPORTSBOOK_CATEGORIES,
  formatVolume,
  type FantasyCategory,
  type FantasyPlatform,
  type PredictionMarket,
  type Sportsbook,
  type SportsbookCategory,
} from "@/lib/platforms";
import { CONNECTED_PLATFORM_IDS } from "@/lib/mockData";
import { LogoChip } from "./LogoChip";
import { Badge } from "./Badge";

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "h-1.5 w-1.5 rounded-full shrink-0",
        connected ? "bg-accent shadow-[0_0_6px_rgba(0,255,136,0.6)]" : "bg-neutral-mid",
      )}
      aria-label={connected ? "Connected" : "Not connected"}
    />
  );
}

export function PlatformsMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  const sportsbooksByCat = useMemo(() => {
    const groups = new Map<SportsbookCategory, Sportsbook[]>();
    for (const cat of SPORTSBOOK_CATEGORIES) groups.set(cat, []);
    for (const p of SPORTSBOOKS) {
      if (match(p.name) || match(p.category)) groups.get(p.category)!.push(p);
    }
    return groups;
  }, [q]);

  const predictionMarkets = useMemo(
    () => PREDICTION_MARKETS.filter((p) => match(p.name) || match(p.badge)),
    [q],
  );

  const fantasyByCat = useMemo(() => {
    const groups = new Map<FantasyCategory, FantasyPlatform[]>();
    for (const cat of FANTASY_CATEGORIES) groups.set(cat, []);
    for (const p of FANTASY_PLATFORMS) {
      if (match(p.name) || match(p.style)) groups.get(p.style)!.push(p);
    }
    return groups;
  }, [q]);

  const totalVisible =
    Array.from(sportsbooksByCat.values()).reduce((a, b) => a + b.length, 0) +
    predictionMarkets.length +
    Array.from(fantasyByCat.values()).reduce((a, b) => a + b.length, 0);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        data-open={open}
        className={cn(
          "h-8 px-3 flex items-center gap-2 rounded border text-[12px] transition-colors",
          open
            ? "bg-bg-surface border-border-strong text-neutral-strong"
            : "bg-bg-surface/60 border-border text-neutral-strong hover:bg-bg-surface hover:border-border-strong",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(0,255,136,0.6)]" />
        <span className="font-medium">All Platforms</span>
        <span className="font-mono text-[10px] text-neutral-data num">
          {CONNECTED_PLATFORM_IDS.size}/{PLATFORM_TOTAL}
        </span>
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          className={cn("text-neutral-data transition-transform", open && "rotate-180")}
        >
          <path d="M1.5 3L4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+6px)] w-[960px] max-w-[calc(100vw-32px)] bg-bg-surface border border-border-strong rounded-md shadow-menu animate-slide-down z-50"
        >
          {/* Search bar */}
          <div className="h-10 px-3 flex items-center gap-2 border-b border-border">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-neutral-data">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search platforms — name, category, badge…"
              className="flex-1 bg-transparent outline-none text-[12px] text-neutral-strong placeholder:text-neutral-mid"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-neutral-mid hover:text-neutral-strong text-[10px] font-mono"
              >
                ESC
              </button>
            )}
            <span className="font-mono text-[10px] text-neutral-data num tabular-nums">
              {totalVisible}/{PLATFORM_TOTAL}
            </span>
          </div>

          {/* Columns */}
          <div className="grid grid-cols-3 divide-x divide-border">
            <Column title="Sportsbooks" count={SPORTSBOOKS.length}>
              {SPORTSBOOK_CATEGORIES.map((cat) => {
                const rows = sportsbooksByCat.get(cat) ?? [];
                if (rows.length === 0) return null;
                return (
                  <SubHeader key={cat} label={cat} count={rows.length}>
                    {rows.map((p) => (
                      <SportsbookRow key={p.id} p={p} />
                    ))}
                  </SubHeader>
                );
              })}
              {totalVisible === 0 && <EmptyState />}
            </Column>

            <Column title="Prediction Markets" count={PREDICTION_MARKETS.length}>
              {predictionMarkets.length > 0 ? (
                predictionMarkets.map((p) => <PredictionRow key={p.id} p={p} />)
              ) : q ? (
                <EmptyState />
              ) : null}
            </Column>

            <Column title="Fantasy & DFS" count={FANTASY_PLATFORMS.length}>
              {FANTASY_CATEGORIES.map((cat) => {
                const rows = fantasyByCat.get(cat) ?? [];
                if (rows.length === 0) return null;
                return (
                  <SubHeader key={cat} label={cat} count={rows.length}>
                    {rows.map((p) => (
                      <FantasyRow key={p.id} p={p} />
                    ))}
                  </SubHeader>
                );
              })}
            </Column>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 h-9 border-t border-border text-[11px]">
            <div className="flex items-center gap-4 text-neutral-data">
              <span className="flex items-center gap-1.5">
                <StatusDot connected /> <span>Connected</span>
              </span>
              <span className="flex items-center gap-1.5">
                <StatusDot connected={false} /> <span>Not connected</span>
              </span>
            </div>
            <button className="text-neutral-strong hover:text-accent transition-colors font-medium flex items-center gap-1">
              Manage connected platforms
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Column({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="h-8 px-4 flex items-center justify-between border-b border-border bg-bg-base/40">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-neutral-data font-semibold">
          {title}
        </span>
        <span className="font-mono text-[10px] text-neutral-mid num">{count}</span>
      </div>
      <div className="py-1 max-h-[460px] overflow-y-auto">{children}</div>
    </div>
  );
}

function SubHeader({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="h-6 px-4 flex items-center justify-between bg-bg-elevated/60">
        <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-neutral-mid font-semibold">
          {label}
        </span>
        <span className="font-mono text-[9px] text-neutral-mid num">{count}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-6 text-center text-[11px] text-neutral-mid">
      No matches
    </div>
  );
}

function SportsbookRow({ p }: { p: Sportsbook }) {
  const connected = CONNECTED_PLATFORM_IDS.has(p.id);
  return (
    <MenuRow connected={connected} mono={p.mono} tint={p.tint} name={p.name}>
      {p.tag === "sharp" && <Badge tone="sharp">Sharp</Badge>}
      {p.tag === "micro" && <Badge tone="micro">Micro</Badge>}
      {p.tag === "sweeps" && <Badge tone="sweeps">Sweeps</Badge>}
      {p.category === "Exchange" && <Badge tone="exchange">Exch</Badge>}
      <Badge tone={p.region === "US" ? "us" : "global"}>{p.region}</Badge>
    </MenuRow>
  );
}

function PredictionRow({ p }: { p: PredictionMarket }) {
  const connected = CONNECTED_PLATFORM_IDS.has(p.id);
  const tone =
    p.badge === "CFTC"
      ? "cftc"
      : p.badge === "Blockchain"
      ? "blockchain"
      : p.badge === "Exchange"
      ? "exchange"
      : p.badge === "Unregulated"
      ? "unregulated"
      : "regulated";
  return (
    <MenuRow connected={connected} mono={p.mono} tint={p.tint} name={p.name}>
      <span className="font-mono text-[10px] text-neutral-data num mr-1">
        {formatVolume(p.volume24h)}
      </span>
      <Badge
        tone={
          tone as
            | "cftc"
            | "blockchain"
            | "exchange"
            | "regulated"
            | "unregulated"
        }
      >
        {p.badge === "CFTC" ? "CFTC ✓" : p.badge}
      </Badge>
    </MenuRow>
  );
}

function FantasyRow({ p }: { p: FantasyPlatform }) {
  const connected = CONNECTED_PLATFORM_IDS.has(p.id);
  return (
    <MenuRow connected={connected} mono={p.mono} tint={p.tint} name={p.name}>
      {p.style === "Sweepstakes" ? (
        <Badge tone="sweeps">Sweeps</Badge>
      ) : (
        <Badge tone="neutral">{p.style}</Badge>
      )}
    </MenuRow>
  );
}

function MenuRow({
  connected,
  mono,
  tint,
  name,
  children,
}: {
  connected: boolean;
  mono: string;
  tint: string;
  name: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      className="w-full h-9 px-4 flex items-center gap-3 hover:bg-bg-elevated transition-colors text-left group"
    >
      <StatusDot connected={connected} />
      <LogoChip mono={mono} tint={tint} size="sm" />
      <span className="flex-1 min-w-0 truncate text-[12px] text-neutral-strong group-hover:text-white">
        {name}
      </span>
      <span className="flex items-center gap-1.5 shrink-0">{children}</span>
    </button>
  );
}
