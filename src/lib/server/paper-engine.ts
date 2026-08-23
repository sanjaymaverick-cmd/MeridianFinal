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
import { tripleBarrier } from "@/lib/meridian/triple-barrier";
import { loadArtefactFromDisk, retrainFromJsonl } from "@/lib/server/retrain";
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
  isNseFo,
  isoDate,
  nextFridayExpiry,
  nextNseWeeklyExpiry,
  parseFo,
} from "@/lib/meridian/fo-contracts";
import { formatIstStamp } from "@/lib/utils";
import { englishReason, quoteSource, PENDING_MS } from "@/lib/ux-copy";

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
};

export type PendingClip = {
  id: string;
  ts: number;
  expiresAt: number;
  symbol: string;
  side: "long" | "short";
  qty: number;
  sizePct: number;
  px: number;
  mid: number;
  reason: string;
  sleeve: DeskSleeve;
  metaProb: number;
  stopPct: number;
  score: number;
  confidence: number;
  confluence: number;
  pSuccess: number;
  atrPct: number;
  features: FeatureVec;
  expiry?: string;
  strike?: number;
  right?: string;
  quoteLabel?: QuoteLabel;
  timeout: "auto-skip" | "auto-send";
};

export type CloseStats = { n: number; timeStop: number; quality: number };

export type QueuedHedge = { symbol: string; note: string; ts: number; from: string };

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

/** NSE F&O only while the cash session is open. Binance names stay 24/7. */
function isNseHoursOnly(sym: string, feed?: string) {
  if ((feed ?? "").startsWith("binance")) return false;
  if (isCryptoFo(sym)) return false;
  return isNseFo(sym) || feed === "nse-opt-model";
}

function cryptoHours(sym: string, feed: string | undefined, assetClass?: string) {
  return assetClass === "crypto" || isCryptoFo(sym) || (feed ?? "").startsWith("binance");
}

function farmWatch(live: Record<string, number>, feed: Record<string, string>, openSession: boolean) {
  const fo = foWatchSymbols(live, feed);
  const nseFo = fo.filter((s) => isNseHoursOnly(s, feed[s]));
  const cryptoFo = fo.filter((s) => !isNseHoursOnly(s, feed[s]));
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
  pausedAt?: number | null;
  pending: PendingClip[];
  blocked: string[];
  watched: string[];
  lastDecision: string;
  heat: { farm: number; pnl: number };
  closeStats: CloseStats;
  queuedHedge: QueuedHedge | null;
  meta?: {
    n: number;
    auc: number;
    hitRate: number;
    promoted: boolean;
    source: "synth" | "paper";
    fittedAt: number | null;
  };
};

type Engine = PaperBook & {
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
  blockedMap: Record<string, boolean>;
};

const g = globalThis as typeof globalThis & {
  __meridianPaper?: { timer: ReturnType<typeof setInterval>; eng: Engine; rev: number };
};
const ENGINE_REV = 17;

function seedTicks() {
  const t: Record<string, number> = {};
  for (const [k, v] of Object.entries(SNAPSHOT)) t[k] = v;
  for (const u of UNIVERSE) if (u.last) t[u.symbol] = u.last;
  return t;
}

function emptyEngine(): Engine {
  const ticks = seedTicks();
  return {
    mode: "advisory",
    killed: true,
    positions: [],
    fills: [],
    ticks,
    anchors: { ...ticks },
    dailyPnl: 0,
    scan: [],
    samples: 0,
    lastTick: 0,
    ticksRun: 0,
    pausedAt: Date.now(),
    pending: [],
    blocked: [],
    watched: [],
    lastDecision: "Engine paused. Start paper to send clips. Signals still scan.",
    heat: { farm: 0, pnl: 0 },
    closeStats: { n: 0, timeStop: 0, quality: 0 },
    queuedHedge: null,
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
    blockedMap: {},
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

function bumpClose(eng: Engine, reason: string) {
  eng.closeStats.n += 1;
  if (reason === "time_stop") eng.closeStats.timeStop += 1;
  else eng.closeStats.quality += 1;
}

function heatOf(positions: Position[]) {
  return {
    farm: positions.filter((p) => (p.sleeve ?? "farm") === "farm").reduce((a, p) => a + p.sizePct, 0),
    pnl: positions.filter((p) => p.sleeve === "pnl").reduce((a, p) => a + p.sizePct, 0),
  };
}

function lastDecisionOf(eng: Engine): string {
  if (eng.killed) {
    const t = eng.pausedAt ? formatIstStamp(eng.pausedAt) : "";
    return `Engine paused${t ? ` at ${t}` : ""}. Exits still run. No new paper clips.`;
  }
  if (eng.mode === "advisory") {
    const hit = eng.scan.find((s) => s.action.startsWith("Would"));
    if (hit) return `${hit.action} ${hit.symbol.replace(/^\w+:/, "")} — ${hit.reason}. Not sent.`;
    return "Signals only. Last scan is live. Nothing is sent until Start paper.";
  }
  const p = eng.pending[0];
  if (p) {
    const left = Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000));
    return `Pending ${p.side === "long" ? "BUY" : "SELL"} ${p.symbol} — Approve, Skip, or ${p.timeout} in ${left}s.`;
  }
  const hit = eng.scan.find((s) => s.action === "BUY" || s.action === "SELL");
  if (hit) return `${hit.action} ${hit.symbol.replace(/^\w+:/, "")} — ${hit.reason}.`;
  return "No clip to send this scan.";
}

function ensureEngineExtras(eng: Engine) {
  eng.pending ??= [];
  eng.blocked ??= [];
  eng.watched ??= [];
  eng.closeStats ??= { n: 0, timeStop: 0, quality: 0 };
  eng.queuedHedge ??= null;
  eng.blockedMap ??= Object.fromEntries((eng.blocked ?? []).map((s) => [s, true]));
  eng.heat ??= { farm: 0, pnl: 0 };
  eng.lastDecision ??= "";
  eng.pausedAt ??= eng.killed ? Date.now() : null;
}

type OpenSpec = {
  symbol: string;
  side: "long" | "short";
  qty: number;
  sizePct: number;
  px: number;
  mid: number;
  reason: string;
  sleeve: DeskSleeve;
  metaProb: number;
  stopPct: number;
  score: number;
  confidence: number;
  confluence: number;
  pSuccess: number;
  atrPct: number;
  features: FeatureVec;
  expiry?: string;
  strike?: number;
  right?: string;
  quoteLabel?: QuoteLabel;
};

function openFromSpec(eng: Engine, spec: OpenSpec, now: number) {
  if (eng.positions.some((p) => p.symbol === spec.symbol)) return;
  if (eng.blockedMap[spec.symbol]) return;
  const extra = foFields(spec.symbol, eng.foMeta[spec.symbol]);
  const pos: Position = {
    symbol: spec.symbol,
    side: spec.side,
    entryPrice: spec.px,
    entryMid: spec.mid,
    entryTs: now,
    stopPct: spec.stopPct,
    sizePct: spec.sizePct,
    metaProb: spec.metaProb,
    highSinceEntry: spec.mid,
    lowSinceEntry: spec.mid,
    qty: spec.qty,
    reasonOpen: spec.reason,
    confidence: spec.confidence,
    confluence: spec.confluence,
    pSuccess: spec.pSuccess,
    atrPct: spec.atrPct,
    score: spec.score,
    expiry: spec.expiry ?? extra.expiry,
    strike: spec.strike ?? extra.strike,
    right: spec.right ?? extra.right,
    quoteLabel: spec.quoteLabel,
    sleeve: spec.sleeve,
    costBps: roundTripBps(clsFor(spec.symbol, eng)),
    features: spec.features,
  };
  eng.positions.push(pos);
  const fill: Fill = {
    id: `${now}-${spec.symbol}-${spec.sleeve}-${spec.side}-${spec.qty}`,
    ts: now,
    symbol: spec.symbol,
    side: spec.side === "long" ? "BUY" : "SELL",
    qty: spec.qty,
    price: spec.px,
    reason: englishReason(spec.reason, {
      sleeve: spec.sleeve,
      quote: quoteSource(spec.quoteLabel, eng.liveFeed[spec.symbol]),
    }),
    quoteLabel: spec.quoteLabel,
    sleeve: spec.sleeve,
    expiry: pos.expiry,
    strike: pos.strike,
    right: pos.right,
  };
  eng.fills = [fill, ...eng.fills].slice(0, 400);
  void persistFill(fill, pos.metaProb, null);
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
  const freezeScan = eng.killed && eng.mode !== "advisory";
  let positions = [...eng.positions];
  ensureEngineExtras(eng);

  eng.pending = (eng.pending ?? []).filter((p) => {
    if (now < p.expiresAt) return true;
    if (p.timeout === "auto-send" && eng.mode === "auto" && !eng.killed) {
      openFromSpec(eng, p, now);
    }
    return false;
  });
  positions = [...eng.positions];

  const still: Position[] = [];
  for (const pos of positions) {
    const livePx = eng.live[pos.symbol];
    const u = UNIVERSE.find((x) => x.symbol === pos.symbol);
    const feed = eng.liveFeed[pos.symbol] ?? "";
    const allHours = cryptoHours(pos.symbol, feed, u?.assetClass);
    const nseHours = isNseHoursOnly(pos.symbol, feed);
    const night = !clock.openSession;
    const sessionFlat = night && !allHours;
    if (!(livePx > 0) && !sessionFlat) {
      still.push(pos);
      continue;
    }
    const mid = livePx > 0 ? livePx : (eng.ticks[pos.symbol] ?? pos.entryPrice);
    const prof = profileOf(pos.sleeve);
    const intent = sessionFlat
      ? {
          action: "SELL" as const,
          sizePct: 0,
          stopPct: pos.stopPct,
          reason: nseHours ? "nse_session_closed" : "night_crypto_only",
          metaProb: pos.metaProb,
        }
      : manage({ ...pos }, mid, now, allHours ? 999 : clock.minutesToEod, prof);
    if (intent.action === "SELL") {
      const cls = clsFor(pos.symbol, eng);
      const closeSide: Fill["side"] = pos.side === "short" ? "BUY" : "SELL";
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
        reason: englishReason(`${intent.reason}:${pos.side}`, {
          sleeve: pos.sleeve,
          quote: quoteSource(label, eng.liveFeed[pos.symbol]),
        }),
        quoteLabel: label,
        sleeve: pos.sleeve,
        ...extra,
      };
      eng.fills = [fill, ...eng.fills].slice(0, 400);
      eng.dailyPnl += pnl;
      eng.cooldownUntil[pos.symbol] = now + prof.COOLDOWN_SEC * 1000;
      const holdSec = (now - pos.entryTs) / 1000;
      const fwdRet = netFwdRet(pos.entryPrice, px, pos.side);
      const timedOut = intent.reason === "time_stop";
      const tb = tripleBarrier({
        side: pos.side,
        entry: pos.entryMid ?? pos.entryPrice,
        high: pos.highSinceEntry,
        low: pos.lowSinceEntry || mid,
        stopPct: pos.stopPct,
        tpR: prof.TP_R,
        timedOut,
        netRet: fwdRet,
      });
      eng.samples += 1;
      bumpClose(eng, intent.reason);
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
      still.push({
        ...pos,
        highSinceEntry: Math.max(pos.highSinceEntry, mid),
        lowSinceEntry: Math.min(pos.lowSinceEntry || mid, mid),
      });
    }
  }
  positions = still;
  eng.positions = positions;

  const scan: ScanRow[] = [];
  const art = getArtefact();

  async function openSleeve(sleeve: DeskSleeve, watch: string[], profile: SleeveProfile) {
    const mine = positions.filter((p) => (p.sleeve ?? "farm") === sleeve);
    const heat = mine.reduce((a, p) => a + p.sizePct, 0);
    const ranked = watch.map((sym) => {
      const liveLast = eng.live[sym];
      if (!(liveLast > 0)) return null;
      if (positions.some((p) => p.symbol === sym)) return null;
      if (eng.blockedMap[sym]) return null;
      if (eng.pending.some((p) => p.symbol === sym)) return null;
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
          killed: eng.mode === "advisory" ? false : eng.killed,
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
      const long = row.intent.action === "BUY";
      const short = row.intent.action === "SELL" && row.intent.reason === "fade_short";
      let action: string = row.intent.action;
      if (eng.mode === "advisory") {
        if (long) action = "Would BUY";
        else if (short) action = "Would SELL";
      } else if (eng.mode === "paper" && (long || short)) {
        action = long ? "Pending BUY" : "Pending SELL";
      }
      scan.push({
        symbol: `${sleeve}:${row.sym}`,
        action,
        reason: englishReason(row.intent.reason, { sleeve }),
        metaProb: row.intent.metaProb,
        px: row.px,
      });
    }

    if (eng.mode === "advisory") return;

    ranked.sort((a, b) => Math.abs(b.intent.metaProb - 0.5) - Math.abs(a.intent.metaProb - 0.5));
    let runningHeat = heat;
    let nOpen = mine.length;
    for (const row of ranked) {
      if (nOpen >= profile.MAX_POS) break;
      const mid = eng.live[row.sym];
      if (!(mid > 0)) continue;
      if (!clock.openSession && isNseHoursOnly(row.sym, eng.liveFeed[row.sym])) continue;
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
      const spec: OpenSpec = {
        symbol: row.sym,
        side,
        qty,
        sizePct,
        px,
        mid,
        reason: long ? row.intent.reason : "fade_short",
        sleeve,
        metaProb: row.intent.metaProb,
        stopPct: long ? row.intent.stopPct : 0.012,
        score: row.score,
        confidence: row.f.confidence,
        confluence: row.f.confluence,
        pSuccess: row.f.p_success,
        atrPct: row.f.atr_pct,
        features: row.f,
        expiry: extra.expiry,
        strike: extra.strike,
        right: extra.right,
        quoteLabel: label,
      };
      if (eng.mode === "paper") {
        eng.pending.push({
          ...spec,
          id: `${now}-${row.sym}-${sleeve}`,
          ts: now,
          expiresAt: now + PENDING_MS,
          timeout: "auto-skip",
        });
        runningHeat += sizePct;
        nOpen += 1;
        continue;
      }
      openFromSpec(eng, spec, now);
      positions = [...eng.positions];
      runningHeat += sizePct;
      nOpen += 1;
    }
  }

  if (!eng.killed || eng.mode === "advisory") {
    await openSleeve("farm", farmWatch(eng.live, eng.liveFeed, clock.openSession), FARM_PROFILE);
    await openSleeve("pnl", pnlWatch(eng.live, eng.liveFeed, clock.openSession), PNL_PROFILE);
    if (
      !eng.killed &&
      (eng.mode === "auto" || eng.mode === "paper") &&
      (eng.samples - eng.lastRetrainN >= 50 || (art.source === "synth" && now - eng.lastRetrainAt > 60_000))
    ) {
      const next = await retrainFromJsonl();
      if (next) {
        eng.lastRetrainAt = now;
        eng.lastRetrainN = eng.samples;
      }
    }
  }

  eng.heat = heatOf(eng.positions);
  if (!freezeScan) eng.scan = scan;
  eng.lastDecision = lastDecisionOf(eng);
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
    ensureEngineExtras(g.__meridianPaper.eng);
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
  ensureEngineExtras(eng);
  eng.liveFeed ??= {};
  eng.delayed ??= {};
  eng.foMeta ??= {};
  eng.vol ??= {};
  eng.tape ??= {};
  eng.pcr ??= 0.92;
  eng.lastRetrainAt ??= 0;
  eng.lastRetrainN ??= 0;
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
  ensureEngineExtras(e);
  const art = getArtefact();
  e.blocked = Object.keys(e.blockedMap).filter((k) => e.blockedMap[k]);
  e.heat = heatOf(e.positions);
  e.lastDecision = lastDecisionOf(e);
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
    pausedAt: e.killed ? (e.pausedAt ?? e.lastTick) : null,
    pending: e.pending,
    blocked: e.blocked,
    watched: e.watched,
    lastDecision: e.lastDecision,
    heat: e.heat,
    closeStats: e.closeStats,
    queuedHedge: e.queuedHedge,
    meta: {
      n: art.n,
      auc: art.auc,
      hitRate: art.hitRate,
      promoted: art.promoted,
      source: art.source,
      fittedAt: art.fittedAt,
    },
  };
}

export function setEngineFlags(patch: { mode?: PaperBook["mode"]; killed?: boolean }) {
  const e = getEngine();
  if (patch.mode) e.mode = patch.mode;
  if (patch.killed != null) {
    e.killed = patch.killed;
    e.pausedAt = patch.killed ? Date.now() : null;
  }
  return snapshotBook();
}

export function flattenEngine() {
  const e = getEngine();
  const now = Date.now();
  const still: Position[] = [];
  for (const pos of e.positions) {
    const mid = e.live[pos.symbol] || e.ticks[pos.symbol] || pos.entryPrice;
    const closeSide: Fill["side"] = pos.side === "short" ? "BUY" : "SELL";
    const label = quoteLabelOf(e.liveFeed[pos.symbol], e.delayed[pos.symbol]);
    const extra = foFields(pos.symbol, e.foMeta[pos.symbol]);
    const fill: Fill = {
      id: `${now}-${pos.symbol}-flat`,
      ts: now,
      symbol: pos.symbol,
      side: closeSide,
      qty: pos.qty,
      price: mid,
      reason: englishReason("flatten", { sleeve: pos.sleeve, quote: quoteSource(label, e.liveFeed[pos.symbol]) }),
      quoteLabel: label,
      sleeve: pos.sleeve,
      ...extra,
    };
    e.fills = [fill, ...e.fills].slice(0, 400);
    const dir = pos.side === "short" ? -1 : 1;
    e.dailyPnl += (mid - pos.entryPrice) * pos.qty * dir;
    bumpClose(e, "flatten");
  }
  e.positions = still;
  e.pending = [];
  return snapshotBook();
}

export function flattenClip(symbol: string) {
  const e = getEngine();
  const pos = e.positions.find((p) => p.symbol === symbol);
  if (!pos) return snapshotBook();
  const now = Date.now();
  const mid = e.live[pos.symbol] || e.ticks[pos.symbol] || pos.entryPrice;
  const closeSide: Fill["side"] = pos.side === "short" ? "BUY" : "SELL";
  const label = quoteLabelOf(e.liveFeed[pos.symbol], e.delayed[pos.symbol]);
  const extra = foFields(pos.symbol, e.foMeta[pos.symbol]);
  e.fills = [
    {
      id: `${now}-${pos.symbol}-flat1`,
      ts: now,
      symbol: pos.symbol,
      side: closeSide,
      qty: pos.qty,
      price: mid,
      reason: englishReason("flatten", { sleeve: pos.sleeve, quote: quoteSource(label, e.liveFeed[pos.symbol]) }),
      quoteLabel: label,
      sleeve: pos.sleeve,
      ...extra,
    },
    ...e.fills,
  ].slice(0, 400);
  const dir = pos.side === "short" ? -1 : 1;
  e.dailyPnl += (mid - pos.entryPrice) * pos.qty * dir;
  e.positions = e.positions.filter((p) => p !== pos);
  bumpClose(e, "flatten");
  return snapshotBook();
}

export function approvePending(id: string, sizePct?: number) {
  const e = getEngine();
  const p = e.pending.find((x) => x.id === id);
  if (!p) return snapshotBook();
  if (sizePct && sizePct > 0) {
    p.sizePct = sizePct;
    p.qty = qtyFor(p.symbol, p.px, sizePct, e.ticks);
  }
  e.pending = e.pending.filter((x) => x.id !== id);
  openFromSpec(e, p, Date.now());
  return snapshotBook();
}

export function skipPending(id: string) {
  const e = getEngine();
  e.pending = e.pending.filter((x) => x.id !== id);
  return snapshotBook();
}

export function setBlocked(symbol: string, blocked: boolean) {
  const e = getEngine();
  const sym = symbol.toUpperCase();
  e.blockedMap[sym] = blocked;
  if (!blocked) delete e.blockedMap[sym];
  e.blocked = Object.keys(e.blockedMap).filter((k) => e.blockedMap[k]);
  if (blocked) e.pending = e.pending.filter((p) => p.symbol !== sym);
  return snapshotBook();
}

export function setWatched(symbol: string, watch: boolean) {
  const e = getEngine();
  const sym = symbol.toUpperCase();
  const set = new Set(e.watched);
  if (watch) set.add(sym);
  else set.delete(sym);
  e.watched = [...set];
  return snapshotBook();
}

export function queueHedge(symbol: string, note: string, from = "greeks") {
  const e = getEngine();
  const sym = symbol.toUpperCase();
  e.watched = [...new Set([...e.watched, sym])];
  e.queuedHedge = { symbol: sym, note, ts: Date.now(), from };
  return snapshotBook();
}

export function dismissHedge() {
  const e = getEngine();
  e.queuedHedge = null;
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
    hold_class: "time-stop" | "quality" | "other";
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
      hold_class:
        r.reason_close === "time_stop"
          ? ("time-stop" as const)
          : r.reason_close === "stop" || r.reason_close === "take_profit"
            ? ("quality" as const)
            : ("other" as const),
    };
  });
}
