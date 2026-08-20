"""V1 five-factor composite (from meridian_v3/scoring/composite.py)."""

FACTORS = ("quality", "valuation", "technical", "ownership", "sentiment")

DEFAULT_WEIGHTS = {
    "Calm": {"quality": 0.28, "valuation": 0.22, "technical": 0.18, "ownership": 0.18, "sentiment": 0.14},
    "Elevated": {"quality": 0.26, "valuation": 0.16, "technical": 0.22, "ownership": 0.22, "sentiment": 0.14},
    "Stress": {"quality": 0.24, "valuation": 0.10, "technical": 0.26, "ownership": 0.26, "sentiment": 0.14},
}

DEFAULT_GATES = {
    "Calm": {"strong_buy": 8.0, "buy": 6.8, "hold": 5.0, "reduce": 3.8},
    "Elevated": {"strong_buy": 8.3, "buy": 7.1, "hold": 5.2, "reduce": 4.0},
    "Stress": {"strong_buy": 8.6, "buy": 7.4, "hold": 5.5, "reduce": 4.2},
}


def composite_score(parts: dict, regime: str = "Calm") -> float | None:
    weights = DEFAULT_WEIGHTS.get(regime, DEFAULT_WEIGHTS["Calm"])
    total = mass = 0.0
    for factor, weight in weights.items():
        value = parts.get(factor)
        if value is None:
            continue
        total += float(value) * weight
        mass += weight
    if mass == 0:
        return None
    return round(total / mass, 2)


def map_action(score: float | None, regime: str = "Calm") -> str:
    if score is None:
        return "—"
    gates = DEFAULT_GATES.get(regime, DEFAULT_GATES["Calm"])
    if score >= gates["strong_buy"]:
        return "Strong Buy"
    if score >= gates["buy"]:
        return "Buy"
    if score >= gates["hold"]:
        return "Hold"
    if score >= gates["reduce"]:
        return "Reduce"
    return "Sell"
