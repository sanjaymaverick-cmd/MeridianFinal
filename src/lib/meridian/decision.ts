/**
 * Meridian Final decision engine.
 *
 * Two sleeves share one ₹10L paper book:
 *  - farm: many small clips, vertical barrier (time-stop) → training labels
 *  - pnl:  4 names, Kelly size, no time-stop — only when paper meta is promoted
 */

import { predictMetaProb } from "./artefact";
import { kellySizePct } from "./kelly";
import { clamp } from "../utils";

export type DeskSleeve = "farm" | "pnl";

export const STOP_ATR_MULT = 1.5;
export const EOD_FLATTEN_MIN = 15;
export const MAX_MINUTES_TO_EOD = 30;
export const MAX_POS_LIVE = 2;
export const MAX_SIZE_LIVE = 0.1;
export const PAPER_BUDGET = 1_000_000;
export const PNL_CRYPTO = ["BTC", "ETH", "SOL"] as const;

export type SleeveProfile = {
  MIN_META_PROB: number;
  MAX_HEAT: number;
  MIN_HOLD_SEC: number;
  TIME_STOP_SEC: number;
  MAX_SIZE: number;
  TP_R: number;
  TRAIL_ARM_R: number;
  TRAIL_GIVEBACK_R: number;
  STOP_PCT_MIN: number;
  STOP_PCT_MAX: number;
  COOLDOWN_SEC: number;
  DAILY_LOSS_LIMIT: number;
  MAX_POS: number;
  SIZE_FLOOR: number;
  SIZE_CEIL: number;
  kelly: boolean;
};

export const FARM_PROFILE: SleeveProfile = {
  MIN_META_PROB: 0.5,
  MAX_HEAT: 0.5,
  MIN_HOLD_SEC: 25,
  TIME_STOP_SEC: 90,
  MAX_SIZE: 0.05,
  TP_R: 0.55,
  TRAIL_ARM_R: 0.35,
  TRAIL_GIVEBACK_R: 0.1,
  STOP_PCT_MIN: 0.006,
  STOP_PCT_MAX: 0.035,
  COOLDOWN_SEC: 90,
  DAILY_LOSS_LIMIT: -80_000,
  MAX_POS: 16,
  SIZE_FLOOR: 0.02,
  SIZE_CEIL: 0.04,
  kelly: false,
};

export const PNL_PROFILE: SleeveProfile = {
  MIN_META_PROB: 0.58,
  MAX_HEAT: 0.4,
  MIN_HOLD_SEC: 120,
  TIME_STOP_SEC: 0,
  MAX_SIZE: 0.08,
  TP_R: 2.2,
  TRAIL_ARM_R: 1.0,
  TRAIL_GIVEBACK_R: 0.4,
  STOP_PCT_MIN: 0.01,
  STOP_PCT_MAX: 0.045,
  COOLDOWN_SEC: 180,
  DAILY_LOSS_LIMIT: -100_000,
  MAX_POS: 4,
  SIZE_FLOOR: 0.02,
  SIZE_CEIL: 0.08,
  kelly: true,
};

/** UI / farm defaults (shared book). */
export const DESK_PROFILE = "farm" as const;
export const MIN_META_PROB = FARM_PROFILE.MIN_META_PROB;
export const MAX_HEAT = FARM_PROFILE.MAX_HEAT + PNL_PROFILE.MAX_HEAT;
export const MIN_HOLD_SEC = FARM_PROFILE.MIN_HOLD_SEC;
export const TIME_STOP_SEC = FARM_PROFILE.TIME_STOP_SEC;
export const MAX_SIZE = PNL_PROFILE.MAX_SIZE;
export const TP_R = PNL_PROFILE.TP_R;
export const TRAIL_ARM_R = PNL_PROFILE.TRAIL_ARM_R;
export const TRAIL_GIVEBACK_R = PNL_PROFILE.TRAIL_GIVEBACK_R;
export const STOP_PCT_MIN = FARM_PROFILE.STOP_PCT_MIN;
export const STOP_PCT_MAX = PNL_PROFILE.STOP_PCT_MAX;
export const COOLDOWN_SEC = FARM_PROFILE.COOLDOWN_SEC;
export const DAILY_LOSS_LIMIT = PNL_PROFILE.DAILY_LOSS_LIMIT;
export const MAX_POS_PAPER = FARM_PROFILE.MAX_POS + PNL_PROFILE.MAX_POS;
export const SIZE_FLOOR = FARM_PROFILE.SIZE_FLOOR;
export const SIZE_CEIL = FARM_PROFILE.SIZE_CEIL;
export const SHORT_META_HIGH = 1 - FARM_PROFILE.MIN_META_PROB;
export const SHORT_META_LOW = 0.32;

export type TradeAction = "BUY" | "SELL" | "HOLD" | "FLAT";

export type RiskState = {
  dailyPnl: number;
  killed: boolean;
  live: boolean;
  nOpen: number;
  cooldownUntil: Record<string, number>;
  promoted?: boolean;
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
  expiry?: string;
  strike?: number;
  right?: string;
  quoteLabel?: "live" | "delayed" | "model";
  sleeve?: DeskSleeve;
  entryMid?: number;
  costBps?: number;
  features?: Record<string, number>;
};

function finite(x: unknown, d = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : d;
}

function markEntry(pos: Position) {
  return pos.entryMid && pos.entryMid > 0 ? pos.entryMid : pos.entryPrice;
}

function rMultiple(pos: Position, px: number) {
  const entry = markEntry(pos);
  if (entry <= 0 || pos.stopPct <= 0) return 0;
  const dir = pos.side === "short" ? -1 : 1;
  return ((px / entry - 1) * dir) / pos.stopPct;
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
    minutes_since_midnight: finite(sig.minutesSinceMidnight, 550),
    minutes_to_eod_flatten: finite(sig.minutesToEod, 32),
  });
  return clamp(0.2 * art + 0.8 * finite(sig.pSuccess, 0.55), 0, 1);
}

function sizeFromEdge(edge: number, heat: number, sizeCap: number) {
  const raw = Math.abs(edge) * 2.4 * (1 - heat * 0.85);
  return clamp(raw, 0, sizeCap);
}

export function decide(
  sig: Signal,
  risk: RiskState,
  now = Date.now(),
  profile: SleeveProfile = FARM_PROFILE,
): Intent {
  const p = scoreSignal(sig);
  if (risk.killed) return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "kill_switch", metaProb: p };
  if (profile.kelly && !risk.promoted)
    return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "not_promoted", metaProb: p };
  if (risk.dailyPnl <= profile.DAILY_LOSS_LIMIT)
    return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "daily_loss", metaProb: p };
  const until = risk.cooldownUntil[sig.symbol];
  if (until && now < until) return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "cooldown", metaProb: p };
  const cap = risk.live ? MAX_POS_LIVE : profile.MAX_POS;
  if (risk.nOpen >= cap) return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "max_positions", metaProb: p };
  if (finite(sig.minutesToEod, 999) < MAX_MINUTES_TO_EOD)
    return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "too_close_to_eod", metaProb: p };
  if (finite(sig.portfolioHeat) >= profile.MAX_HEAT)
    return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "heat_limit", metaProb: p };

  let atr = finite(sig.atrPct);
  if (atr <= 0) atr = profile.STOP_PCT_MIN / STOP_ATR_MULT;
  const stop = clamp(STOP_ATR_MULT * atr, profile.STOP_PCT_MIN, profile.STOP_PCT_MAX);
  const sizeCap = risk.live ? MAX_SIZE_LIVE : profile.MAX_SIZE;
  const heat = clamp(finite(sig.portfolioHeat), 0, 1);
  const shortHigh = 1 - profile.MIN_META_PROB;

  if (p >= profile.MIN_META_PROB) {
    const edge = p - 0.5;
    const size = profile.kelly ? kellySizePct(p, stop, sizeCap) : sizeFromEdge(edge, heat, sizeCap);
    if (size <= 0) return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "zero_size", metaProb: p };
    return { action: "BUY", sizePct: size, stopPct: stop, reason: "passed_gates", metaProb: p };
  }

  if (!profile.kelly && p <= shortHigh && p >= SHORT_META_LOW) {
    const edge = 0.5 - p;
    const size = sizeFromEdge(edge, heat, sizeCap * 0.85);
    if (size <= 0) return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "zero_size", metaProb: p };
    return { action: "SELL", sizePct: size, stopPct: stop, reason: "fade_short", metaProb: p };
  }

  return { action: "FLAT", sizePct: 0, stopPct: 0, reason: "low_meta_prob", metaProb: p };
}

export function manage(
  pos: Position,
  lastPrice: number,
  now: number,
  minutesToEod: number,
  profile: SleeveProfile = FARM_PROFILE,
): Intent {
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
  if (held < profile.MIN_HOLD_SEC)
    return { action: "HOLD", sizePct: pos.sizePct, stopPct: pos.stopPct, reason: "min_hold", metaProb: pos.metaProb };
  if (profile.TIME_STOP_SEC > 0 && held >= profile.TIME_STOP_SEC)
    return { action: "SELL", sizePct: 0, stopPct: pos.stopPct, reason: "time_stop", metaProb: pos.metaProb };
  if (r >= profile.TP_R)
    return { action: "SELL", sizePct: 0, stopPct: pos.stopPct, reason: "take_profit", metaProb: pos.metaProb };
  if (highR >= profile.TRAIL_ARM_R && r <= profile.TRAIL_GIVEBACK_R)
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
  const minutesSinceMidnight = minutes;
  const minutesToEod = openSession ? minutesToEodReal : 240;
  return { minutesSinceMidnight, minutesToEod, openSession, ist };
}

export function profileOf(sleeve: DeskSleeve | undefined): SleeveProfile {
  return sleeve === "pnl" ? PNL_PROFILE : FARM_PROFILE;
}
