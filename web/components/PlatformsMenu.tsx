"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  FANTASY_PLATFORMS,
  formatVolume,
  PREDICTION_MARKETS,
  SPORTSBOOKS,
  type PredictionMarket,
  type Sportsbook,
  type FantasyPlatform,
} from "@/lib/platforms";
import { CONNECTED_PLATFORM_IDS } from "@/lib/mockData";
import { LogoChip } from "./LogoChip";
import { Badge } from "./Badge";

type ConnDot = { connected: boolean };

function StatusDot({ connected }: ConnDot) {
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
  const rootRef = useRef<HTMLDivElement>(null);

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
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
          {CONNECTED_PLATFORM_IDS.size}/{SPORTSBOOKS.length + PREDICTION_MARKETS.length + FANTASY_PLATFORMS.length}
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
          className="absolute left-0 top-[calc(100%+6px)] w-[820px] max-w-[calc(100vw-32px)] bg-bg-surface border border-border-strong rounded-md shadow-menu animate-slide-down z-50"
        >
          <div className="grid grid-cols-3 divide-x divide-border">
            <Column title="Sportsbooks" count={SPORTSBOOKS.length}>
              {SPORTSBOOKS.map((p) => (
                <SportsbookRow key={p.id} p={p} />
              ))}
            </Column>
            <Column title="Prediction Markets" count={PREDICTION_MARKETS.length}>
              {PREDICTION_MARKETS.map((p) => (
                <PredictionRow key={p.id} p={p} />
              ))}
            </Column>
            <Column title="Fantasy" count={FANTASY_PLATFORMS.length}>
              {FANTASY_PLATFORMS.map((p) => (
                <FantasyRow key={p.id} p={p} />
              ))}
            </Column>
          </div>

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
      <div className="h-8 px-4 flex items-center justify-between border-b border-border">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-neutral-data font-semibold">
          {title}
        </span>
        <span className="font-mono text-[10px] text-neutral-mid num">{count}</span>
      </div>
      <div className="py-1 max-h-[420px] overflow-y-auto">{children}</div>
    </div>
  );
}

function SportsbookRow({ p }: { p: Sportsbook }) {
  const connected = CONNECTED_PLATFORM_IDS.has(p.id);
  return (
    <MenuRow connected={connected} mono={p.mono} tint={p.tint} name={p.name}>
      {p.tag === "sharp" && <Badge tone="sharp">Sharp</Badge>}
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
      : "regulated";
  return (
    <MenuRow connected={connected} mono={p.mono} tint={p.tint} name={p.name}>
      <span className="font-mono text-[10px] text-neutral-data num mr-1">
        {formatVolume(p.volume24h)}
      </span>
      <Badge tone={tone as "cftc" | "blockchain" | "exchange" | "regulated"}>
        {p.badge === "CFTC" ? "CFTC ✓" : p.badge}
      </Badge>
    </MenuRow>
  );
}

function FantasyRow({ p }: { p: FantasyPlatform }) {
  const connected = CONNECTED_PLATFORM_IDS.has(p.id);
  return (
    <MenuRow connected={connected} mono={p.mono} tint={p.tint} name={p.name}>
      <Badge tone="neutral">{p.style}</Badge>
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
