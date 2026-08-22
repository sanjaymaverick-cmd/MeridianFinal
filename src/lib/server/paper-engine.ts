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
  type Position,
} from "@/lib/meridian/decision";
import { getLiveBook, refreshBinanceAnchors } from "@/lib/server/quotes";
import type { UniverseName } from "@/lib/meridian/universe";

type Fill = {
  id: string;
  ts: number;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  reason: string;
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

function activeWatch(cryptoSymbols: string[]) {
  const { openSession } = sessionClock();
  const crypto = cryptoSymbols.length ? cryptoSymbols : ["BTC", "ETH", "SOL"];
  return openSession ? [...crypto, ...CASH_WATCH] : crypto;
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
};

const g = globalThis as typeof globalThis & {
  __meridianPaper?: { timer: ReturnType<typeof setInterval>; eng: Engine; rev: number };
};
const ENGINE_REV = 6;

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
  };
}

function qtyFor(sym: string, px: number, sizePct: number, ticks: Record<string, number>) {
  const u = UNIVERSE.find((x) => x.symbol === sym);
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

async function tick() {
  const slot = g.__meridianPaper;
  if (!slot) return;
  const eng = slot.eng;
  eng.ticksRun += 1;
  eng.lastTick = Date.now();

  try {
    const live: Record<string, number> = {};
    const bn = await refreshBinanceAnchors();
    Object.assign(live, bn);
    const clockNow = sessionClock();
    if (clockNow.openSession) {
      const book = await getLiveBook();
      for (const [sym, q] of Object.entries(book.quotes)) {
        if (q.last > 0 && q.source !== "snapshot" && q.source !== "empty") live[sym] = q.last;
      }
    }
    if (live.BTC) live.BTCPERP = live.BTC;
    if (live.ETH) live.ETHPERP = live.ETH;
    eng.live = live;
    for (const [sym, last] of Object.entries(live)) {
      eng.ticks[sym] = last;
      eng.anchors[sym] = last;
    }
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
    const crypto = u?.assetClass === "crypto" || pos.symbol.endsWith("PERP") || (!u && livePx > 0);
    const night = !clock.openSession;
    if (!(livePx > 0) && !(night && !crypto)) {
      still.push(pos);
      continue;
    }
    const px = livePx > 0 ? livePx : (eng.ticks[pos.symbol] ?? pos.entryPrice);
    const intent =
      night && !crypto
        ? { action: "SELL" as const, sizePct: 0, stopPct: pos.stopPct, reason: "night_crypto_only", metaProb: pos.metaProb }
        : manage({ ...pos }, px, now, crypto ? 999 : clock.minutesToEod);
    if (intent.action === "SELL") {
      const pnl = pnlOf(pos, px);
      const closeSide = pos.side === "short" ? "BUY" : "SELL";
      const fill: Fill = {
        id: `${now}-${pos.symbol}-x-${Math.random().toString(16).slice(2, 8)}`,
        ts: now,
        symbol: pos.symbol,
        side: closeSide,
        qty: pos.qty,
        price: px,
        reason: `${intent.reason}:${pos.side}:live`,
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

  if (eng.mode === "auto" && !eng.killed) {
    const ranked = activeWatch(Object.keys(eng.live)).map((sym) => {
      const liveLast = eng.live[sym];
      if (!(liveLast > 0)) return null;
      const u = cryptoStub(sym, liveLast);
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
      const short = row.intent.action === "FLAT" && row.intent.metaProb <= 0.49 && row.intent.reason === "low_meta_prob";
      if (!long && !short) continue;
      const side: "long" | "short" = long ? "long" : "short";
      const sizePct = Math.min(0.05, Math.max(0.025, long ? row.intent.sizePct : 0.03));
      if (runningHeat + sizePct > 0.8) continue;
      const qty = qtyFor(row.sym, px, sizePct, eng.ticks);
      if (qty <= 0) continue;
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
        reason: `${pos.reasonOpen}:live`,
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
          source: "binance-live",
          watch: Object.keys(eng.live).length,
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
    g.__meridianPaper.eng.mode = "auto";
    g.__meridianPaper.eng.killed = false;
    return;
  }
  if (g.__meridianPaper) clearInterval(g.__meridianPaper.timer);
  const eng = g.__meridianPaper?.eng ?? emptyEngine();
  eng.mode = "auto";
  eng.killed = false;
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
  return sql`
    select id, ts_open, ts_close, symbol, side, qty, entry, exit, pnl, hold_sec, fwd_ret,
           reason_open, reason_close, meta_prob, score
    from paper_samples
    order by ts_close desc
    limit ${limit}
  `;
}
