import { daysToExpiry } from "./fo-contracts";

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

export const FEATURE_KEYS = [
  "confidence",
  "confluence",
  "p_success",
  "atr_pct",
  "approx_stop_pct",
  "minutes_since_midnight",
  "minutes_to_eod_flatten",
  "ret_short",
  "range_pct",
  "dist_vwap",
  "vol_z",
  "india_vix",
  "pcr",
  "hours_to_expiry",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureVec = Record<FeatureKey, number>;

export function emptyFeatures(): FeatureVec {
  const f = {} as FeatureVec;
  for (const k of FEATURE_KEYS) f[k] = 0;
  return f;
}

export function packFeatures(f: Partial<FeatureVec>, keys: readonly string[] = FEATURE_KEYS): number[] {
  return keys.map((k) => {
    const v = Number((f as Record<string, unknown>)[k]);
    return Number.isFinite(v) ? v : 0;
  });
}

export function confluenceFromParts(parts: Record<string, number>): number {
  const vals = Object.values(parts).filter((v) => Number.isFinite(v));
  if (!vals.length) return 60;
  const above = vals.filter((v) => v >= 6).length;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return clamp(50 + above * 8 + (mean - 5) * 4, 40, 96);
}

export function pSuccessFromScore(score: number, retShort: number): number {
  let p = 0.5 + (score - 6) * 0.04;
  p += clamp(retShort * 8, -0.04, 0.04);
  return clamp(p, 0.42, 0.74);
}

export function hoursToExpiry(expiryIso?: string | null, now = Date.now()): number {
  if (!expiryIso) return 0;
  return daysToExpiry(expiryIso, now) * 24;
}

export type TapeStat = {
  last: number;
  prev: number;
  sum: number;
  n: number;
  high: number;
  low: number;
  vol: number;
  volEma: number;
};

export function freshTape(px: number, vol = 0): TapeStat {
  return { last: px, prev: px, sum: px, n: 1, high: px, low: px, vol, volEma: vol };
}

export function pushTape(t: TapeStat | undefined, px: number, vol = 0): TapeStat {
  if (!(px > 0)) return t ?? freshTape(0);
  if (!t || !(t.last > 0)) return freshTape(px, vol);
  const volEma = t.volEma > 0 ? t.volEma * 0.9 + vol * 0.1 : vol;
  return {
    last: px,
    prev: t.last,
    sum: t.sum + px,
    n: t.n + 1,
    high: Math.max(t.high, px),
    low: Math.min(t.low, px),
    vol,
    volEma,
  };
}

export function tapeFeatures(t: TapeStat | undefined): Pick<FeatureVec, "ret_short" | "range_pct" | "dist_vwap" | "vol_z"> {
  if (!t || !(t.last > 0)) return { ret_short: 0, range_pct: 0, dist_vwap: 0, vol_z: 0 };
  const vwap = t.sum / Math.max(t.n, 1);
  const ret = t.prev > 0 ? t.last / t.prev - 1 : 0;
  const range = (t.high - t.low) / t.last;
  const dist = (t.last - vwap) / t.last;
  const volZ = t.volEma > 0 && t.vol > 0 ? t.vol / t.volEma - 1 : 0;
  return {
    ret_short: clamp(ret, -0.08, 0.08),
    range_pct: clamp(range, 0, 0.2),
    dist_vwap: clamp(dist, -0.08, 0.08),
    vol_z: clamp(volZ, -3, 3),
  };
}
