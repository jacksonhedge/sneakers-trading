type LogoChipProps = {
  mono: string;
  tint: string;
  size?: "sm" | "md";
};

/**
 * Placeholder platform logo — two-letter monogram chip with the brand tint.
 * Sits in for real SVG/PNG logos until asset pipeline is wired.
 */
export function LogoChip({ mono, tint, size = "md" }: LogoChipProps) {
  const dims =
    size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-[11px]";
  return (
    <span
      className={`${dims} shrink-0 inline-flex items-center justify-center rounded-[6px] font-mono font-semibold tracking-tight`}
      style={{
        background: `linear-gradient(180deg, ${tint}22 0%, ${tint}11 100%)`,
        border: `1px solid ${tint}40`,
        color: tint,
        textShadow: `0 0 12px ${tint}40`,
      }}
      aria-hidden
    >
      {mono}
    </span>
  );
}
