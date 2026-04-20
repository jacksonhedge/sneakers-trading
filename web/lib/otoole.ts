/* -------------------------------------------------------------------------- */
/*  O'Toole settings — AI assistant mode + automated-trading guardrails       */
/* -------------------------------------------------------------------------- */

export type OTooleMode = "off" | "insights" | "execution";
export type OTooleStrategy = "arbitrage" | "smart-ev" | "both";

export interface OTooleSettings {
  mode: OTooleMode;
  strategy: OTooleStrategy;

  /** Total capital O'Toole may deploy, in USD. */
  budget: number;

  /** Hard stop — close positions + disable when realized losses hit this, in USD. */
  maxLoss: number;

  /** Max per-trade size, in USD. */
  maxPositionSize: number;

  /** Minimum edge (expected value as % of stake) required to act, 0-1. */
  minEdgePct: number;

  /** Platforms O'Toole is authorized to place trades on. */
  platforms: string[];

  /** If true: log what O'Toole WOULD do, never actually place orders. */
  simulationMode: boolean;

  /** Only act on markets closing within this many hours (0 = no cap). */
  maxHoursToClose: number;

  /** Last user-acknowledged update — used to pop a "settings drifted" alert. */
  updatedAt: number;
}

export const DEFAULT_OTOOLE_SETTINGS: OTooleSettings = {
  mode: "off",
  strategy: "smart-ev",
  budget: 1000,
  maxLoss: 200,
  maxPositionSize: 100,
  minEdgePct: 0.04,
  platforms: ["kalshi", "polymarket"],
  simulationMode: true,
  maxHoursToClose: 0,
  updatedAt: 0,
};

const STORAGE_KEY = "otoole:settings:v1";

export function loadOTooleSettings(): OTooleSettings {
  if (typeof window === "undefined") return DEFAULT_OTOOLE_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OTOOLE_SETTINGS;
    return { ...DEFAULT_OTOOLE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_OTOOLE_SETTINGS;
  }
}

export function saveOTooleSettings(s: OTooleSettings) {
  if (typeof window === "undefined") return;
  const withTs = { ...s, updatedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(withTs));
}

export function describeMode(m: OTooleMode): string {
  switch (m) {
    case "off":       return "Off";
    case "insights":  return "Insights";
    case "execution": return "Execution";
  }
}
