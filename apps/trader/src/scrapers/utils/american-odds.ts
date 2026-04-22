export function americanToImpliedProb(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) return NaN;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

export function impliedProbToAmerican(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  return p >= 0.5 ? -Math.round((p / (1 - p)) * 100) : Math.round(((1 - p) / p) * 100);
}
