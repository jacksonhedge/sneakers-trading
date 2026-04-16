type Tone =
  | "us"
  | "global"
  | "cftc"
  | "blockchain"
  | "regulated"
  | "sportsbook"
  | "exchange"
  | "sharp"
  | "micro"
  | "sweeps"
  | "unregulated"
  | "beta"
  | "soon"
  | "neutral"
  | "accent"
  | "danger";

const STYLES: Record<Tone, { label?: string; bg: string; fg: string; border: string }> = {
  us:          { bg: "rgba(20,147,255,0.10)",  fg: "#6CB8FF", border: "rgba(20,147,255,0.35)" },
  global:      { bg: "rgba(142,142,154,0.10)", fg: "#B8B8C4", border: "rgba(142,142,154,0.30)" },
  cftc:        { bg: "rgba(0,255,136,0.08)",   fg: "#00FF88", border: "rgba(0,255,136,0.32)" },
  blockchain:  { bg: "rgba(124,92,255,0.10)",  fg: "#B8A4FF", border: "rgba(124,92,255,0.35)" },
  regulated:   { bg: "rgba(255,184,12,0.10)",  fg: "#FFCF5C", border: "rgba(255,184,12,0.35)" },
  sportsbook:  { bg: "rgba(83,211,55,0.08)",   fg: "#8CE670", border: "rgba(83,211,55,0.30)" },
  exchange:    { bg: "rgba(255,184,12,0.10)",  fg: "#FFD47A", border: "rgba(255,184,12,0.30)" },
  sharp:       { bg: "rgba(255,59,92,0.08)",   fg: "#FF7A8E", border: "rgba(255,59,92,0.32)" },
  micro:       { bg: "rgba(255,184,12,0.08)",  fg: "#FFD47A", border: "rgba(255,184,12,0.28)" },
  sweeps:      { bg: "rgba(142,92,255,0.10)",  fg: "#C4A4FF", border: "rgba(142,92,255,0.30)" },
  unregulated: { bg: "rgba(255,59,92,0.08)",   fg: "#FF7A8E", border: "rgba(255,59,92,0.28)" },
  beta:        { bg: "rgba(20,147,255,0.08)",  fg: "#6CB8FF", border: "rgba(20,147,255,0.28)" },
  soon:        { bg: "rgba(142,142,154,0.08)", fg: "#8E8E9A", border: "rgba(142,142,154,0.25)" },
  neutral:     { bg: "rgba(142,142,154,0.08)", fg: "#8E8E9A", border: "rgba(142,142,154,0.25)" },
  accent:      { bg: "rgba(0,255,136,0.08)",   fg: "#00FF88", border: "rgba(0,255,136,0.32)" },
  danger:      { bg: "rgba(255,59,92,0.08)",   fg: "#FF7A8E", border: "rgba(255,59,92,0.28)" },
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const s = STYLES[tone];
  return (
    <span
      className={`inline-flex items-center h-[18px] px-1.5 rounded-[4px] text-[9px] font-mono font-semibold tracking-[0.08em] uppercase ${className}`}
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}` }}
    >
      {children}
    </span>
  );
}
