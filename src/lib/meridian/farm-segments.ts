/**
 * Four-segment farm caps. Caps, not quotas.
 * When cash+FO session is open: 25% notional + 4 clips each.
 * When closed: cash/fo new-entry heat = 0; split remaining farm cap across live segments.
 */

export type FarmSegment = "cash" | "fo" | "crypto" | "other";

export const FARM_SEGMENTS: readonly FarmSegment[] = ["cash", "fo", "crypto", "other"];
export const SEGMENT_BUDGET_FRAC = 0.25;
export const SEGMENT_CLIP_CAP = 4;
export const SYMBOL_BUDGET_FRAC = 0.08;
export const SYMBOL_CLIP_CAP = 2;

const CASH = new Set(["HDFCBANK", "ICICIBANK", "RELIANCE", "TCS", "INFY", "LT", "POLYCAB"]);
const CMDTY = new Set(["GOLD", "SILVER", "CRUDE", "COPPER", "NATGAS"]);
const CRYPTO_SPOT = new Set([
  "BTC", "ETH", "SOL", "BNB",
  "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT", "LTC", "BCH", "NEAR", "SUI", "AAVE", "UNI",
  "ATOM", "FIL", "APT", "ARB", "OP", "INJ", "TIA", "SEI", "PEPE", "WIF", "BONK", "RENDER", "FET", "TAO", "PAXG",
  "TRX", "HBAR", "XLM", "ETC", "ICP", "ONDO", "WLD", "SHIB", "TON", "RUNE", "MKR", "ENA",
  "POL", "STX", "IMX", "GRT", "LDO", "CRV", "SAND", "ALGO", "VET", "JUP", "PYTH", "PENDLE",
  "FLOKI", "ORDI", "CAKE", "ENS", "APE", "GALA", "CHZ", "THETA", "W", "STRK",
]);

export function farmSegmentOf(symbol: string, feed?: string): FarmSegment {
  const u = String(symbol ?? "").toUpperCase();
  const f = String(feed ?? "").toLowerCase();
  if (u === "BTC5M_YES" || u === "BTC5M_NO") return "other";
  if (f.startsWith("binance") || u.endsWith("PERP") || CRYPTO_SPOT.has(u)) return "crypto";
  if (u.startsWith("BTC") || u.startsWith("ETH") || u.startsWith("SOL")) return "crypto";
  if (CMDTY.has(u) || u === "GOLDFUT" || u === "SILVERFUT" || u === "CRUDEFUT" || u === "COPPERFUT") return "other";
  if (u === "USDINR" || u.endsWith("INR") || f.includes("fx")) return "other";
  if (CASH.has(u)) return "cash";
  if (u === "NIFTYFUT" || u === "BANKNIFTYFUT") return "fo";
  if (u.startsWith("NIFTY") || u.startsWith("BANKNIFTY")) return "fo";
  if (f.includes("nse-opt") || f === "nse-opt-model") return "fo";
  if (/\d\s*(CE|PE)$/.test(u) || (u.endsWith("CE") || u.endsWith("PE")) && /NIFTY|BANK|RELIANCE|HDFC/.test(u)) return "fo";
  if (u.endsWith("FUT")) return "fo";
  if (f === "yahoo" && !CMDTY.has(u) && u !== "USDINR") return "cash";
  return "other";
}

export type SegPos = { symbol: string; qty: number; entryPrice: number; feed?: string };

export function clipNotionalInr(qty: number, px: number, segment: FarmSegment, usdInr = 95.7): number {
  const inrPx = segment === "crypto" ? px * usdInr : px;
  return Math.abs(Number(qty) * inrPx) || 0;
}

export function liveFarmSegments(
  names: Array<{ symbol: string; last: number; feed?: string }>,
  sessionOpen: boolean,
): FarmSegment[] {
  const seen = new Set<FarmSegment>();
  for (const n of names) {
    if (!(n.last > 0)) continue;
    const seg = farmSegmentOf(n.symbol, n.feed);
    if (!sessionOpen && (seg === "cash" || seg === "fo")) continue;
    seen.add(seg);
  }
  return FARM_SEGMENTS.filter((s) => seen.has(s));
}

export function segmentNotionalCap(farmBudget: number, nLive: number, sessionOpen: boolean): number {
  const n = Math.max(1, nLive);
  if (sessionOpen) return farmBudget * SEGMENT_BUDGET_FRAC;
  return farmBudget / n;
}

export function segmentClipCap(nLive: number, sessionOpen: boolean, farmMaxPos = 16): number {
  if (sessionOpen) return SEGMENT_CLIP_CAP;
  const n = Math.max(1, nLive);
  return Math.max(1, Math.floor(farmMaxPos / n));
}

/** Short skip: segment_cap:<seg> or symbol_cap:<sym>. Engine tags :paper. */
export function segmentOpenSkip(args: {
  symbol: string;
  feed?: string;
  qty: number;
  px: number;
  positions: SegPos[];
  farmBudget: number;
  sessionOpen: boolean;
  liveSegments: FarmSegment[];
  usdInr?: number;
  farmMaxPos?: number;
}): string | null {
  const seg = farmSegmentOf(args.symbol, args.feed);
  if (!args.sessionOpen && (seg === "cash" || seg === "fo")) return "nse_session_closed";
  const live = args.liveSegments.length ? args.liveSegments : [seg];
  const nLive = Math.max(1, live.length);
  const usdInr = args.usdInr ?? 95.7;
  const add = clipNotionalInr(args.qty, args.px, seg, usdInr);
  let segNotional = add;
  let segClips = 1;
  let symNotional = add;
  let symClips = 1;
  for (const p of args.positions) {
    const pseg = farmSegmentOf(p.symbol, p.feed);
    const n = clipNotionalInr(p.qty, p.entryPrice, pseg, usdInr);
    if (pseg === seg) {
      segNotional += n;
      segClips += 1;
    }
    if (p.symbol.toUpperCase() === args.symbol.toUpperCase()) {
      symNotional += n;
      symClips += 1;
    }
  }
  const clipCap = segmentClipCap(nLive, args.sessionOpen, args.farmMaxPos);
  const notionalCap = segmentNotionalCap(args.farmBudget, nLive, args.sessionOpen);
  if (segClips > clipCap || segNotional > notionalCap + 1e-6) return `segment_cap:${seg}`;
  const symNotionalCap = args.farmBudget * SYMBOL_BUDGET_FRAC;
  if (symClips > SYMBOL_CLIP_CAP || symNotional > symNotionalCap + 1e-6) return `symbol_cap:${args.symbol}`;
  return null;
}
