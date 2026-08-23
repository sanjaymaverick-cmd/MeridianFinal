function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

/** Quarter-Kelly on even-money edge, scaled by stop vs a 2% reference. */
export const KELLY_FRACTION = 0.25;
export const KELLY_P0 = 0.5;
export const KELLY_REF_STOP = 0.02;
export const PROMOTE_MIN_N = 2_000;
export const PROMOTE_MIN_AUC = 0.55;
export const PROMOTE_MIN_HIT = 0.52;
export const FIT_MIN_N = 80;

export function kellySizePct(p: number, stopPct: number, maxSize: number): number {
  if (!(p > KELLY_P0) || !(stopPct > 0) || !(maxSize > 0)) return 0;
  const full = 2 * p - 1;
  if (full <= 0) return 0;
  const raw = KELLY_FRACTION * full * (KELLY_REF_STOP / Math.max(stopPct, 1e-4));
  return clamp(raw, 0, maxSize);
}

export function shouldPromote(n: number, auc: number, source: "synth" | "paper", hitRate = 1): boolean {
  if (source !== "paper") return false;
  if (n < PROMOTE_MIN_N) return false;
  if (auc < PROMOTE_MIN_AUC) return false;
  if (hitRate <= PROMOTE_MIN_HIT) return false;
  return true;
}
