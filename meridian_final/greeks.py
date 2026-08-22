"""Net Greeks. Daily PnL = theta. Gamma scalp = ½ Γ (ΔS)²."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class OptionLeg:
    symbol: str
    lots: float
    multiplier: float
    mark_inr: float
    delta: float
    gamma: float
    vega_per_lot: float
    theta_per_lot: float


@dataclass(frozen=True)
class GreekSnapshot:
    symbol: str
    delta_lots: float
    gamma: float
    vega: float
    theta: float
    mark_inr: float
    multiplier: float
    move_pct: float
    move_inr: float
    daily_pnl: float
    gamma_scalp_pnl: float
    gamma_sign: str

    @property
    def long_gamma(self) -> bool:
        return self.gamma > 1e-12

    @property
    def short_gamma(self) -> bool:
        return self.gamma < -1e-12


def gamma_scalp_pnl(*, gamma: float, move_inr: float, multiplier: float) -> float:
    return 0.5 * gamma * (move_inr**2) * multiplier


def snapshot_from_legs(symbol: str, legs: Sequence[OptionLeg], move_pct: float = 0.01) -> GreekSnapshot:
    use = [leg for leg in legs if leg.symbol == symbol]
    delta = sum(leg.delta * leg.lots for leg in use)
    gamma = sum(leg.gamma * leg.lots for leg in use)
    vega = sum(leg.vega_per_lot * leg.lots for leg in use)
    theta = sum(leg.theta_per_lot * leg.lots for leg in use)
    mark = next((leg.mark_inr for leg in use if leg.mark_inr), 0.0)
    multiplier = next((leg.multiplier for leg in use if leg.multiplier), 1.0)
    move_inr = mark * move_pct
    scalp = gamma_scalp_pnl(gamma=gamma, move_inr=move_inr, multiplier=multiplier)
    if gamma > 1e-12:
        sign = "long"
    elif gamma < -1e-12:
        sign = "short"
    else:
        sign = "flat"
    return GreekSnapshot(
        symbol=symbol,
        delta_lots=delta,
        gamma=gamma,
        vega=vega,
        theta=theta,
        mark_inr=mark,
        multiplier=multiplier,
        move_pct=move_pct,
        move_inr=move_inr,
        daily_pnl=theta,
        gamma_scalp_pnl=scalp,
        gamma_sign=sign,
    )
