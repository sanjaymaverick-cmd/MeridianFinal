"""V4 decide/manage (longer-hold)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

MIN_META_PROB = 0.55
MAX_HEAT = 0.35
MIN_HOLD_SEC = 300
MAX_SIZE = 0.25
TP_R = 1.5
TRAIL_ARM_R = 1.0
TRAIL_GIVEBACK_R = 0.4
STOP_ATR_MULT = 1.5
STOP_PCT_MIN, STOP_PCT_MAX = 0.008, 0.04
DAILY_LOSS_LIMIT = -5000.0
MAX_POS_PAPER = 3


@dataclass
class RiskState:
    daily_pnl: float = 0.0
    killed: bool = False
    n_open: int = 0
    cooldown_until: dict = field(default_factory=dict)


@dataclass
class Intent:
    action: str
    size_pct: float
    stop_pct: float
    reason: str
    meta_prob: float = 0.0


def _clip(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else hi if x > hi else x


def decide(meta_prob: float, atr_pct: float, heat: float, risk: RiskState) -> Intent:
    if risk.killed:
        return Intent("FLAT", 0.0, 0.0, "kill_switch", meta_prob)
    if risk.daily_pnl <= DAILY_LOSS_LIMIT:
        return Intent("FLAT", 0.0, 0.0, "daily_loss", meta_prob)
    if risk.n_open >= MAX_POS_PAPER:
        return Intent("FLAT", 0.0, 0.0, "max_positions", meta_prob)
    if heat >= MAX_HEAT:
        return Intent("FLAT", 0.0, 0.0, "heat_limit", meta_prob)
    if meta_prob < MIN_META_PROB:
        return Intent("FLAT", 0.0, 0.0, "low_meta_prob", meta_prob)
    size = _clip((meta_prob - 0.5) * 1.5 * (1.0 - heat), 0.0, MAX_SIZE)
    if size <= 0:
        return Intent("FLAT", 0.0, 0.0, "zero_size", meta_prob)
    stop = _clip(STOP_ATR_MULT * max(atr_pct, STOP_PCT_MIN / STOP_ATR_MULT), STOP_PCT_MIN, STOP_PCT_MAX)
    return Intent("BUY", size, stop, "passed_gates", meta_prob)


def manage(*, entry_price: float, last: float, stop_pct: float, entry_ts: datetime, now: datetime, high: float) -> Intent:
    r = ((last / entry_price) - 1.0) / stop_pct if entry_price and stop_pct else 0.0
    high_r = ((high / entry_price) - 1.0) / stop_pct if entry_price and stop_pct else 0.0
    held = (now - entry_ts).total_seconds()
    if r <= -1.0:
        return Intent("SELL", 0.0, stop_pct, "hard_stop")
    if held < MIN_HOLD_SEC:
        return Intent("HOLD", 0.0, stop_pct, "min_hold")
    if r >= TP_R:
        return Intent("SELL", 0.0, stop_pct, "take_profit")
    if high_r >= TRAIL_ARM_R and r <= TRAIL_GIVEBACK_R:
        return Intent("SELL", 0.0, stop_pct, "trail")
    return Intent("HOLD", 0.0, stop_pct, "hold_quality")
