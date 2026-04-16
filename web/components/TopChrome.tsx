"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { PlatformsMenu } from "./PlatformsMenu";

const TABS = [
  { id: "sports", label: "Sports Betting" },
  { id: "predictions", label: "Prediction Markets" },
  { id: "arbitrage", label: "Arbitrage" },
  { id: "fantasy", label: "Fantasy" },
] as const;

export function TopChrome() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("predictions");
  const [overnight, setOvernight] = useState(false);

  return (
    <header className="h-12 shrink-0 flex items-stretch border-b border-border bg-bg-base/90 backdrop-blur-sm relative z-40">
      {/* Left — logo + tabs */}
      <div className="flex items-stretch pl-4 pr-2 gap-2">
        <div className="flex items-center gap-2 pr-3 border-r border-border">
          <span className="relative h-7 w-7 rounded-[6px] overflow-hidden border border-border-strong shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] bg-[#2a2a3a]">
            <Image
              src="/logo.png"
              alt="Sneakers"
              width={28}
              height={28}
              priority
              className="object-cover"
            />
          </span>
          <span className="font-mono font-bold tracking-[0.14em] text-[12px] text-neutral-strong">
            SNEAKERS
          </span>
        </div>
        <nav className="flex items-stretch">
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "relative px-3 text-[12px] font-medium transition-colors",
                  active
                    ? "text-neutral-strong"
                    : "text-neutral-data hover:text-neutral-strong",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "absolute left-3 right-3 bottom-0 h-[2px] rounded-t-sm transition-colors",
                    active ? "bg-neutral-strong" : "bg-transparent",
                  )}
                />
              </button>
            );
          })}
          <button
            className="ml-1 self-center h-6 w-6 grid place-items-center rounded text-neutral-data hover:text-neutral-strong hover:bg-bg-surface transition-colors"
            aria-label="Add tab"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </nav>
      </div>

      {/* Center — platforms dropdown + market info ticker */}
      <div className="flex-1 min-w-0 flex items-center gap-3 px-3 border-l border-border">
        <PlatformsMenu />
        <MarketInfoBar />
      </div>

      {/* Right — engine status, overnight, avatar, settings */}
      <div className="flex items-center gap-3 pl-3 pr-4 border-l border-border">
        <div className="flex items-center gap-1.5 pr-3 border-r border-border">
          <span className="relative h-1.5 w-1.5 rounded-full bg-accent animate-pulse-live live-dot" />
          <span className="font-mono text-[10px] tracking-[0.12em] text-accent font-semibold">
            LIVE
          </span>
          <span className="font-mono text-[10px] text-neutral-data pl-1.5 num">84ms</span>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-neutral-data select-none cursor-pointer">
          <span>Overnight</span>
          <button
            role="switch"
            aria-checked={overnight}
            onClick={() => setOvernight((v) => !v)}
            className={cn(
              "relative h-[18px] w-[30px] rounded-full border transition-colors",
              overnight
                ? "bg-accent/20 border-accent/50"
                : "bg-bg-surface border-border-strong",
            )}
          >
            <span
              className={cn(
                "absolute top-[2px] h-[12px] w-[12px] rounded-full transition-all",
                overnight
                  ? "left-[15px] bg-accent shadow-[0_0_6px_rgba(0,255,136,0.6)]"
                  : "left-[2px] bg-neutral-mid",
              )}
            />
          </button>
        </label>

        <div className="h-7 w-7 rounded-full grid place-items-center text-[10px] font-semibold text-neutral-strong bg-gradient-to-br from-[#2A2A3A] to-[#191923] border border-border-strong">
          JF
        </div>

        <button
          aria-label="Settings"
          className="h-7 w-7 grid place-items-center rounded text-neutral-data hover:text-neutral-strong hover:bg-bg-surface transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M13.3 9.4a5.6 5.6 0 0 0 0-2.8l1.5-1.2-1.4-2.4-1.8.6a5.6 5.6 0 0 0-2.4-1.4L8.8.4H6.2L5.8 2.2a5.6 5.6 0 0 0-2.4 1.4l-1.8-.6L.2 5.4l1.5 1.2a5.6 5.6 0 0 0 0 2.8L.2 10.6 1.6 13l1.8-.6a5.6 5.6 0 0 0 2.4 1.4l.4 1.8h2.6l.4-1.8a5.6 5.6 0 0 0 2.4-1.4l1.8.6 1.4-2.4-1.5-1.2Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}

function MarketInfoBar() {
  return (
    <div className="flex items-center gap-3 text-[11px] font-mono num min-w-0 overflow-hidden">
      <span className="text-neutral-data">YES</span>
      <span className="text-neutral-strong font-semibold">62.4¢</span>
      <span className="text-accent flex items-center gap-0.5">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
          <path d="M4 1l3 5H1z" />
        </svg>
        +3.2¢ (5.4%)
      </span>
      <span className="text-neutral-mid">·</span>
      <span className="text-neutral-data">VOL</span>
      <span className="text-neutral-strong">$84,320</span>
      <span className="text-neutral-mid">·</span>
      <span className="text-neutral-data">LIQ</span>
      <span className="text-neutral-strong">$12,400</span>
    </div>
  );
}
