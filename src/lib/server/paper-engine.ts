import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSql } from "@/lib/db";
import { UNIVERSE, factorParts } from "@/lib/meridian/universe";
import { compositeScore } from "@/lib/meridian/scoring";
import { SNAPSHOT } from "@/lib/meridian/tickers";
import {
  decide,
  manage,
  sessionClock,
  PAPER_BUDGET,
  MAX_POS_PAPER,
  COOLDOWN_SEC,
  MAX_HEAT,
  SIZE_FLOOR,
  SIZE_CEIL,
  DESK_PROFILE,
  type Position,
} from "@/lib/meridian/decision";
import { getLiveBook, refreshBinanceAnchors } from "@/lib/server/quotes";
import { listBinanceAtmOptions, listBinancePerps } from "@/lib/server/binance-catalog";
import type { UniverseName } from "@/lib/meridian/universe";
import {
  CRYPTO_PERPS,
  NSE_FUT_CORE,
  NSE_OPT_UNDERLIERS,
  OPTION_STUBS,
  atmPremium,
  atmStrike,
  daysToExpiry,
  formatFoOption,
  isCryptoFo,
  isFoSymbol,
  isoDate,
  nextFridayExpiry,
  nextNseWeeklyExpiry,
  parseFo,
} from "@/lib/meridian/fo-contracts";
import { formatIstStamp } from "@/lib/utils";

type QuoteLabel = "live" | "delayed" | "model";

type Fill = {
  id: string;
  ts: number;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  reason: string;
  quoteLabel?: QuoteLabel;
  expiry?: string;
  strike?: number;
  right?: string;
};

type ScanRow = {
  symbol: string;
  action: string;
  reason: string;
  metaProb: number;
  px: number;
};

function cryptoStub(sym: string, last: number): UniverseName {
  const u = UNIVERSE.find((x) => x.symbol === sym);
  if (u) return { ...u, last: last || u.last };
  return {
    symbol: sym,
    name: `${sym}/USDT`,
    last,
    sma20: last,
    sma50: last,
    high20: last * 1.05,
    low20: last * 0.95,
    rsi: 50,
    atrPct: 0.04,
    quality: 5.4,
    ownership: 5,
    sentiment: 6,
    themes: ["crypto"],
    thesis: "Binance USDT spot. Paper, live last only.",
    sector: "Crypto",
    assetClass: "crypto",
    quote: "USD",
    venue: "Binance",
  };
}

function nameStub(sym: string, last: number): UniverseName {
  const parsed = parseFo(sym);
  const u = UNIVERSE.find((x) => x.symbol === sym);
  if (u) return { ...u, last: last || u.last, name: parsed?.label ?? u.name };
  if (parsed) {
    const crypto = parsed.underlier === "BTC" || parsed.underlier === "ETH" || parsed.underlier === "SOL";
    const fut = parsed.right === "FUT";
    return {
      symbol: parsed.symbol,
      name: parsed.label,
      last,
      sma20: last,
      sma50: last,
      high20: last * 1.08,
      low20: last * 0.92,
      rsi: 50,
      atrPct: fut ? 0.016 : 0.08,
      quality: 6.2,
      ownership: 6,
      sentiment: 6.2,
      themes: fut ? ["futures"] : ["options"],
      thesis: "Paper F and O. Not a Kite order.",
      sector: fut ? "Index fut" : "Index opt",
      assetClass: fut ? "futures" : "options",
      quote: crypto ? "USD" : "INR",
      venue: crypto ? "Binance" : "NFO",
    };
  }
  if (CRYPTO_PERPS.includes(sym as (typeof CRYPTO_PERPS)[number]) || sym.endsWith("PERP")) {
    return {
      symbol: sym,
      name: `${sym} perp`,
      last,
      sma20: last,
      sma50: last,
      high20: last * 1.05,
      low20: last * 0.95,
      rsi: 50,
      atrPct: 0.035,
      quality: 6.4,
      ownership: 6,
      sentiment: 6.4,
      themes: ["futures", "crypto"],
      thesis: "Binance perpetual. Paper, live last.",
      sector: "Crypto perp",
      assetClass: "futures",
      quote: "USD",
      venue: "Binance",
    };
  }
  return cryptoStub(sym, last);
}

const CASH_WATCH = [
  "HDFCBANK",
  "ICICIBANK",
  "RELIANCE",
  "TCS",
  "INFY",
  "LT",
  "POLYCAB",
  "GOLD",
  "CRUDE",
  "USDINR",
  "NIFTYFUT",
];
const PNL_CRYPTO = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","DOT","LTC","BCH","NEAR","SUI","AAVE","UNI","TAO","PAXG"];

function unique(xs: string[]) {
  return [...new Set(xs)];
}

function foWatchSymbols(live: Record<string, number>, feed: Record<string, string>) {
  return Object.keys(live).filter((s) => {
    if (OPTION_STUBS.has(s)) return false;
    if ((CRYPTO_PERPS as readonly string[]).includes(s)) return true;
    if ((NSE_FUT_CORE as readonly string[]).includes(s)) return true;
    if (feed[s] === "binance-fut" || feed[s] === "binance-opt" || feed[s] === "nse-opt-model") return true;
    if (parseFo(s)) return true;
    const u = UNIVERSE.find((x) => x.symbol === s);
    return u?.assetClass === "futures" || u?.assetClass === "options";
  });
}

function activeWatch(live: Record<string, number>, feed: Record<string, string>, openSession: boolean) {
  const fo = foWatchSymbols(live, feed);
  if (DESK_PROFILE === "pnl") {
    const liveMajors = Object.keys(live).filter((s) => PNL_CRYPTO.includes(s) || s.endsWith("PERP"));
    const crypto = liveMajors.length ? liveMajors : PNL_CRYPTO.slice(0, 8).filter((s) => (live[s] ?? 0) > 0);
    const cash = openSession ? CASH_WATCH.filter((s) => (live[s] ?? 0) > 0) : [];
    return unique([...crypto, ...fo, ...cash]);
  }
  const crypto = Object.keys(live).filter((s) => feed[s] === "binance");
  const cash = openSession ? CASH_WATCH.filter((s) => (live[s] ?? 0) > 0) : [];
  const cryptoOrDefault = crypto.length ? crypto : ["BTC", "ETH", "SOL"].filter((s) => (live[s] ?? 0) > 0);
  return unique([...cryptoOrDefault, ...fo, ...cash]);
}

function quoteLabelOf(feed: string | undefined, delayed: boolean | undefined): QuoteLabel {
  if (delayed) return "delayed";
  if (feed?.includes("model") || feed === "nse-opt-model") return "model";
  return "live";
}

function foFields(sym: string, meta?: { expiry?: string; strike?: number; right?: string; contract?: string }) {
  const parsed = parseFo(sym);
  return {
    expiry: parsed?.expiry || meta?.expiry,
    strike: parsed?.strike ?? meta?.strike,
    right: parsed?.right || meta?.right,
  };
}

const DATA_DIR = path.join(process.cwd(), "data");
const JSONL = path.join(DATA_DIR, "paper-samples.jsonl");
const HEARTBEAT = path.join(DATA_DIR, "paper-heartbeat.json");

export type PaperBook = {
  mode: "advisory" | "paper" | "auto";
  killed: boolean;
  positions: Position[];
  fills: Fill[];
  ticks: Record<string, number>;
  dailyPnl: number;
  scan: ScanRow[];
  samples: number;
  lastTick: number;
  ticksRun: number;
};

type Engine = PaperBook & {
  cooldownUntil: Record<string, number>;
  anchors: Record<string, number>;
  live: Record<string, number>;
  liveFeed: Record<string, string>;
  delayed: Record<string, boolean>;
  foMeta: Record<string, { expiry?: string; strike?: number; right?: string; contract?: string }>;
};

const g = globalThis as typeof globalThis & {
  __meridianPaper?: { timer: ReturnType<typeof setInterval>; eng: Engine; rev: number };
};
const ENGINE_REV = 9;

function seedTicks() {
  const t: Record<string, number> = {};
  for (const [k, v] of Object.entries(SNAPSHOT)) t[k] = v;
  for (const u of UNIVERSE) if (u.last) t[u.symbol] = u.last;
  return t;
}

function emptyEngine(): Engine {
  const ticks = seedTicks();
  return {
    mode: "auto",
    killed: false,
    positions: [],
    fills: [],
    ticks,
    anchors: { ...ticks },
    dailyPnl: 0,
    scan: [],
    samples: 0,
    lastTick: 0,
    ticksRun: 0,
    cooldownUntil: {},
    live: {},
    liveFeed: {},
    delayed: {},
    foMeta: {},
  };
}

function qtyFor(sym: string, px: number, sizePct: number, ticks: Record<string, number>) {
  const u = UNIVERSE.find((x) => x.symbol === sym) ?? nameStub(sym, px);
  const notional = PAPER_BUDGET * sizePct;
  const inrPx = u?.quote === "USD" ? px * (ticks.USDINR ?? 95.7) : px;
  const raw = notional / Math.max(inrPx, 0.0001);
  const cls = u?.assetClass ?? "crypto";
  if (cls === "crypto" || cls === "forex" || cls === "commodity" || cls === "futures" || cls === "options" || !u) {
    return Math.max(0.01, Math.round(raw * 100) / 100);
  }
  return Math.max(1, Math.floor(raw));
}

function pnlOf(pos: Position, px: number) {
  const dir = pos.side === "short" ? -1 : 1;
  return (px - pos.entryPrice) * pos.qty * dir;
}

async function persistFill(f: Fill, metaProb: number, pnl: number | null) {
  try {
    const sql = await getSql();
    await sql`
      insert into paper_fills (id, ts, symbol, side, qty, price, reason, meta_prob, pnl)
      values (${f.id}, ${new Date(f.ts).toISOString()}, ${f.symbol}, ${f.side}, ${f.qty}, ${f.price}, ${f.reason}, ${metaProb}, ${pnl})
    `;
  } catch (err) {
    console.error("[paper] fill persist", err);
  }
}

async function persistSample(row: Record<string, unknown>) {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(JSONL, `${JSON.stringify(row)}\n`, "utf8");
    const sql = await getSql();
    await sql`
      insert into paper_samples (
        id, ts_open, ts_close, symbol, side, qty, entry, exit, pnl, hold_sec, fwd_ret,
        reason_open, reason_close, meta_prob, confidence, confluence, p_success, atr_pct, score, features
      ) values (
        ${row.id as string},
        ${new Date(row.tsOpen as number).toISOString()},
        ${new Date(row.tsClose as number).toISOString()},
        ${row.symbol as string},
        ${row.side as string},
        ${row.qty as number},
        ${row.entry as number},
        ${row.exit as number},
        ${row.pnl as number},
        ${row.holdSec as number},
        ${row.fwdRet as number},
        ${row.reasonOpen as string},
        ${row.reasonClose as string},
        ${row.metaProb as number},
        ${row.confidence as number},
        ${row.confluence as number},
        ${row.pSuccess as number},
        ${row.atrPct as number},
        ${row.score as number},
        ${JSON.stringify(row)}
      )
    `;
  } catch (err) {
    console.error("[paper] sample persist", err);
  }
}

function putLive(eng: Engine, sym: string, last: number, feed: string, delayed: boolean, extra?: Engine["foMeta"][string]) {
  if (!(last > 0) || !sym) return;
  eng.live[sym] = last;
  eng.liveFeed[sym] = feed;
  eng.delayed[sym] = delayed;
  if (extra) eng.foMeta[sym] = extra;
}

async function refreshLive(eng: Engine) {
  const live: Record<string, number> = {};
  const feed: Record<string, string> = {};
  const delayed: Record<string, boolean> = {};
  const foMeta: Engine["foMeta"] = {};
  eng.live = live;
  eng.liveFeed = feed;
  eng.delayed = delayed;
  eng.foMeta = foMeta;
  const clockNow = sessionClock();

  try {
    const bn = await refreshBinanceAnchors();
    for (const [sym, last] of Object.entries(bn)) putLive(eng, sym, last, "binance", false);
  } catch {
    /* keep going */
  }

  try {
    const perps = await listBinancePerps();
    for (const r of perps) putLive(eng, r.symbol, r.last, "binance-fut", false, { right: "FUT", contract: r.symbol });
  } catch {
    /* optional */
  }
  if (!eng.live.BTCPERP && eng.live.BTC) putLive(eng, "BTCPERP", eng.live.BTC, "binance-spot-mark", false, { right: "FUT", contract: "BTCPERP" });
  if (!eng.live.ETHPERP && eng.live.ETH) putLive(eng, "ETHPERP", eng.live.ETH, "binance-spot-mark", false, { right: "FUT", contract: "ETHPERP" });
  if (!eng.live.SOLPERP && eng.live.SOL) putLive(eng, "SOLPERP", eng.live.SOL, "binance-spot-mark", false, { right: "FUT", contract: "SOLPERP" });

  try {
    const opts = await listBinanceAtmOptions({ BTC: eng.live.BTC ?? 0, ETH: eng.live.ETH ?? 0 });
    for (const r of opts) {
      putLive(eng, r.symbol, r.last, "binance-opt", false, {
        expiry: r.expiry,
        strike: r.strike,
        right: r.right,
        contract: r.symbol,
      });
    }
  } catch {
    /* mint model crypto options below */
  }

  try {
    const book = await getLiveBook();
    for (const [sym, q] of Object.entries(book.quotes)) {
      if (!(q.last > 0) || q.source === "snapshot" || q.source === "empty") continue;
      const alreadyBn = (eng.liveFeed[sym] ?? "").startsWith("binance");
      if (alreadyBn) continue;
      const isBn = q.source.startsWith("Binance");
      const stale = !clockNow.openSession && !isBn;
      putLive(eng, sym, q.last, q.source, stale, {
        expiry: q.expiry,
        strike: q.strike,
        right: q.right,
        contract: q.contract,
      });
    }
  } catch {
    /* keep last live */
  }

  for (const und of NSE_OPT_UNDERLIERS) {
    const spot = eng.live[und];
    if (!(spot > 0)) continue;
    const exp = nextNseWeeklyExpiry();
    const strike = atmStrike(spot, und);
    const days = daysToExpiry(isoDate(exp));
    const vix = eng.live.INDIAVIX ?? SNAPSHOT.INDIAVIX ?? 11.2;
    const sigma = Math.max(0.08, vix / 100);
    for (const right of ["CE", "PE"] as const) {
      const c = formatFoOption(und, exp, strike, right);
      if (eng.live[c.symbol] > 0 && (eng.liveFeed[c.symbol] ?? "").startsWith("binance")) continue;
      const prem = atmPremium(spot, sigma, days);
      putLive(eng, c.symbol, prem, "nse-opt-model", !clockNow.openSession, {
        expiry: c.expiry,
        strike,
        right,
        contract: c.symbol,
      });
    }
  }

  if (!Object.keys(eng.live).some((s) => parseFo(s)?.underlier === "BTC")) {
    const spot = eng.live.BTC;
    if (spot > 0) {
      const exp = nextFridayExpiry();
      const strike = atmStrike(spot, "BTC");
      const days = daysToExpiry(isoDate(exp));
      for (const right of ["CE", "PE"] as const) {
        const c = formatFoOption("BTC", exp, strike, right);
        putLive(eng, c.symbol, atmPremium(spot, 0.55, days), "crypto-opt-model", false, {
          expiry: c.expiry,
          strike,
          right,
          contract: c.symbol,
        });
      }
    }
  }

  for (const [sym, last] of Object.entries(eng.live)) {
    eng.ticks[sym] = last;
    eng.anchors[sym] = last;
  }
}

async function tick() {
  const slot = g.__meridianPaper;
  if (!slot) return;
  const eng = slot.eng;
  eng.ticksRun += 1;
  eng.lastTick = Date.now();

  try {
    await refreshLive(eng);
  } catch {
    /* keep last live */
  }

  if (eng.mode === "advisory" || eng.killed) return;

  const clock = sessionClock();
  const now = Date.now();
  let positions = [...eng.positions];

  const still: Position[] = [];
  for (const pos of positions) {
    const livePx = eng.live[pos.symbol];
    const u = UNIVERSE.find((x) => x.symbol === pos.symbol);
    const crypto = u?.assetClass === "crypto" || isCryptoFo(pos.symbol) || ((eng.liveFeed[pos.symbol] ?? "").startsWith("binance") && !isFoSymbol(pos.symbol));
    const fo = isFoSymbol(pos.symbol) || u?.assetClass === "futures" || u?.assetClass === "options";
    const night = !clock.openSession;
    if (!(livePx > 0) && !(night && !crypto && !fo)) {
      still.push(pos);
      continue;
    }
    const px = livePx > 0 ? livePx : (eng.ticks[pos.symbol] ?? pos.entryPrice);
    const allHours = crypto || fo;
    const intent =
      night && !allHours
        ? { action: "SELL" as const, sizePct: 0, stopPct: pos.stopPct, reason: "night_crypto_only", metaProb: pos.metaProb }
        : manage({ ...pos }, px, now, allHours ? 999 : clock.minutesToEod);
    if (intent.action === "SELL") {
      const pnl = pnlOf(pos, px);
      const closeSide = pos.side === "short" ? "BUY" : "SELL";
      const label = quoteLabelOf(eng.liveFeed[pos.symbol], eng.delayed[pos.symbol]);
      const extra = foFields(pos.symbol, eng.foMeta[pos.symbol]);
      const fill: Fill = {
        id: `${now}-${pos.symbol}-x-${Math.random().toString(16).slice(2, 8)}`,
        ts: now,
        symbol: pos.symbol,
        side: closeSide,
        qty: pos.qty,
        price: px,
        reason: `${intent.reason}:${pos.side}:${label}`,
        quoteLabel: label,
        ...extra,
      };
      eng.fills = [fill, ...eng.fills].slice(0, 400);
      eng.dailyPnl += pnl;
      eng.cooldownUntil[pos.symbol] = now + COOLDOWN_SEC * 1000;
      const holdSec = (now - pos.entryTs) / 1000;
      const fwdRet = pos.side === "short" ? pos.entryPrice / px - 1 : px / pos.entryPrice - 1;
      eng.samples += 1;
      await persistFill(fill, pos.metaProb, pnl);
      await persistSample({
        id: fill.id,
        tsOpen: pos.entryTs,
        tsClose: now,
        opened_ist: formatIstStamp(pos.entryTs),
        closed_ist: formatIstStamp(now),
        symbol: pos.symbol,
        side: pos.side,
        qty: pos.qty,
        entry: pos.entryPrice,
        exit: px,
        pnl,
        holdSec,
        fwdRet,
        reasonOpen: pos.reasonOpen,
        reasonClose: intent.reason,
        metaProb: pos.metaProb,
        confidence: pos.confidence,
        confluence: pos.confluence,
        pSuccess: pos.pSuccess,
        atrPct: pos.atrPct,
        score: pos.score,
        label: fwdRet > 0 ? 1 : 0,
        expiry: extra.expiry,
        strike: extra.strike,
        right: extra.right,
        quoteLabel: label,
      });
    } else {
      still.push({
        ...pos,
        highSinceEntry: Math.max(pos.highSinceEntry, px),
        lowSinceEntry: Math.min(pos.lowSinceEntry || px, px),
      });
    }
  }
  positions = still;

  const heat = positions.reduce((a, p) => a + p.sizePct, 0);
  const scan: ScanRow[] = [];

  if ((eng.mode === "auto" || eng.mode === "paper") && !eng.killed) {
    const ranked = activeWatch(eng.live, eng.liveFeed, clock.openSession).map((sym) => {
      const liveLast = eng.live[sym];
      if (!(liveLast > 0)) return null;
      const u = nameStub(sym, liveLast);
      const parts = factorParts(u);
      const score = compositeScore(parts, "Calm") ?? 6;
      const pSuccess = Math.min(0.74, Math.max(0.42, 0.5 + (score - 6) * 0.04 + (Math.random() - 0.5) * 0.04));
      const intent = decide(
        {
          symbol: sym,
          confidence: Math.min(0.88, score / 10 + 0.06),
          confluence: 72 + (score - 6),
          pSuccess,
          atrPct: u.atrPct || 0.016,
          minutesToEod: clock.minutesToEod,
          minutesSinceMidnight: 550,
          beliefPosterior: 0.25,
          portfolioHeat: heat,
        },
        {
          dailyPnl: eng.dailyPnl,
          killed: eng.killed,
          live: false,
          nOpen: positions.length,
          cooldownUntil: eng.cooldownUntil,
        },
        now,
      );
      return { sym, px: liveLast, score, pSuccess, intent, u };
    }).filter(Boolean) as Array<{
      sym: string;
      px: number;
      score: number;
      pSuccess: number;
      intent: ReturnType<typeof decide>;
      u: (typeof UNIVERSE)[number];
    }>;

    for (const row of ranked) {
      scan.push({
        symbol: row.sym,
        action: row.intent.action,
        reason: row.intent.reason,
        metaProb: row.intent.metaProb,
        px: row.px,
      });
    }

    const openable = ranked.filter((r) => !positions.some((p) => p.symbol === r.sym));
    openable.sort((a, b) => Math.abs(b.intent.metaProb - 0.5) - Math.abs(a.intent.metaProb - 0.5));

    let runningHeat = heat;
    for (const row of openable) {
      if (positions.length >= MAX_POS_PAPER) break;
      const px = eng.live[row.sym];
      if (!(px > 0)) continue;
      const long = row.intent.action === "BUY";
      const short = row.intent.action === "SELL" && row.intent.reason === "fade_short";
      if (!long && !short) continue;
      const side: "long" | "short" = long ? "long" : "short";
      const sizePct = Math.min(SIZE_CEIL, Math.max(SIZE_FLOOR, row.intent.sizePct || SIZE_FLOOR));
      if (runningHeat + sizePct > MAX_HEAT) continue;
      const qty = qtyFor(row.sym, px, sizePct, eng.ticks);
      if (qty <= 0) continue;
      const extra = foFields(row.sym, eng.foMeta[row.sym]);
      const label = quoteLabelOf(eng.liveFeed[row.sym], eng.delayed[row.sym]);
      const pos: Position = {
        symbol: row.sym,
        side,
        entryPrice: px,
        entryTs: now,
        stopPct: long ? row.intent.stopPct : 0.012,
        sizePct,
        metaProb: row.intent.metaProb,
        highSinceEntry: px,
        lowSinceEntry: px,
        qty,
        reasonOpen: long ? row.intent.reason : "fade_short",
        confidence: Math.min(0.88, row.score / 10 + 0.06),
        confluence: 72,
        pSuccess: row.pSuccess,
        atrPct: row.u.atrPct || 0.016,
        score: row.score,
        expiry: extra.expiry,
        strike: extra.strike,
        right: extra.right,
        quoteLabel: label,
      };
      positions.push(pos);
      runningHeat += sizePct;
      const fill: Fill = {
        id: `${now}-${row.sym}-${side}-${qty}`,
        ts: now,
        symbol: row.sym,
        side: side === "long" ? "BUY" : "SELL",
        qty,
        price: px,
        reason: `${pos.reasonOpen}:${label}`,
        quoteLabel: label,
        ...extra,
      };
      eng.fills = [fill, ...eng.fills].slice(0, 400);
      await persistFill(fill, pos.metaProb, null);
    }
  }

  eng.positions = positions;
  eng.scan = scan;
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
      HEARTBEAT,
      JSON.stringify(
        {
          ts: eng.lastTick,
          mode: eng.mode,
          killed: eng.killed,
          open: eng.positions.length,
          samples: eng.samples,
          ticksRun: eng.ticksRun,
          liveNames: Object.keys(eng.live).length,
          source: "binance-live+fo",
          profile: DESK_PROFILE,
          watch: Object.keys(eng.live).length,
          fo: Object.keys(eng.live).filter((s) => isFoSymbol(s) || (CRYPTO_PERPS as readonly string[]).includes(s)).length,
        },
        null,
        2,
      ),
    );
  } catch {
    /* ignore */
  }
}

export function startPaperEngine() {
  if (typeof window !== "undefined") return;
  if (g.__meridianPaper?.rev === ENGINE_REV) {
    g.__meridianPaper.eng.liveFeed ??= {};
    g.__meridianPaper.eng.delayed ??= {};
    g.__meridianPaper.eng.foMeta ??= {};
    return;
  }
  if (g.__meridianPaper) clearInterval(g.__meridianPaper.timer);
  const eng = g.__meridianPaper?.eng ?? emptyEngine();
  if (!g.__meridianPaper?.eng) {
    eng.mode = "auto";
    eng.killed = false;
  }
  eng.liveFeed ??= {};
  eng.delayed ??= {};
  eng.foMeta ??= {};
  const timer = setInterval(() => {
    tick().catch((err) => console.error("[paper] tick", err));
  }, 2500);
  g.__meridianPaper = { timer, eng, rev: ENGINE_REV };
  tick().catch((err) => console.error("[paper] first tick", err));
}

export function getEngine(): Engine {
  startPaperEngine();
  return g.__meridianPaper!.eng;
}

export function snapshotBook(): PaperBook {
  const e = getEngine();
  return {
    mode: e.mode,
    killed: e.killed,
    positions: e.positions,
    fills: e.fills.slice(0, 80),
    ticks: e.ticks,
    dailyPnl: e.dailyPnl,
    scan: e.scan,
    samples: e.samples,
    lastTick: e.lastTick,
    ticksRun: e.ticksRun,
  };
}

export function setEngineFlags(patch: { mode?: PaperBook["mode"]; killed?: boolean }) {
  const e = getEngine();
  if (patch.mode) e.mode = patch.mode;
  if (patch.killed != null) e.killed = patch.killed;
  return snapshotBook();
}

export function resetEngine() {
  const prev = g.__meridianPaper;
  const eng = emptyEngine();
  if (prev) {
    eng.ticks = { ...prev.eng.anchors, ...seedTicks() };
    eng.anchors = { ...eng.ticks };
    prev.eng = eng;
  } else {
    startPaperEngine();
    if (g.__meridianPaper) g.__meridianPaper.eng = eng;
  }
  return snapshotBook();
}

export async function listSamples(limit = 500): Promise<
  Array<{
    id: string;
    ts_open: string;
    ts_close: string;
    opened_ist: string;
    closed_ist: string;
    symbol: string;
    side: string;
    qty: number;
    entry: number;
    exit: number;
    pnl: number;
    hold_sec: number;
    fwd_ret: number;
    reason_open: string;
    reason_close: string;
    meta_prob: number;
    score: number | null;
  }>
> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    ts_open: string;
    ts_close: string;
    symbol: string;
    side: string;
    qty: number;
    entry: number;
    exit: number;
    pnl: number;
    hold_sec: number;
    fwd_ret: number;
    reason_open: string;
    reason_close: string;
    meta_prob: number;
    score: number | null;
  }>`
    select id, ts_open, ts_close, symbol, side, qty, entry, exit, pnl, hold_sec, fwd_ret,
           reason_open, reason_close, meta_prob, score
    from paper_samples
    order by ts_close desc
    limit ${limit}
  `;
  return rows.map((r) => {
    const openMs = new Date(r.ts_open).getTime();
    const closeMs = new Date(r.ts_close).getTime();
    return {
      id: r.id,
      ts_open: r.ts_open,
      ts_close: r.ts_close,
      opened_ist: Number.isFinite(openMs) ? formatIstStamp(openMs) : "",
      closed_ist: Number.isFinite(closeMs) ? formatIstStamp(closeMs) : "",
      symbol: r.symbol,
      side: r.side,
      qty: Number(r.qty),
      entry: Number(r.entry),
      exit: Number(r.exit),
      pnl: Number(r.pnl),
      hold_sec: Number(r.hold_sec),
      fwd_ret: Number(r.fwd_ret),
      reason_open: r.reason_open,
      reason_close: r.reason_close,
      meta_prob: Number(r.meta_prob),
      score: r.score == null ? null : Number(r.score),
    };
  });
}
