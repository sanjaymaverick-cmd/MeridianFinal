import { BINANCE_API } from "@/lib/meridian/tickers";
import { formatFoOption } from "@/lib/meridian/fo-contracts";

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

const FAPI = "https://fapi.binance.com";
const DAPI = "https://dapi.binance.com";
const EAPI = "https://eapi.binance.com";

export type BnFut = {
  symbol: string;
  pair: string;
  last: number;
  prev: number;
  chg: number;
  vol: number;
  kind: "usdtm" | "coinm";
};

export type BnOpt = {
  symbol: string;
  pair: string;
  last: number;
  prev: number;
  chg: number;
  expiry: string;
  strike: number;
  right: "CE" | "PE";
  underlier: string;
};

type FutSlot = { at: number; rows: BnFut[] };
type OptSlot = { at: number; rows: BnOpt[] };

const gf = globalThis as typeof globalThis & { __bnFut?: FutSlot; __bnOpt?: OptSlot };

async function fetchJson(url: string, ms = 10000): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function asTicker(raw: unknown): Record<string, string> | null {
  if (!raw) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") return null;
  return row as Record<string, string>;
}

function futRow(desk: string, pair: string, kind: BnFut["kind"], raw: unknown): BnFut | null {
  const tick = asTicker(raw);
  if (!tick) return null;
  const last = Number(tick.lastPrice ?? tick.last ?? tick.price);
  if (!(last > 0)) return null;
  const prev = Number(tick.prevClosePrice ?? tick.openPrice ?? last);
  const chg = Number(tick.priceChangePercent ?? 0) / 100;
  const vol = Number(tick.quoteVolume ?? tick.volume ?? 0);
  return {
    symbol: desk,
    pair,
    last,
    prev: Number.isFinite(prev) && prev > 0 ? prev : last,
    chg: Number.isFinite(chg) ? chg : 0,
    vol: Number.isFinite(vol) ? vol : 0,
    kind,
  };
}

export async function listBinancePerps(force = false): Promise<BnFut[]> {
  const now = Date.now();
  if (!force && gf.__bnFut && now - gf.__bnFut.at < 5_000) return gf.__bnFut.rows;
  const jobs: Array<Promise<BnFut | null>> = [
    fetchJson(`${FAPI}/fapi/v1/ticker/24hr?symbol=BTCUSDT`).then((j) => futRow("BTCPERP", "BTCUSDT", "usdtm", j)),
    fetchJson(`${FAPI}/fapi/v1/ticker/24hr?symbol=ETHUSDT`).then((j) => futRow("ETHPERP", "ETHUSDT", "usdtm", j)),
    fetchJson(`${FAPI}/fapi/v1/ticker/24hr?symbol=SOLUSDT`).then((j) => futRow("SOLPERP", "SOLUSDT", "usdtm", j)),
    fetchJson(`${DAPI}/dapi/v1/ticker/24hr?symbol=BTCUSD_PERP`).then((j) => futRow("BTCUSDPERP", "BTCUSD_PERP", "coinm", j)),
    fetchJson(`${DAPI}/dapi/v1/ticker/24hr?symbol=ETHUSD_PERP`).then((j) => futRow("ETHUSDPERP", "ETHUSD_PERP", "coinm", j)),
  ];
  const rows = (await Promise.all(jobs)).filter((x): x is BnFut => !!x);
  gf.__bnFut = { at: Date.now(), rows };
  return rows;
}

type ETick = { symbol: string; lastPrice?: string; open?: string; priceChangePercent?: string; volume?: string };

export async function listBinanceAtmOptions(spots?: Record<string, number>, force = false): Promise<BnOpt[]> {
  const now = Date.now();
  if (!force && gf.__bnOpt && now - gf.__bnOpt.at < 15_000) return gf.__bnOpt.rows;
  const json = await fetchJson(`${EAPI}/eapi/v1/ticker`, 12000);
  const ticks = Array.isArray(json) ? (json as ETick[]) : [];
  const btc = spots?.BTC ?? g.__bnLive?.bySymbol.BTC?.last ?? 0;
  const eth = spots?.ETH ?? g.__bnLive?.bySymbol.ETH?.last ?? 0;
  const rows = pickAtmOptions(ticks, { BTC: btc, ETH: eth });
  gf.__bnOpt = { at: Date.now(), rows };
  return rows;
}

function pickAtmOptions(ticks: ETick[], spots: Record<string, number>): BnOpt[] {
  const now = Date.now();
  const out: BnOpt[] = [];
  for (const und of ["BTC", "ETH"] as const) {
    const spot = spots[und];
    if (!(spot > 0)) continue;
    const parsed: Array<{ raw: string; last: number; open: number; expMs: number; strike: number; cp: "C" | "P"; y: number; mo: number; d: number }> = [];
    for (const t of ticks) {
      const m = t.symbol?.match(/^(BTC|ETH)-(\d{6})-(\d+(?:\.\d+)?)-([CP])$/);
      if (!m || m[1] !== und) continue;
      const last = Number(t.lastPrice);
      if (!(last > 0)) continue;
      const y = 2000 + Number(m[2]!.slice(0, 2));
      const mo = Number(m[2]!.slice(2, 4));
      const d = Number(m[2]!.slice(4, 6));
      const expMs = Date.UTC(y, mo - 1, d, 8, 0, 0);
      if (expMs - now < 6 * 3600_000) continue;
      parsed.push({
        raw: t.symbol,
        last,
        open: Number(t.open || last),
        expMs,
        strike: Number(m[3]),
        cp: m[4] as "C" | "P",
        y,
        mo,
        d,
      });
    }
    const expiries = [...new Set(parsed.map((p) => p.expMs))].sort((a, b) => a - b);
    const pick = expiries[0];
    if (!pick) continue;
    const chain = parsed.filter((p) => p.expMs === pick);
    for (const cp of ["C", "P"] as const) {
      const side = chain.filter((p) => p.cp === cp).sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot));
      const atm = side[0];
      if (!atm) continue;
      const right: "CE" | "PE" = cp === "C" ? "CE" : "PE";
      const c = formatFoOption(und, new Date(Date.UTC(atm.y, atm.mo - 1, atm.d)), atm.strike, right);
      const prev = Number.isFinite(atm.open) && atm.open > 0 ? atm.open : atm.last;
      out.push({
        symbol: c.symbol,
        pair: atm.raw,
        last: atm.last,
        prev,
        chg: prev ? atm.last / prev - 1 : 0,
        expiry: c.expiry,
        strike: atm.strike,
        right,
        underlier: und,
      });
    }
  }
  return out;
}
