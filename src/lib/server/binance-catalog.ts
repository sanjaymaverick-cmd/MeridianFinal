import { BINANCE_API } from "@/lib/meridian/tickers";

const SKIP_BASE = new Set([
  "USDC",
  "FDUSD",
  "TUSD",
  "DAI",
  "USDP",
  "USDD",
  "EUR",
  "TRY",
  "BRL",
  "AEUR",
  "USD1",
  "RLUSD",
  "U",
  "USDT",
]);
const LEV = /(UP|DOWN|BULL|BEAR)$/;

export type BnLive = {
  symbol: string;
  pair: string;
  last: number;
  prev: number;
  chg: number;
  vol: number;
};

type BnTick = {
  symbol: string;
  lastPrice: string;
  prevClosePrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
};

const g = globalThis as typeof globalThis & {
  __bnLive?: { at: number; rows: BnLive[]; bySymbol: Record<string, BnLive> };
  __bnTrading?: { at: number; pairs: Set<string> };
};

function deskSymbol(pair: string): string | null {
  if (!pair.endsWith("USDT")) return null;
  const base = pair.slice(0, -4);
  if (!base || SKIP_BASE.has(base)) return null;
  if (LEV.test(base)) return null;
  return base;
}

async function tradingUsdt(): Promise<Set<string>> {
  const now = Date.now();
  if (g.__bnTrading && now - g.__bnTrading.at < 30 * 60_000) return g.__bnTrading.pairs;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12000);
  try {
    const res = await fetch(`${BINANCE_API}/api/v3/exchangeInfo`, { signal: ac.signal, headers: { Accept: "application/json" } });
    const pairs = new Set<string>();
    if (res.ok) {
      const json = (await res.json()) as { symbols?: Array<{ symbol: string; status: string; quoteAsset: string; isSpotTradingAllowed?: boolean }> };
      for (const s of json.symbols ?? []) {
        if (s.status !== "TRADING") continue;
        if (s.quoteAsset !== "USDT") continue;
        if (s.isSpotTradingAllowed === false) continue;
        if (!deskSymbol(s.symbol)) continue;
        pairs.add(s.symbol);
      }
    }
    if (pairs.size === 0) {
      // ticker-only fallback
      return pairs;
    }
    g.__bnTrading = { at: now, pairs };
    return pairs;
  } catch {
    return g.__bnTrading?.pairs ?? new Set();
  } finally {
    clearTimeout(t);
  }
}

async function fetch24h(): Promise<BnTick[]> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const res = await fetch(`${BINANCE_API}/api/v3/ticker/24hr`, { signal: ac.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const rows = (await res.json()) as BnTick[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

export async function listBinanceLive(force = false): Promise<BnLive[]> {
  const now = Date.now();
  if (!force && g.__bnLive && now - g.__bnLive.at < 3_000) return g.__bnLive.rows;

  const [allowed, ticks] = await Promise.all([tradingUsdt(), fetch24h()]);
  const bySymbol: Record<string, BnLive> = {};
  for (const tick of ticks) {
    const pair = tick.symbol;
    if (allowed.size && !allowed.has(pair)) continue;
    const symbol = deskSymbol(pair);
    if (!symbol) continue;
    const last = Number(tick.lastPrice);
    if (!(last > 0)) continue;
    const prev = Number(tick.prevClosePrice || last);
    const chg = Number(tick.priceChangePercent || 0) / 100;
    const vol = Number(tick.quoteVolume || 0);
    const cur = bySymbol[symbol];
    if (cur && cur.vol >= vol) continue;
    bySymbol[symbol] = {
      symbol,
      pair,
      last,
      prev: Number.isFinite(prev) ? prev : last,
      chg: Number.isFinite(chg) ? chg : 0,
      vol: Number.isFinite(vol) ? vol : 0,
    };
  }

  const rows = Object.values(bySymbol).sort((a, b) => b.vol - a.vol);
  g.__bnLive = { at: Date.now(), rows, bySymbol };
  return rows;
}

export async function binanceAnchors(): Promise<Record<string, number>> {
  const rows = await listBinanceLive();
  const out: Record<string, number> = {};
  for (const r of rows) out[r.symbol] = r.last;
  return out;
}

export function binancePairOf(symbol: string): string | null {
  const hit = g.__bnLive?.bySymbol[symbol.toUpperCase()];
  if (hit) return hit.pair;
  return null;
}

export function binanceBySymbol(): Record<string, BnLive> {
  return g.__bnLive?.bySymbol ?? {};
}
