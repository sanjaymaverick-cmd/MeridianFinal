/** V1 five-factor composite — ports meridian_v3/scoring/composite.py */

export const FACTORS = ["quality", "valuation", "technical", "ownership", "sentiment"] as const;
export type Factor = (typeof FACTORS)[number];
export type Regime = "Calm" | "Elevated" | "Stress";

export const DEFAULT_WEIGHTS: Record<Regime, Record<Factor, number>> = {
  Calm: { quality: 0.28, valuation: 0.22, technical: 0.18, ownership: 0.18, sentiment: 0.14 },
  Elevated: { quality: 0.26, valuation: 0.16, technical: 0.22, ownership: 0.22, sentiment: 0.14 },
  Stress: { quality: 0.24, valuation: 0.1, technical: 0.26, ownership: 0.26, sentiment: 0.14 },
};

export const DEFAULT_GATES: Record<Regime, Record<string, number>> = {
  Calm: { strong_buy: 8.0, buy: 6.8, hold: 5.0, reduce: 3.8 },
  Elevated: { strong_buy: 8.3, buy: 7.1, hold: 5.2, reduce: 4.0 },
  Stress: { strong_buy: 8.6, buy: 7.4, hold: 5.5, reduce: 4.2 },
};

export type ActionLabel = "Strong Buy" | "Buy" | "Hold" | "Reduce" | "Sell";

export function compositeScore(
  parts: Partial<Record<Factor, number | null>>,
  regime: Regime = "Calm",
): number | null {
  const weights = DEFAULT_WEIGHTS[regime];
  let total = 0;
  let mass = 0;
  for (const f of FACTORS) {
    const v = parts[f];
    if (v == null || Number.isNaN(v)) continue;
    total += v * weights[f];
    mass += weights[f];
  }
  if (mass === 0) return null;
  return Math.round((total / mass) * 100) / 100;
}

export function mapAction(score: number | null, regime: Regime = "Calm"): ActionLabel | "—" {
  if (score == null) return "—";
  const g = DEFAULT_GATES[regime];
  if (score >= g.strong_buy) return "Strong Buy";
  if (score >= g.buy) return "Buy";
  if (score >= g.hold) return "Hold";
  if (score >= g.reduce) return "Reduce";
  return "Sell";
}

export function technicalFromTape(args: {
  last: number;
  sma20: number;
  sma50: number;
  rsi: number;
  high20: number;
  low20: number;
}): { technical: number; valuation: number } {
  let tilt = 5;
  tilt += args.sma20 > args.sma50 ? 2 : -2;
  tilt += args.last > args.sma20 ? 1 : -1;
  if (args.rsi < 30) tilt += 1;
  else if (args.rsi > 70) tilt -= 1;
  const technical = Math.min(10, Math.max(0, tilt));
  const span = args.high20 - args.low20;
  const position = span > 0 ? (args.last - args.low20) / span : 0.5;
  const valuation = Math.min(10, Math.max(0, 10 - position * 10));
  return { technical, valuation };
}
