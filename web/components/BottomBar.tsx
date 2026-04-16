import { LIVE_STATS } from "@/lib/mockData";

export function BottomBar() {
  return (
    <footer className="h-6 shrink-0 flex items-center px-4 gap-4 border-t border-border bg-bg-surface text-[10px] font-mono tracking-[0.04em]">
      <span className="flex items-center gap-1.5 text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-live" />
        <span className="font-semibold num">{LIVE_STATS.markets}</span>
        <span className="text-neutral-data">live markets across</span>
        <span className="font-semibold num text-neutral-strong">
          {LIVE_STATS.platforms}
        </span>
        <span className="text-neutral-data">platforms</span>
      </span>
      <Sep />
      <span className="text-neutral-data">
        Arb opps:{" "}
        <span className="text-accent font-semibold num">
          {LIVE_STATS.arbOpps}
        </span>
      </span>
      <Sep />
      <span className="text-neutral-data">
        Engine:{" "}
        <span className="text-neutral-strong num">
          {LIVE_STATS.engineLatencyMs}ms
        </span>
      </span>
      <span className="ml-auto text-neutral-data">
        SNEAKERS v0.1 · build 2026.04.16
      </span>
    </footer>
  );
}

function Sep() {
  return <span className="h-3 w-px bg-border" />;
}
