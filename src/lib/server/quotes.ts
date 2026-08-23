import { BINANCE_API, convertPx, SNAPSHOT, yahooFor, type TickerMap } from "@/lib/meridian/tickers";
import { UNIVERSE } from "@/lib/meridian/universe";
import { binanceAnchors, binancePairOf, listBinanceLive, listBinancePerps, listBinanceAtmOptions } from "@/lib/server/binance-catalog";
import { sessionClock } from "@/lib/meridian/decision";
import {
  bsPremium,
  atmStrike,
  formatFoOption,
  isoDate,
  nextNseMonthlyExpiry,
  nextNseWeeklyExpiry,
  nextFridayExpiry,
  daysToExpiry,
} from "@/lib/meridian/fo-contracts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export type LiveQuote = {
  symbol: string;
  last: number;
  prev: number;
  chg: number;
  sma20: number | null;
  sma50: number | null;
  high20: number | null;
  low20: number | null;
  rsi: number | null;
  atrPct: number | null;
  yahoo: string;
  source: string;
  expiry?: string;
  strike?: number;
  right?: string;
  delayed?: boolean;
  contract?: string;
};

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };

export type LiveBook = {
  quotes: Record<string, LiveQuote>;
  asOf: number;
  source: string;
  ok: number;
  fail: number;
  binance: Array<{ symbol: string; pair: string; last: number; chg: number; vol: number }>;
};

type Raw = {
  yahoo: string;
  last: number;
  prev: number;
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  times: number[];
};

const g = globalThis as typeof globalThis & { __meridianQuotes?: { at: number; book: LiveBook } };

function mean(xs: number[]) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function rsi14(closes: number[]) {
  if (closes.length < 15) return null;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  const ag = gain / 14;
  const al = loss / 14;
  if (al === 0) return 100;
  const rs = ag / al;
  return 100 - 100 / (1 + rs);
}

function atrPct(highs: number[], lows: number[], closes: number[]) {
  const n = Math.min(14, highs.length, lows.length, closes.length);
  if (n < 2) return null;
  let s = 0;
  for (let i = highs.length - n; i < highs.length; i++) {
    const prev = closes[i - 1] ?? closes[i]!;
    const tr = Math.max(highs[i]! - lows[i]!, Math.abs(highs[i]! - prev), Math.abs(lows[i]! - prev));
    s += tr;
  }
  const last = closes[closes.length - 1] || 1;
  return s / n / last;
}

async function fetchChart(yahoo: string, range: string, interval = "1d"): Promise<Raw | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=${interval}&range=${range}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ac.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number };
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; open?: (number | null)[]; volume?: (number | null)[] }> };
        }>;
      };
    };
    const r = json.chart?.result?.[0];
    if (!r) return null;
    const q = r.indicators?.quote?.[0];
    const times = r.timestamp ?? [];
    const closes = (q?.close ?? []).map((x) => x ?? NaN);
    const highs = (q?.high ?? []).map((x) => x ?? NaN);
    const lows = (q?.low ?? []).map((x) => x ?? NaN);
    const opens = (q?.open ?? []).map((x) => x ?? NaN);
    const volumes = (q?.volume ?? []).map((x) => x ?? 0);
    const clean = closes.filter((x) => Number.isFinite(x));
    const last = r.meta?.regularMarketPrice ?? clean[clean.length - 1];
    if (!Number.isFinite(last)) return null;
    const prev = clean.length >= 2 ? clean[clean.length - 2]! : last!;
    void opens;
    return { yahoo, last: last!, prev, closes: clean, highs: highs.filter(Number.isFinite), lows: lows.filter(Number.isFinite), volumes, times };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const x = items[i]!;
      i += 1;
      out.push(await fn(x));
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
  return out;
}

function toQuote(symbol: string, map: TickerMap, raw: Raw, scale: (n: number) => number): LiveQuote {
  const closes = raw.closes.map(scale);
  const highs = raw.highs.map(scale);
  const lows = raw.lows.map(scale);
  const last = scale(raw.last);
  const prev = scale(raw.prev);
  const last20 = closes.slice(-20);
  return {
    symbol,
    last,
    prev,
    chg: prev ? last / prev - 1 : 0,
    sma20: mean(last20),
    sma50: mean(closes.slice(-50)),
    high20: last20.length ? Math.max(...last20) : last,
    low20: last20.length ? Math.min(...last20) : last,
    rsi: rsi14(closes),
    atrPct: atrPct(highs, lows, closes),
    yahoo: map.yahoo,
    source: map.convert ? "Yahoo COMEX→MCX" : map.kind === "equity" ? "Yahoo NSE" : "Yahoo",
  };
}

function fallbackQuote(symbol: string): LiveQuote {
  const map = yahooFor(symbol);
  const last = SNAPSHOT[symbol] ?? 0;
  return {
    symbol,
    last,
    prev: last,
    chg: 0,
    sma20: last || null,
    sma50: last || null,
    high20: last || null,
    low20: last || null,
    rsi: 50,
    atrPct: 0.015,
    yahoo: map.yahoo,
    source: last ? "snapshot" : "empty",
  };
}

export function deskSymbols(): string[] {
  const set = new Set<string>(["NIFTY", "BANKNIFTY", "INDIAVIX", "SENSEX"]);
  for (const u of UNIVERSE) {
    const m = yahooFor(u.symbol);
    if (m.feed === "binance" || m.feed === "binance-fut" || m.feed === "derived") continue;
    set.add(u.symbol);
  }
  return [...set];
}

export async function refreshBinanceAnchors(): Promise<Record<string, number>> {
  return binanceAnchors();
}

function realUnderlier(quotes: Record<string, LiveQuote>, underlier: string) {
  const und = quotes[underlier];
  if (!und || !(und.last > 0)) return null;
  if (und.source === 'snapshot' || und.source === 'empty') return null;
  return und;
}

function applyDerived(quotes: Record<string, LiveQuote>) {
  const { openSession } = sessionClock();
  const delayed = !openSession;
  const vix = quotes.INDIAVIX?.last ?? SNAPSHOT.INDIAVIX ?? 11.2;
  const idxVol = Math.max(0.08, vix / 100);
  const weekly = nextNseWeeklyExpiry();
  const monthly = nextNseMonthlyExpiry();
  for (const u of UNIVERSE) {
    const map = yahooFor(u.symbol);
    if (map.feed !== 'derived' || !map.underlier) continue;
    const und = realUnderlier(quotes, map.underlier);
    if (!und) continue;
    const spot = und.last;
    if (map.kind === 'futures') {
      const last = spot * 1.0007;
      const fut = {
        symbol: u.symbol,
        last,
        prev: (und.prev ?? spot) * 1.0007,
        chg: und.chg ?? 0,
        sma20: und.sma20 ?? last,
        sma50: und.sma50 ?? last,
        high20: und.high20 ?? last,
        low20: und.low20 ?? last,
        rsi: und.rsi ?? 50,
        atrPct: und.atrPct ?? 0.016,
        yahoo: map.yahoo,
        source: delayed
          ? 'delayed last (' + map.underlier + ') + 7bp carry - NSE closed'
          : 'derived future (underlier + carry)',
        expiry: isoDate(monthly),
        right: 'FUT',
        delayed,
        contract: map.underlier + ' ' + isoDate(monthly) + ' FUT',
      } satisfies LiveQuote;
      quotes[u.symbol] = fut;
    } else if (map.kind === 'options') {
      const undName = map.underlier;
      const cryptoUnd = undName === 'BTC' || undName === 'ETH' || undName === 'SOL';
      const right: 'CE' | 'PE' = u.symbol.endsWith('PE') ? 'PE' : 'CE';
      const sigma = cryptoUnd ? 0.55 : undName.includes('NIFTY') ? idxVol : 0.28;
      const strike = atmStrike(spot, undName);
      const exp = cryptoUnd ? nextFridayExpiry() : weekly;
      const dte = daysToExpiry(isoDate(exp));
      const prem = bsPremium(spot, strike, sigma, dte, right, cryptoUnd ? 0 : 0.065);
      const c = formatFoOption(undName, exp, strike, right);
      const liveBn = Object.values(quotes).some(
        (q) => q.source.startsWith("Binance option") && (q.symbol.startsWith(undName + " ") || (q.contract ?? "").startsWith(undName)),
      );
      const row: LiveQuote = {
        symbol: u.symbol,
        last: prem,
        prev: prem / (1 + (und.chg ?? 0) * 0.5),
        chg: (und.chg ?? 0) * (right === 'PE' ? -0.6 : 0.6),
        sma20: prem,
        sma50: prem,
        high20: prem * 1.15,
        low20: prem * 0.85,
        rsi: 50,
        atrPct: 0.12,
        yahoo: map.yahoo,
        source: cryptoUnd
          ? 'crypto ATM model ' + c.symbol + ' - not an exchange print'
          : delayed
            ? 'delayed ATM model ' + c.symbol + ' - not an exchange print'
            : 'ATM model ' + c.symbol + ' - not an exchange print',
        expiry: c.expiry,
        strike,
        right,
        delayed: cryptoUnd ? false : delayed,
        contract: c.symbol,
      };
      quotes[u.symbol] = row;
      if (!cryptoUnd && !quotes[c.symbol]) quotes[c.symbol] = { ...row, symbol: c.symbol };
      if (cryptoUnd && !liveBn && !quotes[c.symbol]) quotes[c.symbol] = { ...row, symbol: c.symbol };
    }
  }
}

export async function getLiveBook(force = false): Promise<LiveBook> {
  const now = Date.now();
  if (!force && g.__meridianQuotes && now - g.__meridianQuotes.at < 45_000) return g.__meridianQuotes.book;

  const symbols = deskSymbols();
  const priority = [
    "NIFTY",
    "BANKNIFTY",
    "INDIAVIX",
    "SENSEX",
    "USDINR",
    "GOLD",
    "CRUDE",
    "SILVER",
    "RELIANCE",
    "HDFCBANK",
    "TCS",
    "INFY",
    "ICICIBANK",
    "POLYCAB",
    "LT",
    "EURUSD",
    "BRENT",
  ];
  const ordered = [...priority.filter((s) => symbols.includes(s)), ...symbols.filter((s) => !priority.includes(s))];

  const [bnRows, raws] = await Promise.all([
    listBinanceLive(),
    (async () => {
      const deadline = Date.now() + 8000;
      return pool(ordered, 10, async (symbol) => {
        const map = yahooFor(symbol);
        const range = priority.includes(symbol) ? "3mo" : "5d";
        if (Date.now() > deadline) return { symbol, map, raw: null as Raw | null };
        const raw = await fetchChart(map.yahoo, range);
        return { symbol, map, raw };
      });
    })(),
  ]);

  const inrRaw = raws.find((r) => r.symbol === "USDINR")?.raw;
  const usdinr = inrRaw?.last ?? SNAPSHOT.USDINR ?? 95.7;

  const quotes: Record<string, LiveQuote> = {};
  let ok = 0;
  let fail = 0;
  for (const row of raws) {
    if (!row.raw) {
      fail += 1;
      quotes[row.symbol] = fallbackQuote(row.symbol);
      continue;
    }
    ok += 1;
    const scale = (n: number) => (row.map.convert ? convertPx(row.map.convert, n, usdinr) : n);
    quotes[row.symbol] = toQuote(row.symbol, row.map, row.raw, scale);
  }

  for (const r of bnRows) {
    quotes[r.symbol] = {
      symbol: r.symbol,
      last: r.last,
      prev: r.prev,
      chg: r.chg,
      sma20: r.last,
      sma50: r.last,
      high20: r.last,
      low20: r.last,
      rsi: 50,
      atrPct: 0.035,
      yahoo: r.pair,
      source: "Binance",
    };
    ok += 1;
  }

  applyDerived(quotes);

  const [perps, opts] = await Promise.all([
    listBinancePerps(),
    listBinanceAtmOptions({ BTC: quotes.BTC?.last ?? 0, ETH: quotes.ETH?.last ?? 0 }),
  ]);
  for (const r of perps) {
    quotes[r.symbol] = {
      symbol: r.symbol,
      last: r.last,
      prev: r.prev,
      chg: r.chg,
      sma20: r.last,
      sma50: r.last,
      high20: r.last,
      low20: r.last,
      rsi: 50,
      atrPct: 0.035,
      yahoo: r.pair,
      source: r.kind === "coinm" ? "Binance COIN-M perp" : "Binance USDT-M perp",
      right: "FUT",
      delayed: false,
      contract: r.symbol,
    };
    ok += 1;
  }
  for (const r of opts) {
    quotes[r.symbol] = {
      symbol: r.symbol,
      last: r.last,
      prev: r.prev,
      chg: r.chg,
      sma20: r.last,
      sma50: r.last,
      high20: r.last * 1.15,
      low20: r.last * 0.85,
      rsi: 50,
      atrPct: 0.12,
      yahoo: r.pair,
      source: "Binance option " + r.pair,
      expiry: r.expiry,
      strike: r.strike,
      right: r.right,
      delayed: false,
      contract: r.symbol,
    };
    ok += 1;
  }

  const book: LiveBook = {
    quotes,
    asOf: Date.now(),
    source: "Binance USDT + USDT-M/COIN-M + options. NSE F and O is delayed last or ATM model when cash session is closed.",
    ok,
    fail,
    binance: bnRows.map((r) => ({ symbol: r.symbol, pair: r.pair, last: r.last, chg: r.chg, vol: r.vol })),
  };
  g.__meridianQuotes = { at: Date.now(), book };
  return book;
}

export async function getHistoryBars(symbol: string, range: "1mo" | "3mo" | "1y" | "5y" = "1y"): Promise<{
  symbol: string;
  bars: Bar[];
  source: string;
  yahoo: string;
}> {
  const map = yahooFor(symbol);
  const futPair = map.feed === "binance-fut" ? map.binance : null;
  const pair = (map.feed === "binance" && map.binance) || (futPair && !futPair.includes("_") ? futPair : null) || binancePairOf(symbol);
  if (futPair && futPair.includes("_")) {
    const limit = range === "1mo" ? 30 : range === "3mo" ? 90 : range === "5y" ? 1000 : 365;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    try {
      const url = `https://dapi.binance.com/dapi/v1/klines?symbol=${futPair}&interval=1d&limit=${limit}`;
      const res = await fetch(url, { signal: ac.signal, headers: { Accept: "application/json" } });
      if (res.ok) {
        const rows = (await res.json()) as Array<[number, string, string, string, string, string]>;
        const bars: Bar[] = rows.map((r) => ({
          t: r[0],
          o: Number(r[1]),
          h: Number(r[2]),
          l: Number(r[3]),
          c: Number(r[4]),
          v: Number(r[5]),
        })).filter((b) => Number.isFinite(b.c));
        return { symbol, bars, source: `Binance COIN-M ${futPair} daily`, yahoo: futPair };
      }
    } catch {
      /* fall through */
    } finally {
      clearTimeout(t);
    }
  }
  if (pair) {
    const limit = range === "1mo" ? 30 : range === "3mo" ? 90 : range === "5y" ? 1000 : 365;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    try {
      const url = map.feed === "binance-fut" ? `https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=1d&limit=${limit}` : `${BINANCE_API}/api/v3/klines?symbol=${pair}&interval=1d&limit=${limit}`;
      const res = await fetch(url, { signal: ac.signal, headers: { Accept: "application/json" } });
      if (res.ok) {
        const rows = (await res.json()) as Array<[number, string, string, string, string, string]>;
        const bars: Bar[] = rows.map((r) => ({
          t: r[0],
          o: Number(r[1]),
          h: Number(r[2]),
          l: Number(r[3]),
          c: Number(r[4]),
          v: Number(r[5]),
        })).filter((b) => Number.isFinite(b.c));
        return { symbol, bars, source: `Binance ${pair} daily`, yahoo: pair };
      }
    } catch {
      /* fall through to Yahoo */
    } finally {
      clearTimeout(t);
    }
  }
  if (map.feed === "derived" && map.underlier) {
    return getHistoryBars(map.underlier, range);
  }
  const raw = await fetchChart(map.yahoo, range);
  if (!raw) return { symbol, bars: [], source: "unavailable", yahoo: map.yahoo };

  let usdinr = SNAPSHOT.USDINR ?? 95.7;
  let inrCloses: number[] | null = null;
  let inrTimes: number[] | null = null;
  if (map.convert) {
    const fx = await fetchChart("INR=X", range);
    if (fx) {
      usdinr = fx.last;
      inrCloses = fx.closes;
      inrTimes = fx.times;
    }
  }

  const bars: Bar[] = [];
  const n = Math.min(raw.times.length, raw.closes.length);
  for (let i = 0; i < n; i++) {
    const c = raw.closes[i];
    if (!Number.isFinite(c)) continue;
    let fx = usdinr;
    if (inrTimes && inrCloses) {
      const t = raw.times[i]!;
      let best = inrCloses[inrCloses.length - 1]!;
      for (let j = 0; j < inrTimes.length; j++) {
        if (inrTimes[j]! <= t + 86400) best = inrCloses[j]!;
        else break;
      }
      fx = best;
    }
    const scale = (n: number) => (map.convert ? convertPx(map.convert, n, fx) : n);
    const o = scale(c!);
    bars.push({
      t: (raw.times[i] ?? 0) * 1000,
      o,
      h: scale(raw.highs[i] ?? c!),
      l: scale(raw.lows[i] ?? c!),
      c: o,
      v: raw.volumes[i] ?? 0,
    });
  }
  return {
    symbol,
    bars,
    source: map.convert ? "Yahoo COMEX × USDINR (MCX estimate)" : "Yahoo daily (jugaad-style)",
    yahoo: map.yahoo,
  };
}

export function overlayName<T extends { symbol: string; last: number; sma20: number; sma50: number; high20: number; low20: number; rsi: number; atrPct: number }>(
  u: T,
  q?: LiveQuote,
): T {
  if (!q || !q.last) return u;
  return {
    ...u,
    last: q.last,
    sma20: q.sma20 ?? (u.sma20 || q.last),
    sma50: q.sma50 ?? (u.sma50 || q.last),
    high20: q.high20 ?? (u.high20 || q.last),
    low20: q.low20 ?? (u.low20 || q.last),
    rsi: q.rsi ?? u.rsi,
    atrPct: q.atrPct ?? u.atrPct,
  };
}
