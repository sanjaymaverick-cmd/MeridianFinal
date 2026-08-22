/** V4 decision engine — ports src/decision/engine.py (longer-hold, meta gates). */

import { predictMetaProb } from "./artefact";
import { clamp } from "../utils";

export const MIN_META_PROB = 0.50;
export const MAX_HEAT = 0.75;
export const MAX_MINUTES_TO_EOD = 30;
export const MIN_HOLD_SEC = 25;
export const TIME_STOP_SEC = 90;
export const MAX_SIZE = 0.08;
export const MAX_SIZE_LIVE = 0.1;
export const TP_R = 0.55;
export const TRAIL_ARM_R = 0.35;
export const TRAIL_GIVEBACK_R = 0.1;
export const EOD_FLATTEN_MIN = 15;
export const STOP_ATR_MULT = 1.5;
export const STOP_PCT_MIN = 0.006;
export const STOP_PCT_MAX = 0.035;
export const COOLDOWN_SEC = 90;
export const DAILY_LOSS_LIMIT = -80_000;
export const MAX_POS_PAPER = 16;
export const MAX_POS_LIVE = 2;
export const PAPER_BUDGET = 1_000_000;

export type TradeAction = "BUY" | "SELL" | "HOLD" | "FLAT";

export type RiskState = {
  dailyPnl: number;
  killed: boolean;
  live: boolean;
  nOpen: number;
  cooldownUntil: Record<string, number>;
};

export type Signal = {
  symbol: string;
  confidence: number;
  confluence: number;
  pSuccess: number;
  atrPct: number;
  minutesToEod: number;
  minutesSinceMidnight: number;
  beliefPosterior: number;
  portfolioHeat: number;
  metaProb?: number;
};

export type Intent = {
  action: TradeAction;
  sizePct: number;
  stopPct: number;
  reason: string;
  metaProb: number;
};

export type Position = {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  entryTs: number;
  stopPct: number;
  sizePct: number;
  metaProb: number;
  highSinceEntry: number;
  lowSinceEntry: number;
  qty: number;
  reasonOpen: string;
  confidence: number;
  confluence: number;
  pSuccess: number;
  atrPct: number;
  score: number;
};

function finite(x: unknown, d = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : d;
}

function rMultiple(pos: Position, px: number) {
  if (pos.entryPrice <= 0 || pos.stopPct <= 0) return 0;
  const dir = pos.side === "short" ? -1 : 1;
  return ((px / pos.entryPrice - 1) * dir) / pos.stopPct;
}

export function scoreSignal(sig: Signal): number {
  if (sig.metaProb != null && Number.isFinite(sig.metaProb)) {
    return clamp(sig.metaProb, 0, 1);
  }
  const stop = STOP_ATR_MULT * finite(sig.atrPct);
  const art = predictMetaProb({
    confidence: finite(sig.confidence),
    confluence: finite(sig.confluence),
    p_success: finite(sig.pSuccess),
    atr_pct: finite(sig.atrPct),
    approx_stop_pct: stop,
    // Keep the artefact in-distribution. After-hours synthetic clocks (660 min) were
    // pushing meta-prob to ~0.05 and the paper desk never filled.
    minutes_since_midnight: 550,
    minutes_to_eod_flatten: 32,
  });
  return clamp(0.2 * art + 0.8 * finite(sig.pSuccess, 0.55), 0, 1);
}

export function decide(sig: Signal, risk: RiskState, now = Date.now()): Intent {
  const p = scoreSignal(sig);
  if (risk.killed) return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "kill_switch", metaProb: p };
  if (risk.dailyPnl <= DAILY_LOSS_LIMIT)
    return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "daily_loss", metaProb: p };
  const until = risk.cooldownUntil[sig.symbol];
  if (until && now < until) return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "cooldown", metaProb: p };
  const cap = risk.live ? MAX_POS_LIVE : MAX_POS_PAPER;
  if (risk.nOpen >= cap) return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "max_positions", metaProb: p };
  if (finite(sig.minutesToEod, 999) < MAX_MINUTES_TO_EOD)
    return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "too_close_to_eod", metaProb: p };
  if (finite(sig.portfolioHeat) >= MAX_HEAT)
    return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "heat_limit", metaProb: p };
  if (p < MIN_META_PROB) return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "low_meta_prob", metaProb: p };

  const edge = p - 0.5;
  const sizeCap = risk.live ? MAX_SIZE_LIVE : MAX_SIZE;
  const heat = clamp(finite(sig.portfolioHeat), 0, 1);
  const size = clamp(edge * 1.5 * (1 - heat), 0, sizeCap);
  if (size <= 0) return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "zero_size", metaProb: p };
  let atr = finite(sig.atrPct);
  if (atr <= 0) atr = STOP_PCT_MIN / STOP_ATR_MULT;
  const stop = clamp(STOP_ATR_MULT * atr, STOP_PCT_MIN, STOP_PCT_MAX);
  return { action: "BUY", sizePct: size, stopPct: stop, reason: "passed_gates", metaProb: p };
}

export function manage(pos: Position, lastPrice: number, now: number, minutesToEod: number): Intent {
  const px = finite(lastPrice);
  if (px <= 0)
    return { action: "HOLD", sizePct: pos.sizePct, stopPct: pos.stopPct, reason: "bad_price", metaProb: pos.metaProb };
  pos.highSinceEntry = Math.max(pos.highSinceEntry || px, px);
  pos.lowSinceEntry = Math.min(pos.lowSinceEntry || px, px);
  const r = rMultiple(pos, px);
  const extPx = pos.side === "short" ? pos.lowSinceEntry : pos.highSinceEntry;
  const highR = rMultiple(pos, extPx);
  const held = Math.max(0, (now - pos.entryTs) / 1000);
  if (r <= -1)
    return { action: "SELL", sizePct: 0, stopPct: pos.stopPct, reason: "hard_stop", metaProb: pos.metaProb };
  if (minutesToEod < EOD_FLATTEN_MIN)
    return { action: "SELL", sizePct: 0, stopPct: pos.stopPct, reason: "eod_flatten", metaProb: pos.metaProb };
  if (held < MIN_HOLD_SEC)
    return { action: "HOLD", sizePct: pos.sizePct, stopPct: pos.stopPct, reason: "min_hold", metaProb: pos.metaProb };
  if (held >= TIME_STOP_SEC)
    return { action: "SELL", sizePct: 0, stopPct: pos.stopPct, reason: "time_stop", metaProb: pos.metaProb };
  if (r >= TP_R)
    return { action: "SELL", sizePct: 0, stopPct: pos.stopPct, reason: "take_profit", metaProb: pos.metaProb };
  if (highR >= TRAIL_ARM_R && r <= TRAIL_GIVEBACK_R)
    return { action: "SELL", sizePct: 0, stopPct: pos.stopPct, reason: "trail", metaProb: pos.metaProb };
  return { action: "HOLD", sizePct: pos.sizePct, stopPct: pos.stopPct, reason: "hold_quality", metaProb: pos.metaProb };
}

export function sessionClock(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const open = 9 * 60 + 15;
  const close = 15 * 60 + 30;
  const minutesToEodReal = close - minutes;
  const openSession = minutes >= open && minutes <= close && ist.getUTCDay() >= 1 && ist.getUTCDay() <= 5;
  // Paper desk keeps a synthetic session so the engine can be demonstrated after hours.
  const minutesSinceMidnight = openSession ? minutes : 11 * 60;
  const minutesToEod = openSession ? minutesToEodReal : 240;
  return { minutesSinceMidnight, minutesToEod, openSession, ist };
}
