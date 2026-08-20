"""Discrete hedge-and-rehedge loop. Never sends an order."""

from __future__ import annotations

from dataclasses import dataclass
from meridian_final.greeks import GreekSnapshot


def _snap_lots(x: float, step: float = 1.0) -> float:
    if step <= 0:
        return x
    return round(x / step) * step


@dataclass(frozen=True)
class GammaScalpReport:
    posture: str
    needs_rehedge: bool
    suggested_futures_lots: float
    daily_theta: float
    scalp_pnl_on_move: float
    suggestion: str


def explain_scalp(snap: GreekSnapshot, rehedge_band_lots: float = 1.0) -> GammaScalpReport:
    needs = abs(snap.delta_lots) >= rehedge_band_lots - 1e-12
    futures_now = _snap_lots(-snap.delta_lots)
    if snap.long_gamma:
        suggestion = (
            f"Review a futures clip of {futures_now:+.1f} lots to flatten leftover delta."
            if needs
            else "Leftover direction is inside the band. Keep watching. Gamma is helping."
        )
    elif snap.short_gamma:
        suggestion = "Not a harvest. Review cutting short gamma. Not an order."
    else:
        suggestion = "Gamma is flat. Nothing to scalp."
    return GammaScalpReport(
        posture=snap.gamma_sign,
        needs_rehedge=needs,
        suggested_futures_lots=futures_now if needs else 0.0,
        daily_theta=snap.daily_pnl,
        scalp_pnl_on_move=snap.gamma_scalp_pnl,
        suggestion=suggestion,
    )
