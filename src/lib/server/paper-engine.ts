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
  FARM_PROFILE,
  PNL_PROFILE,
  PNL_CRYPTO,
  profileOf,
  STOP_ATR_MULT,
  type Position,
  type DeskSleeve,
  type SleeveProfile,
} from "@/lib/meridian/decision";
import { getArtefact, predictMetaProb } from "@/lib/meridian/artefact";
import { costClassOf, fillFromMid, netFwdRet, roundTripBps, type CostClass } from "@/lib/meridian/costs";
import {
  confluenceFromParts,
  emptyFeatures,
  hoursToExpiry,
  pSuccessFromScore,
  pushTape,
  tapeFeatures,
  type FeatureVec,
  type TapeStat,
} from "@/lib/meridian/features";
import { barrierFromExit, tripleBarrier } from "@/lib/meridian/triple-barrier";
import { loadArtefactFromDisk, retrainFromJsonl, sampleQuality, type SampleQuality } from "@/lib/server/retrain";
import { getLiveBook, refreshBinanceAnchors } from "@/lib/server/quotes";
import { listBinanceAtmOptions, listBinancePerps } from "@/lib/server/binance-catalog";
import type { UniverseName } from "@/lib/meridian/universe";
import {
  CRYPTO_PERPS,
  NSE_FUT_CORE,
  NSE_OPT_UNDERLIERS,
  OPTION_STUBS,
  atmStrike,
  bsPremium,
  daysToExpiry,
  formatFoOption,
  isCryptoFo,
  isFoSymbol,
  isNseHoursOnly,
  cryptoFamily,
  openSkipReason,
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
  sleeve?: DeskSleeve;
};

type ScanRow = {
  symbol: string;
  action: string;
  reason: string;
  metaProb: number;
  px: number;
  sleeve?: DeskSleeve;
  sizePct?: number;
  pending?: boolean;
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
const FARM_CRYPTO = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","DOT","LTC","BCH","NEAR","SUI","AAVE","UNI","TAO","PAXG"];

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

function cryptoHours(sym: string, feed: string | undefined, assetClass?: string) {
  return assetClass === "crypto" || isCryptoFo(sym) || (feed ?? "").startsWith("binance");
}

function farmWatch(live: Record<string, number>, feed: Record<string, string>, openSession: boolean) {
  const fo = foWatchSymbols(live, feed);
  const nseFo = fo.filter((s) => isNseHoursOnly(s, feed[s]));
  const cryptoFo = fo.filter((s) => isCryptoFo(s) && (feed[s] ?? "").startsWith("binance"));
  const reserved = getArtefact().promoted ? new Set<string>(PNL_CRYPTO) : new Set<string>();
  const liveMajors = Object.keys(live).filter((s) => (FARM_CRYPTO.includes(s) || s.endsWith("PERP")) && !reserved.has(s));
  const crypto = liveMajors.length ? liveMajors : FARM_CRYPTO.slice(0, 8).filter((s) => (live[s] ?? 0) > 0 && !reserved.has(s));
  const cash = openSession ? CASH_WATCH.filter((s) => (live[s] ?? 0) > 0) : [];
  return unique([...crypto, ...cryptoFo, ...(openSession ? nseFo : []), ...cash]);
}

function pnlWatch(live: Record<string, number>, feed: Record<string, string>, openSession: boolean) {
  const fo = foWatchSymbols(live, feed);
  const nseFo = openSession ? fo.filter((s) => isNseHoursOnly(s, feed[s])) : [];
  const cash = openSession ? CASH_WATCH.filter((s) => (live[s] ?? 0) > 0) : [];
  const sat = PNL_CRYPTO.filter((s) => (live[s] ?? 0) > 0);
  return unique([...cash, ...nseFo, ...sat]);
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

function clsFor(sym: string, eng: Engine): CostClass {
  const feed = eng.liveFeed[sym];
  const u = UNIVERSE.find((x) => x.symbol === sym);
  const crypto = cryptoHours(sym, feed, u?.assetClass);
  return costClassOf({
    assetClass: u?.assetClass ?? nameStub(sym, eng.live[sym] ?? 0).assetClass,
    nseFo: isNseHoursOnly(sym, feed),
    crypto,
  });
}

function featuresFor(eng: Engine, sym: string, u: (typeof UNIVERSE)[number], score: number, clock: ReturnType<typeof sessionClock>): FeatureVec {
  const tape = tapeFeatures(eng.tape[sym]);
  const parts = factorParts(u);
  const confluence = confluenceFromParts(parts);
  const pSuccess = pSuccessFromScore(score, tape.ret_short);
  const atr = u.atrPct || 0.016;
  const extra = foFields(sym, eng.foMeta[sym]);
  const f = emptyFeatures();
  f.confidence = Math.min(0.88, score / 10 + 0.06);
  f.confluence = confluence;
  f.p_success = pSuccess;
  f.atr_pct = atr;
  f.approx_stop_pct = Math.min(0.045, Math.max(0.006, STOP_ATR_MULT * atr));
  f.minutes_since_midnight = clock.minutesSinceMidnight;
  f.minutes_to_eod_flatten = clock.openSession ? clock.minutesToEod : 240;
  f.ret_short = tape.ret_short;
  f.range_pct = tape.range_pct;
  f.dist_vwap = tape.dist_vwap;
  f.vol_z = tape.vol_z;
  f.india_vix = (eng.live.INDIAVIX ?? SNAPSHOT.INDIAVIX ?? 11.2) / 100;
  f.pcr = eng.pcr || 0.92;
  f.hours_to_expiry = hoursToExpiry(extra.expiry);
  return f;
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
  meta?: {
    n: number;
    auc: number;
    hitRate: number;
    promoted: boolean;
    source: "synth" | "paper";
    fittedAt: number | null;
    timeStopN?: number;
    qualityHoldN?: number;
    avgHoldSec?: number;
  };
  blocked: string[];
  extraWatch: string[];
  heatFarm: number;
  heatPnl: number;
};

type Engine = PaperBook & {
  quality: SampleQuality;
  cooldownUntil: Record<string, number>;
  anchors: Record<string, number>;
  live: Record<string, number>;
  liveFeed: Record<string, string>;
  vol: Record<string, number>;
  tape: Record<string, TapeStat>;
  pcr: number;
  lastRetrainAt: number;
  lastRetrainN: number;
  delayed: Record<string, boolean>;
  foMeta: Record<string, { expiry?: string; strike?: number; right?: string; contract?: string }>;
};

const g = globalThis as typeof globalThis & {
  __meridianPaper?: { timer: ReturnType<typeof setInterval>; eng: Engine; rev: number };
  __paperTickLock__?: boolean;
  __paperSampleIds__?: Set<string>;
};
const ENGINE_REV = 20;

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
    vol: {},
    tape: {},
    pcr: 0.92,
    lastRetrainAt: 0,
    lastRetrainN: 0,
    delayed: {},
    foMeta: {},
    blocked: [],
    extraWatch: [],
    heatFarm: 0,
    heatPnl: 0,
    quality: { n: 0, timeStopN: 0, qualityHoldN: 0, avgHoldSec: 0 },
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
    const id = String(row.id ?? "");
    g.__paperSampleIds__ ??= new Set();
    if (id && g.__paperSampleIds__.has(id)) return;
    if (id) {
      g.__paperSampleIds__.add(id);
      if (g.__paperSampleIds__.size > 4000) g.__paperSampleIds__.clear();
    }
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

function putLive(eng: Engine, sym: string, last: number, feed: string, delayed: boolean, extra?: Engine["foMeta"][string], vol = 0) {
  if (!(last > 0) || !sym) return;
  eng.live[sym] = last;
  eng.liveFeed[sym] = feed;
  eng.delayed[sym] = delayed;
  if (vol > 0) eng.vol[sym] = vol;
  eng.tape[sym] = pushTape(eng.tape[sym], last, vol || eng.vol[sym] || 0);
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
  eng.vol = {};
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
      if (stale && isCryptoFo(sym)) continue;
      putLive(eng, sym, q.last, q.source, stale, {
        expiry: q.expiry,
        strike: q.strike,
        right: q.right,
        contract: q.contract,
      });
    }
    for (const r of book.binance ?? []) {
      if (r.last > 0 && r.vol > 0) eng.vol[r.symbol] = r.vol;
    }
  } catch {
    /* keep last live */
  }

  let atmCall = 0;
  let atmPut = 0;
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
      const prem = bsPremium(spot, strike, sigma, days, right, 0.065);
      if (und === "NIFTY" && right === "CE") atmCall = prem;
      if (und === "NIFTY" && right === "PE") atmPut = prem;
      putLive(eng, c.symbol, prem, "nse-opt-model", !clockNow.openSession, {
        expiry: c.expiry,
        strike,
        right,
        contract: c.symbol,
      });
    }
  }
  if (atmCall > 0 && atmPut > 0) eng.pcr = atmPut / atmCall;

  if (!Object.keys(eng.live).some((s) => parseFo(s)?.underlier === "BTC")) {
    const spot = eng.live.BTC;
    if (spot > 0) {
      const exp = nextFridayExpiry();
      const strike = atmStrike(spot, "BTC");
      const days = daysToExpiry(isoDate(exp));
      for (const right of ["CE", "PE"] as const) {
        const c = formatFoOption("BTC", exp, strike, right);
        putLive(eng, c.symbol, bsPremium(spot, strike, 0.55, days, right, 0), "crypto-opt-model", false, {
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
  if (g.__paperTickLock__) return;
  g.__paperTickLock__ = true;
  try {
    await tickUnlocked();
  } finally {
    g.__paperTickLock__ = false;
  }
}

async function tickUnlocked() {
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

  const clock = sessionClock();
  const now = Date.now();
  const halted = eng.killed;
  const signalsOnly = eng.mode === "advisory" && !eng.killed;
  let positions = [...eng.positions];

  const still: Position[] = [];
  const keptFamily = new Set<string>();
  for (const pos of positions) {
    const livePx = eng.live[pos.symbol];
    const u = UNIVERSE.find((x) => x.symbol === pos.symbol);
    const feed = eng.liveFeed[pos.symbol] ?? "";
    const allHours = cryptoHours(pos.symbol, feed, u?.assetClass);
    const nseHours = isNseHoursOnly(pos.symbol, feed);
    const night = !clock.openSession;
    const sessionFlat = night && !allHours;
    const fam = cryptoFamily(pos.symbol);
    const famKey = fam ? `${pos.sleeve ?? "farm"}:${fam}` : "";
    const staleCrypto =
      isCryptoFo(pos.symbol) &&
      !!parseFo(pos.symbol) &&
      (eng.delayed[pos.symbol] ||
        pos.quoteLabel === "delayed" ||
        pos.quoteLabel === "model" ||
        ((feed.includes("model") || feed === "nse-opt-model") && !feed.startsWith("binance")));
    if (!(livePx > 0) && !sessionFlat && !staleCrypto) {
      still.push(pos);
      continue;
    }
    const mid = livePx > 0 ? livePx : (eng.ticks[pos.symbol] ?? pos.entryPrice);
    if (halted && !staleCrypto && !(famKey && keptFamily.has(famKey)) && !(sessionFlat && nseHours)) {
      if (famKey) keptFamily.add(famKey);
      still.push(pos);
      continue;
    }
    const prof = profileOf(pos.sleeve);
    let intent;
    if (famKey && keptFamily.has(famKey)) {
      intent = { action: "SELL" as const, sizePct: 0, stopPct: pos.stopPct, reason: "family_net", metaProb: pos.metaProb };
    } else if (staleCrypto) {
      intent = { action: "SELL" as const, sizePct: 0, stopPct: pos.stopPct, reason: "stale_model", metaProb: pos.metaProb };
    } else if (sessionFlat) {
      intent = {
        action: "SELL" as const,
        sizePct: 0,
        stopPct: pos.stopPct,
        reason: nseHours ? "nse_session_closed" : "night_crypto_only",
        metaProb: pos.metaProb,
      };
    } else {
      intent = manage({ ...pos }, mid, now, allHours ? 999 : clock.minutesToEod, prof);
    }
    if (intent.action === "SELL") {
      const cls = clsFor(pos.symbol, eng);
      const closeSide = pos.side === "short" ? "BUY" : "SELL";
      const px = fillFromMid(mid, closeSide === "BUY" ? "buy" : "sell", cls);
      const pnl = pnlOf(pos, px);
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
        sleeve: pos.sleeve,
        ...extra,
      };
      eng.fills = [fill, ...eng.fills].slice(0, 400);
      eng.dailyPnl += pnl;
      eng.cooldownUntil[pos.symbol] = now + prof.COOLDOWN_SEC * 1000;
      const holdSec = (now - pos.entryTs) / 1000;
      const entryMid = pos.entryMid && pos.entryMid > 0 ? pos.entryMid : pos.entryPrice;
      const fwdRetNet = netFwdRet(pos.entryPrice, px, pos.side);
      const fwdRetGross = pos.side === "short" ? entryMid / mid - 1 : mid / entryMid - 1;
      const timedOut = intent.reason === "time_stop" || intent.reason === "eod_flatten" || intent.reason === "nse_session_closed" || intent.reason === "stale_model" || intent.reason === "family_net";
      const tb =
        barrierFromExit(intent.reason, fwdRetGross) ??
        tripleBarrier({
          side: pos.side,
          entry: entryMid,
          high: pos.highSinceEntry,
          low: pos.lowSinceEntry || mid,
          stopPct: pos.stopPct,
          tpR: prof.TP_R,
          timedOut,
          netRet: fwdRetGross,
        });
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
        fwdRet: fwdRetNet,
        fwdRetGross,
        reasonOpen: pos.reasonOpen,
        reasonClose: intent.reason,
        metaProb: pos.metaProb,
        confidence: pos.confidence,
        confluence: pos.confluence,
        pSuccess: pos.pSuccess,
        atrPct: pos.atrPct,
        score: pos.score,
        label: tb.label,
        barrier: tb.barrier,
        sleeve: pos.sleeve ?? "farm",
        costBps: pos.costBps ?? roundTripBps(cls),
        expiry: extra.expiry,
        strike: extra.strike,
        right: extra.right,
        quoteLabel: label,
        features: pos.features,
      });
    } else {
      if (famKey) keptFamily.add(famKey);
      still.push({
        ...pos,
        highSinceEntry: Math.max(pos.highSinceEntry, mid),
        lowSinceEntry: Math.min(pos.lowSinceEntry || mid, mid),
      });
    }
  }
  positions = still;

  const scan: ScanRow[] = [];
  const art = getArtefact();

  async function openSleeve(sleeve: DeskSleeve, watch: string[], profile: SleeveProfile, execute: boolean) {
    const mine = positions.filter((p) => (p.sleeve ?? "farm") === sleeve);
    const heat = mine.reduce((a, p) => a + p.sizePct, 0);
    const ranked = watch.map((sym) => {
      const liveLast = eng.live[sym];
      if (!(liveLast > 0)) return null;
      if (eng.blocked.includes(sym)) return null;
      if (positions.some((p) => p.symbol === sym)) return null;
      const u = nameStub(sym, liveLast);
      const parts = factorParts(u);
      const score = compositeScore(parts, "Calm") ?? 6;
      const f = featuresFor(eng, sym, u, score, clock);
      const hours = cryptoHours(sym, eng.liveFeed[sym], u.assetClass);
      const intent = decide(
        {
          symbol: sym,
          confidence: f.confidence,
          confluence: f.confluence,
          pSuccess: f.p_success,
          atrPct: f.atr_pct,
          minutesToEod: hours ? 999 : clock.minutesToEod,
          minutesSinceMidnight: clock.minutesSinceMidnight,
          beliefPosterior: 0.25,
          portfolioHeat: heat,
          metaProb: art.promoted ? predictMetaProb(f) : undefined,
        },
        {
          dailyPnl: eng.dailyPnl,
          killed: eng.killed,
          live: false,
          nOpen: mine.length,
          cooldownUntil: eng.cooldownUntil,
          promoted: art.promoted,
        },
        now,
        profile,
      );
      return { sym, px: liveLast, score, f, intent, u };
    }).filter(Boolean) as Array<{
      sym: string;
      px: number;
      score: number;
      f: FeatureVec;
      intent: ReturnType<typeof decide>;
      u: (typeof UNIVERSE)[number];
    }>;

    for (const row of ranked) {
      const skip = execute
        ? openSkipReason({
            symbol: row.sym,
            sleeve,
            feed: eng.liveFeed[row.sym],
            delayed: eng.delayed[row.sym],
            openSession: clock.openSession,
            positions,
          })
        : null;
      const action = skip ? "FLAT" : row.intent.action;
      scan.push({
        symbol: `${sleeve}:${row.sym}`,
        action,
        reason: `${sleeve}:${skip ?? row.intent.reason}`,
        metaProb: row.intent.metaProb,
        px: row.px,
        sleeve,
        sizePct: row.intent.sizePct,
        pending: !skip && signalsOnly && (row.intent.action === "BUY" || row.intent.action === "SELL"),
      });
    }

    if (!execute) return;

    ranked.sort((a, b) => Math.abs(b.intent.metaProb - 0.5) - Math.abs(a.intent.metaProb - 0.5));
    let runningHeat = heat;
    let nOpen = mine.length;
    for (const row of ranked) {
      if (nOpen >= profile.MAX_POS) break;
      const mid = eng.live[row.sym];
      if (!(mid > 0)) continue;
      if (
        openSkipReason({
          symbol: row.sym,
          sleeve,
          feed: eng.liveFeed[row.sym],
          delayed: eng.delayed[row.sym],
          openSession: clock.openSession,
          positions,
        })
      ) {
        continue;
      }
      const long = row.intent.action === "BUY";
      const short = row.intent.action === "SELL" && row.intent.reason === "fade_short";
      if (!long && !short) continue;
      const side: "long" | "short" = long ? "long" : "short";
      const sizePct = Math.min(profile.SIZE_CEIL, Math.max(profile.SIZE_FLOOR, row.intent.sizePct || profile.SIZE_FLOOR));
      if (runningHeat + sizePct > profile.MAX_HEAT) continue;
      const cls = clsFor(row.sym, eng);
      const px = fillFromMid(mid, side === "long" ? "buy" : "sell", cls);
      const qty = qtyFor(row.sym, px, sizePct, eng.ticks);
      if (qty <= 0) continue;
      const extra = foFields(row.sym, eng.foMeta[row.sym]);
      const label = quoteLabelOf(eng.liveFeed[row.sym], eng.delayed[row.sym]);
      const pos: Position = {
        symbol: row.sym,
        side,
        entryPrice: px,
        entryMid: mid,
        entryTs: now,
        stopPct: long ? row.intent.stopPct : 0.012,
        sizePct,
        metaProb: row.intent.metaProb,
        highSinceEntry: mid,
        lowSinceEntry: mid,
        qty,
        reasonOpen: long ? row.intent.reason : "fade_short",
        confidence: row.f.confidence,
        confluence: row.f.confluence,
        pSuccess: row.f.p_success,
        atrPct: row.f.atr_pct,
        score: row.score,
        expiry: extra.expiry,
        strike: extra.strike,
        right: extra.right,
        quoteLabel: label,
        sleeve,
        costBps: roundTripBps(cls),
        features: row.f,
      };
      positions.push(pos);
      runningHeat += sizePct;
      nOpen += 1;
      const fill: Fill = {
        id: `${now}-${row.sym}-${sleeve}-${side}-${qty}`,
        ts: now,
        symbol: row.sym,
        side: side === "long" ? "BUY" : "SELL",
        qty,
        price: px,
        reason: `${sleeve}:${pos.reasonOpen}:${label}`,
        quoteLabel: label,
        sleeve,
        ...extra,
      };
      eng.fills = [fill, ...eng.fills].slice(0, 400);
      await persistFill(fill, pos.metaProb, null);
    }
  }

  const farmList = unique([...(eng.extraWatch ?? []), ...farmWatch(eng.live, eng.liveFeed, clock.openSession)]);
  const execute = (eng.mode === "auto" || eng.mode === "paper") && !eng.killed;
  await openSleeve("farm", farmList, FARM_PROFILE, execute);
  await openSleeve("pnl", pnlWatch(eng.live, eng.liveFeed, clock.openSession), PNL_PROFILE, execute);
  if (execute && (eng.samples - eng.lastRetrainN >= 50 || (art.source === "synth" && now - eng.lastRetrainAt > 60_000))) {
    const next = await retrainFromJsonl();
    if (next) {
      eng.lastRetrainAt = now;
      eng.lastRetrainN = eng.samples;
      void sampleQuality().then((q) => {
        eng.quality = q;
      });
    }
  }

  eng.positions = positions;
  eng.heatFarm = positions.filter((p) => (p.sleeve ?? "farm") === "farm").reduce((a, p) => a + p.sizePct, 0);
  eng.heatPnl = positions.filter((p) => p.sleeve === "pnl").reduce((a, p) => a + p.sizePct, 0);
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
          names: eng.positions.map((p) => `${p.sleeve ?? "farm"}:${p.symbol}`),
          samples: eng.samples,
          promoted: getArtefact().promoted,
          auc: getArtefact().auc,
          ticksRun: eng.ticksRun,
          liveNames: Object.keys(eng.live).length,
          source: "binance-live+fo",
          profile: "farm+pnl",
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
    g.__meridianPaper.eng.vol ??= {};
    g.__meridianPaper.eng.tape ??= {};
    g.__meridianPaper.eng.pcr ??= 0.92;
    g.__meridianPaper.eng.lastRetrainAt ??= 0;
    g.__meridianPaper.eng.lastRetrainN ??= 0;
    return;
  }
  if (g.__meridianPaper) clearInterval(g.__meridianPaper.timer);
  const eng = g.__meridianPaper?.eng ?? emptyEngine();
  if (!g.__meridianPaper?.eng) {
    eng.mode = "paper";
    eng.killed = false;
  }
  eng.liveFeed ??= {};
  eng.delayed ??= {};
  eng.foMeta ??= {};
  eng.vol ??= {};
  eng.tape ??= {};
  eng.pcr ??= 0.92;
  eng.lastRetrainAt ??= 0;
  eng.lastRetrainN ??= 0;
  eng.blocked ??= [];
  eng.extraWatch ??= [];
  eng.heatFarm ??= 0;
  eng.heatPnl ??= 0;
  eng.quality ??= { n: 0, timeStopN: 0, qualityHoldN: 0, avgHoldSec: 0 };
  const timer = setInterval(() => {
    tick().catch((err) => console.error("[paper] tick", err));
  }, 2500);
  g.__meridianPaper = { timer, eng, rev: ENGINE_REV };
  void loadArtefactFromDisk()
    .then(() => retrainFromJsonl())
    .then((next) => {
      if (next) {
        eng.lastRetrainAt = Date.now();
        eng.lastRetrainN = eng.samples;
      }
    })
    .catch((err) => console.error("[paper] retrain", err));
  void sampleQuality()
    .then((q) => {
      eng.quality = q;
    })
    .catch(() => {});
  tick().catch((err) => console.error("[paper] first tick", err));
}

if (typeof window === "undefined" && g.__meridianPaper && g.__meridianPaper.rev !== ENGINE_REV) {
  startPaperEngine();
}

export function getEngine(): Engine {
  startPaperEngine();
  return g.__meridianPaper!.eng;
}

export function snapshotBook(): PaperBook {
  const e = getEngine();
  const art = getArtefact();
  const q = e.quality;
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
    blocked: e.blocked ?? [],
    extraWatch: e.extraWatch ?? [],
    heatFarm: e.heatFarm ?? 0,
    heatPnl: e.heatPnl ?? 0,
    meta: {
      n: art.n,
      auc: art.auc,
      hitRate: art.hitRate,
      promoted: art.promoted,
      source: art.source,
      fittedAt: art.fittedAt,
      timeStopN: q?.timeStopN,
      qualityHoldN: q?.qualityHoldN,
      avgHoldSec: q?.avgHoldSec,
    },
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
  const blocked = prev?.eng.blocked ?? [];
  const extraWatch = prev?.eng.extraWatch ?? [];
  const quality = prev?.eng.quality;
  const eng = emptyEngine();
  eng.mode = prev?.eng.mode ?? "paper";
  eng.blocked = blocked;
  eng.extraWatch = extraWatch;
  if (quality) eng.quality = quality;
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

export type OperatorCmd =
  | { type: "flatten"; symbol: string }
  | { type: "flatten_all" }
  | { type: "reverse"; symbol: string }
  | { type: "skip"; symbol: string }
  | { type: "block"; symbol: string }
  | { type: "unblock"; symbol: string }
  | { type: "watch"; symbol: string }
  | { type: "unwatch"; symbol: string }
  | { type: "open"; symbol: string; qty?: number; side?: "long" | "short"; sleeve?: DeskSleeve }
  | { type: "hedge"; side: "long" | "short"; qty?: number };

export function operatorAction(cmd: OperatorCmd): PaperBook & { error?: string } {
  const e = getEngine();
  const now = Date.now();
  const bare = (s: string) => s.replace(/^(farm|pnl):/, "");
  if (cmd.type === "skip") {
    const sym = bare(cmd.symbol);
    e.cooldownUntil[sym] = now + 15 * 60 * 1000;
  } else if (cmd.type === "flatten_all") {
    for (const p of [...e.positions]) flattenNow(e, p.symbol, now);
  } else if (cmd.type === "reverse") {
    const sym = bare(cmd.symbol);
    const pos = e.positions.find((p) => p.symbol === sym);
    if (!pos) return { ...snapshotBook(), error: "no_open_clip" };
    const qty = pos.qty;
    const next: "long" | "short" = pos.side === "long" ? "short" : "long";
    flattenNow(e, sym, now);
    const opened = openNow(e, sym, next, pos.sleeve ?? "farm", qty, now, "reverse_operator");
    if (opened) return { ...snapshotBook(), error: opened };
  } else if (cmd.type === "block") {
    const sym = bare(cmd.symbol);
    if (!e.blocked.includes(sym)) e.blocked = [...e.blocked, sym];
    e.cooldownUntil[sym] = now + 24 * 3600 * 1000;
  } else if (cmd.type === "unblock") {
    const sym = bare(cmd.symbol);
    e.blocked = e.blocked.filter((s) => s !== sym);
  } else if (cmd.type === "watch") {
    const sym = bare(cmd.symbol);
    if (!e.extraWatch.includes(sym)) e.extraWatch = [...e.extraWatch, sym];
  } else if (cmd.type === "unwatch") {
    const sym = bare(cmd.symbol);
    e.extraWatch = e.extraWatch.filter((s) => s !== sym);
  } else if (cmd.type === "flatten") {
    flattenNow(e, bare(cmd.symbol), now);
  } else if (cmd.type === "open") {
    const err = openNow(e, bare(cmd.symbol), cmd.side ?? "long", cmd.sleeve ?? "farm", cmd.qty, now);
    if (err) return { ...snapshotBook(), error: err };
  } else if (cmd.type === "hedge") {
    const sym = e.live.NIFTYFUT ? "NIFTYFUT" : "NIFTY";
    openNow(e, sym, cmd.side, "farm", cmd.qty ?? 1, now, "queue_hedge");
  }
  return snapshotBook();
}

function flattenNow(e: Engine, symbol: string, now: number) {
  const keep: Position[] = [];
  for (const pos of e.positions) {
    if (pos.symbol !== symbol) {
      keep.push(pos);
      continue;
    }
    const mid = e.live[pos.symbol] || e.ticks[pos.symbol] || pos.entryPrice;
    const closeSide = pos.side === "short" ? "BUY" : "SELL";
    const cls = clsFor(pos.symbol, e);
    const px = fillFromMid(mid, closeSide === "BUY" ? "buy" : "sell", cls);
    const pnl = pnlOf(pos, px);
    const extra = foFields(pos.symbol, e.foMeta[pos.symbol]);
    const fill: Fill = {
      id: `${now}-${pos.symbol}-flat-${Math.random().toString(16).slice(2, 8)}`,
      ts: now,
      symbol: pos.symbol,
      side: closeSide,
      qty: pos.qty,
      price: px,
      reason: `flatten_operator:${pos.side}:live`,
      quoteLabel: "live",
      sleeve: pos.sleeve,
      ...extra,
    };
    e.fills = [fill, ...e.fills].slice(0, 400);
    e.dailyPnl += pnl;
    e.cooldownUntil[pos.symbol] = now + 90_000;
    void persistFill(fill, pos.metaProb, pnl);
  }
  e.positions = keep;
}

function openNow(
  e: Engine,
  symbol: string,
  side: "long" | "short",
  sleeve: DeskSleeve,
  qtyIn: number | undefined,
  now: number,
  reason = "open_operator",
): string | undefined {
  const clock = sessionClock();
  const skip = openSkipReason({
    symbol,
    sleeve,
    feed: e.liveFeed[symbol],
    delayed: e.delayed[symbol],
    openSession: clock.openSession,
    positions: e.positions,
  });
  if (skip) return skip;
  if (e.positions.some((p) => p.symbol === symbol)) return "family_open";
  const mid = e.live[symbol] || e.ticks[symbol];
  if (!(mid > 0)) return "bad_price";
  const profile = profileOf(sleeve);
  const sizePct = profile.SIZE_FLOOR;
  const cls = clsFor(symbol, e);
  const px = fillFromMid(mid, side === "long" ? "buy" : "sell", cls);
  const qty = qtyIn && qtyIn > 0 ? qtyIn : qtyFor(symbol, px, sizePct, e.ticks);
  if (qty <= 0) return "zero_size";
  const extra = foFields(symbol, e.foMeta[symbol]);
  const pos: Position = {
    symbol,
    side,
    entryPrice: px,
    entryMid: mid,
    entryTs: now,
    stopPct: side === "short" ? 0.012 : profile.STOP_PCT_MAX,
    sizePct,
    metaProb: 0.55,
    highSinceEntry: mid,
    lowSinceEntry: mid,
    qty,
    reasonOpen: reason,
    confidence: 0.55,
    confluence: 70,
    pSuccess: 0.55,
    atrPct: 0.02,
    score: 6,
    expiry: extra.expiry,
    strike: extra.strike,
    right: extra.right,
    quoteLabel: "live",
    sleeve,
    costBps: roundTripBps(cls),
  };
  e.positions = [...e.positions, pos];
  const fill: Fill = {
    id: `${now}-${symbol}-${sleeve}-op-${qty}`,
    ts: now,
    symbol,
    side: side === "long" ? "BUY" : "SELL",
    qty,
    price: px,
    reason: `${sleeve}:${reason}:live`,
    quoteLabel: "live",
    sleeve,
    ...extra,
  };
  e.fills = [fill, ...e.fills].slice(0, 400);
  void persistFill(fill, pos.metaProb, null);
}

export type FitSampleRow = {
  symbol?: string;
  side?: string;
  hold_sec: number;
  fwd_ret?: number;
  reason_close: string;
  quality_hold: boolean;
  contaminated: boolean;
  set: "fit-jsonl";
  pnl?: number;
};

export async function listFitSamples(limit = 4000): Promise<FitSampleRow[]> {
  const { readFile } = await import("node:fs/promises");
  let txt = "";
  try {
    txt = await readFile(JSONL, "utf8");
  } catch {
    const live = await listSamples(Math.min(limit, 800));
    return live.map((r) => ({
      symbol: r.symbol,
      side: r.side,
      hold_sec: r.hold_sec,
      fwd_ret: r.fwd_ret,
      reason_close: r.reason_close,
      quality_hold: r.hold_sec >= 300,
      contaminated: r.reason_close.includes("time_stop") || r.hold_sec < 120,
      set: "fit-jsonl" as const,
      pnl: r.pnl,
    }));
  }
  const rows: FitSampleRow[] = [];
  const lines = txt.split("\n");
  for (let i = lines.length - 1; i >= 0 && rows.length < limit; i--) {
    const line = lines[i];
    if (!line?.trim()) continue;
    try {
      const r = JSON.parse(line) as {
        symbol?: string;
        side?: string;
        hold_sec?: number;
        holdSec?: number;
        fwd_ret?: number;
        fwdRet?: number;
        reason_close?: string;
        reasonClose?: string;
        pnl?: number;
      };
      const hold = Number(r.hold_sec ?? r.holdSec ?? 0);
      const reason = String(r.reason_close ?? r.reasonClose ?? "");
      rows.push({
        symbol: r.symbol,
        side: r.side,
        hold_sec: hold,
        fwd_ret: Number(r.fwd_ret ?? r.fwdRet ?? 0),
        reason_close: reason,
        quality_hold: hold >= 300,
        contaminated: reason.includes("time_stop") || hold < 120,
        set: "fit-jsonl",
        pnl: Number(r.pnl ?? 0),
      });
    } catch {
      /* skip */
    }
  }
  return rows;
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
