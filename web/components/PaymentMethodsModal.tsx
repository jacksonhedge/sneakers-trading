"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  PAYMENT_CATEGORIES,
  PAYMENT_METHODS,
  formatFee,
  formatLimit,
  type PaymentCategory,
  type PaymentMethod,
} from "@/lib/paymentMethods";
import { CONNECTED_PAYMENT_METHOD_IDS } from "@/lib/mockData";
import { LogoChip } from "./LogoChip";
import { Badge } from "./Badge";

type Direction = "deposit" | "withdraw";

type Props = {
  open: boolean;
  direction: Direction;
  onClose: () => void;
};

export function PaymentMethodsModal({ open, direction, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<PaymentCategory | "All">("All");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return PAYMENT_METHODS.filter((m) => {
      if (!m.supports[direction]) return false;
      if (activeCat !== "All" && m.category !== activeCat) return false;
      if (q && !m.name.toLowerCase().includes(q) && !m.category.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [q, activeCat, direction]);

  const byCat = useMemo(() => {
    const groups = new Map<PaymentCategory, PaymentMethod[]>();
    for (const cat of PAYMENT_CATEGORIES) groups.set(cat, []);
    for (const m of filtered) groups.get(m.category)!.push(m);
    return groups;
  }, [filtered]);

  if (!open) return null;

  const verb = direction === "deposit" ? "Deposit" : "Withdraw";
  const connectedCount = PAYMENT_METHODS.filter(
    (m) => m.supports[direction] && CONNECTED_PAYMENT_METHOD_IDS.has(m.id),
  ).length;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-fade-in grid place-items-center p-6">
      <div
        role="dialog"
        aria-modal
        className="w-[720px] max-w-full max-h-[85vh] bg-bg-surface border border-border-strong rounded-lg shadow-menu flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 px-4 flex items-center gap-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold tracking-[0.1em] text-[13px] text-neutral-strong uppercase">
              {verb}
            </span>
            <span className="font-mono text-[10px] tracking-[0.1em] text-neutral-data">
              {connectedCount} connected · {filtered.length} available
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-7 w-7 grid place-items-center rounded text-neutral-data hover:text-neutral-strong hover:bg-bg-elevated transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search + category tabs */}
        <div className="border-b border-border">
          <div className="h-10 px-3 flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-neutral-data">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${verb.toLowerCase()} methods…`}
              className="flex-1 bg-transparent outline-none text-[12px] text-neutral-strong placeholder:text-neutral-mid"
            />
          </div>
          <div className="flex items-center gap-1 px-3 pb-2 overflow-x-auto">
            <CatPill active={activeCat === "All"} onClick={() => setActiveCat("All")}>
              All
            </CatPill>
            {PAYMENT_CATEGORIES.map((cat) => (
              <CatPill
                key={cat}
                active={activeCat === cat}
                onClick={() => setActiveCat(cat)}
              >
                {cat}
              </CatPill>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-neutral-mid">
              No payment methods match that filter.
            </div>
          ) : (
            PAYMENT_CATEGORIES.map((cat) => {
              const rows = byCat.get(cat) ?? [];
              if (rows.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="h-6 px-4 flex items-center justify-between bg-bg-elevated/40 border-y border-border">
                    <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-neutral-mid font-semibold">
                      {cat}
                    </span>
                    <span className="font-mono text-[9px] text-neutral-mid num">{rows.length}</span>
                  </div>
                  {rows.map((m) => (
                    <MethodRow key={m.id} method={m} direction={direction} />
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="h-10 px-4 flex items-center justify-between border-t border-border bg-bg-base/40 text-[11px]">
          <span className="text-neutral-data">
            Fees shown are Sneakers processing only. Platform-side fees may vary.
          </span>
          <button className="text-neutral-strong hover:text-accent transition-colors font-medium flex items-center gap-1">
            Manage payment methods
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CatPill({
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
        "h-6 px-2.5 rounded text-[10px] font-mono tracking-[0.04em] transition-colors shrink-0",
        active
          ? "bg-bg-elevated text-neutral-strong border border-border-strong"
          : "text-neutral-data hover:text-neutral-strong border border-transparent",
      )}
    >
      {children}
    </button>
  );
}

function MethodRow({ method, direction }: { method: PaymentMethod; direction: Direction }) {
  const connected = CONNECTED_PAYMENT_METHOD_IDS.has(method.id);
  const verb = direction === "deposit" ? "Deposit" : "Withdraw";
  return (
    <div className="h-12 px-4 flex items-center gap-3 hover:bg-bg-elevated transition-colors border-b border-border/50">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0",
          connected ? "bg-accent shadow-[0_0_6px_rgba(0,255,136,0.6)]" : "bg-neutral-mid",
        )}
      />
      <LogoChip mono={method.mono} tint={method.tint} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-neutral-strong truncate">{method.name}</span>
          {method.status === "Beta" && <Badge tone="beta">Beta</Badge>}
          {method.status === "Coming soon" && <Badge tone="soon">Soon</Badge>}
        </div>
        <div className="font-mono num text-[10px] text-neutral-data truncate">
          {method.speed} · {formatFee(method.feeBps)}
          {method.min != null && method.max != null && (
            <> · {formatLimit(method.min)}–{formatLimit(method.max)}</>
          )}
        </div>
      </div>

      <button
        disabled={method.status === "Coming soon"}
        className={cn(
          "h-7 px-3 rounded text-[11px] font-mono font-semibold tracking-[0.04em] transition-colors shrink-0",
          method.status === "Coming soon"
            ? "text-neutral-mid border border-border cursor-not-allowed"
            : connected
            ? "bg-accent/15 text-accent border border-accent/40 hover:bg-accent/25"
            : "bg-bg-base text-neutral-strong border border-border-strong hover:border-accent/40 hover:text-accent",
        )}
      >
        {method.status === "Coming soon"
          ? "Soon"
          : connected
          ? verb.toUpperCase()
          : "LINK"}
      </button>
    </div>
  );
}
