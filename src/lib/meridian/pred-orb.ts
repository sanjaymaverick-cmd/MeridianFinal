/**
 * Polymarket BTC 5-minute Up/Down — paper prediction sleeve.
 * Public Gamma/CLOB quotes only. Not a Polymarket order. Not in the farm fit set.
 */

export const PRED_SLEEVE = "pred" as const;
export const PRED_YES = "BTC5M_YES";
export const PRED_NO = "BTC5M_NO";
export const PRED_FEED = "polymarket";
export const PRED_COPY =
  "Paper prediction. Not a Polymarket order. Not in the farm fit set.";
export const PRED_WINDOW_SEC = 300;
export const PRED_CACHE_MS = 3_000;
/** ~1% of the ₹10L paper book. */
export const PRED_SIZE_PCT = 0.01;
/** Mid ± 75 bp (inside the 50–100 bp band). */
export const PRED_FILL_BP = 75;
export const PRED_SUM_LO = 0.88;
export const PRED_SUM_HI = 1.12;
/** Display health: YES+NO in this band is `ok`. Else `bundle_gap` (no auto-arb). */
export const PRED_HEALTH_LO = 0.98;
export const PRED_HEALTH_HI = 1.02;
export const PRED_DELAYED_MS = 15_000;

export const PRED_PROFILE = {
  MIN_META_PROB: 0,
  MAX_HEAT: 0.02,
  MIN_HOLD_SEC: 0,
  TIME_STOP_SEC: 0,
  MAX_SIZE: PRED_SIZE_PCT,
  TP_R: 0,
  TRAIL_ARM_R: 0,
  TRAIL_GIVEBACK_R: 0,
  STOP_PCT_MIN: 0,
  STOP_PCT_MAX: 0,
  COOLDOWN_SEC: 5,
  DAILY_LOSS_LIMIT: -2_000,
  MAX_POS: 2,
  SIZE_FLOOR: PRED_SIZE_PCT,
  SIZE_CEIL: PRED_SIZE_PCT,
  kelly: false,
} as const;

export type PredSide = "yes" | "no";
export type PredWould = "YES" | "NO" | "FLAT";
export type QuoteHealth = "ok" | "stale" | "bundle_gap" | "delayed" | "unavailable";

export type PredQuote = {
  ok: boolean;
  stale: boolean;
  delayed: boolean;
  quoteHealth: QuoteHealth;
  feed: typeof PRED_FEED;
  question: string;
  slug: string;
  windowStart: number;
  windowEnd: number;
  yes: number | null;
  no: number | null;
  yesBid?: number | null;
  yesAsk?: number | null;
  noBid?: number | null;
  noAsk?: number | null;
  volume: number | null;
  would: PredWould;
  resolved: "yes" | "no" | null;
  resolveSource: "polymarket" | "binance" | null;
  note: string;
  fetchedAt?: number;
};

export function isPredSymbol(sym: string): boolean {
  const u = String(sym ?? "").toUpperCase();
  return u === PRED_YES || u === PRED_NO;
}

export function predSideOf(sym: string): PredSide | null {
  const u = String(sym ?? "").toUpperCase();
  if (u === PRED_YES) return "yes";
  if (u === PRED_NO) return "no";
  return null;
}

export function predSymbol(side: PredSide): string {
  return side === "yes" ? PRED_YES : PRED_NO;
}

export function windowStartUnix(nowSec = Math.floor(Date.now() / 1000)): number {
  return Math.floor(nowSec / PRED_WINDOW_SEC) * PRED_WINDOW_SEC;
}

export function btc5mSlugCandidates(windowStart: number): string[] {
  return [
    `btc-updown-5m-${windowStart}`,
    `btc-up-or-down-5-minute-windows-${windowStart}`,
    `btc-up-or-down-5-minute-${windowStart}`,
    `btc-up-down-5m-${windowStart}`,
  ];
}

export function jsonList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p)) return p.map((x) => String(x));
    } catch {
      /* plain */
    }
    return raw ? [raw] : [];
  }
  return [];
}

export function tokenIdsForYesNo(outcomes: string[], tokens: string[]): { yes: string; no: string } {
  let yes = "";
  let no = "";
  for (let i = 0; i < outcomes.length; i += 1) {
    const name = outcomes[i]!.toLowerCase();
    const tok = tokens[i] ?? "";
    if (name === "up" || name === "yes") yes = tok;
    if (name === "down" || name === "no") no = tok;
  }
  if (!yes) yes = tokens[0] ?? "";
  if (!no) no = tokens[1] ?? "";
  return { yes, no };
}

export function yesNoFromOutcomes(outcomes: string[], prices: number[]): { yes: number | null; no: number | null } {
  let yes: number | null = null;
  let no: number | null = null;
  for (let i = 0; i < outcomes.length; i += 1) {
    const name = outcomes[i]!.toLowerCase();
    const px = prices[i];
    if (!(typeof px === "number") || !Number.isFinite(px)) continue;
    if (name === "up" || name === "yes") yes = px;
    if (name === "down" || name === "no") no = px;
  }
  if (yes == null && prices[0] != null) yes = prices[0];
  if (no == null && prices[1] != null) no = prices[1];
  return { yes, no };
}

export function pricesSumOk(yes: number | null, no: number | null): boolean {
  if (yes == null || no == null) return false;
  if (!(yes > 0) || !(no > 0)) return false;
  const s = yes + no;
  return s >= PRED_SUM_LO && s <= PRED_SUM_HI;
}

/** Display only. Do not auto-arb bundle_gap. */
export function quoteHealth(yes: number | null, no: number | null, cacheAgeMs = 0): QuoteHealth {
  if (yes == null || no == null || !(yes > 0) || !(no > 0)) return "unavailable";
  if (cacheAgeMs > PRED_DELAYED_MS) return "delayed";
  const s = yes + no;
  if (s >= PRED_HEALTH_LO && s <= PRED_HEALTH_HI) return "ok";
  if (s >= PRED_SUM_LO && s <= PRED_SUM_HI) return "bundle_gap";
  return "stale";
}

export function applyQuoteHealth(q: PredQuote, cacheAgeMs = 0): PredQuote {
  const health = quoteHealth(q.yes, q.no, cacheAgeMs);
  return {
    ...q,
    quoteHealth: health,
    delayed: health === "delayed",
    stale: health === "stale" || health === "delayed" || health === "unavailable",
    ok: health === "ok" || health === "bundle_gap" || health === "delayed",
  };
}

export function wouldBuy(yes: number | null, no: number | null): PredWould {
  if (!pricesSumOk(yes, no) || yes == null || no == null) return "FLAT";
  if (yes >= 0.55 && yes >= no) return "YES";
  if (no >= 0.55 && no > yes) return "NO";
  return "FLAT";
}

export function predFillPx(mid: number, side: "buy" | "sell", bp = PRED_FILL_BP): number {
  if (!(mid > 0)) return mid;
  const slip = bp / 10_000;
  const raw = side === "buy" ? mid * (1 + slip) : mid * (1 - slip);
  return Math.min(0.99, Math.max(0.01, raw));
}

export function predOpenReason(side: PredSide): string {
  return `pred:btc5m:${side}:paper`;
}

export function predQty(px: number, usdinr: number, budget = 1_000_000, sizePct = PRED_SIZE_PCT): number {
  const inrPx = Math.max(px, 0.01) * Math.max(usdinr, 1);
  const raw = (budget * sizePct) / inrPx;
  return Math.max(0.01, Math.round(raw * 100) / 100);
}

export function predPayout(held: PredSide, winner: PredSide): number {
  return held === winner ? 1 : 0;
}

export function binanceWinner(btcOpen: number, btcClose: number): PredSide {
  return btcClose >= btcOpen ? "yes" : "no";
}

export function isPredSample(row: { sleeve?: string; symbol?: string; reasonOpen?: string; reason_open?: string }): boolean {
  if (row.sleeve === PRED_SLEEVE) return true;
  if (isPredSymbol(String(row.symbol ?? ""))) return true;
  const r = String(row.reasonOpen ?? row.reason_open ?? "");
  return r.startsWith("pred:");
}

export function emptyPredQuote(note = "quote unavailable"): PredQuote {
  const start = windowStartUnix();
  return {
    ok: false,
    stale: true,
    delayed: false,
    quoteHealth: "unavailable",
    feed: PRED_FEED,
    question: "Bitcoin Up or Down — 5 minutes",
    slug: "",
    windowStart: start,
    windowEnd: start + PRED_WINDOW_SEC,
    yes: null,
    no: null,
    volume: null,
    would: "FLAT",
    resolved: null,
    resolveSource: null,
    note,
  };
}

export function parseGammaEvent(raw: unknown, now = Date.now()): PredQuote | null {
  const ev = Array.isArray(raw) ? raw[0] : raw;
  if (!ev || typeof ev !== "object") return null;
  const rec = ev as Record<string, unknown>;
  const markets = Array.isArray(rec.markets) ? rec.markets : [];
  const m0 = (markets[0] ?? rec) as Record<string, unknown>;
  const outcomes = jsonList(m0.outcomes ?? rec.outcomes);
  const priceRaw = jsonList(m0.outcomePrices ?? rec.outcomePrices).map((x) => Number(x));
  const { yes, no } = yesNoFromOutcomes(outcomes, priceRaw);
  const endDate = Date.parse(String(m0.endDate ?? rec.endDate ?? rec.endDateIso ?? ""));
  const fallbackStart = windowStartUnix(Math.floor(now / 1000));
  const windowEnd = Number.isFinite(endDate) ? Math.floor(endDate / 1000) : fallbackStart + PRED_WINDOW_SEC;
  const vol = Number(m0.volumeNum ?? m0.volume ?? rec.volume ?? 0);
  const closed = m0.closed === true || rec.closed === true;
  const uma = String(m0.umaResolutionStatus ?? "").toLowerCase();
  let resolved: PredSide | null = null;
  if (closed || uma === "resolved") {
    if (yes != null && no != null) {
      if (yes >= 0.95 && no <= 0.05) resolved = "yes";
      else if (no >= 0.95 && yes <= 0.05) resolved = "no";
    }
  }
  const health = quoteHealth(yes, no, 0);
  const ok = health === "ok" || health === "bundle_gap";
  const question = String(m0.question ?? rec.title ?? rec.question ?? "Bitcoin Up or Down — 5 minutes");
  const slug = String(rec.slug ?? m0.slug ?? "");
  return {
    ok,
    stale: health === "stale" || health === "unavailable",
    delayed: false,
    quoteHealth: health,
    feed: PRED_FEED,
    question,
    slug,
    windowStart: windowEnd - PRED_WINDOW_SEC,
    windowEnd,
    yes,
    no,
    volume: Number.isFinite(vol) && vol > 0 ? vol : null,
    would: wouldBuy(yes, no),
    resolved,
    resolveSource: resolved ? "polymarket" : null,
    note: ok ? PRED_COPY : "quote unavailable",
    fetchedAt: now,
  };
}
