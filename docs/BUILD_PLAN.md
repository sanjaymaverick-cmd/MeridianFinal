# Meridian Final — Build Master Spec

**Last updated:** 23 Aug 2026  
**Canonical repo:** [sanjaymaverick-cmd/MeridianFinal](https://github.com/sanjaymaverick-cmd/MeridianFinal)  
**Canonical product:** Meridian Final = V2 Greeks + V3 auto desk + V4 meta-label, one paper desk  
**Lineage:** [LINEAGE.md](LINEAGE.md) — V1 advisor → V2 Greeks → V3 auto desk → V4 OpenAlgo / meta-label → **this repo**  
**Isolation:** V3 and V4 stay frozen. Final copies math, never patches those trees. Do not use the MeridianV4 GitHub repo as a working tree.

---

## Goal

One personal Indian-equity desk with four jobs:

1. **Full auto (paper first)** — V4 decision engine (meta-prob, heat, daily loss, min-hold 300s, 1.5R / trail) plus V3 gamma-scalp rehedge reviews. Live Kite stays **disarmed** until an explicit arm on a static-IP box.
2. **Existing book** — CSV / paste of Zerodha-style holdings → Buy / Hold / Sell + five-factor score + meta-prob + predictability.
3. **NL research** — “find companies that supply spares to AI data centers” → ranked NSE shortlist (Grok when signed in).
4. **Market advice** — regime from VIX / tape → Spot / Futures / Options cards. Always “(not an order)”.

Premium **Kite Connect** is the intended live broker. This app is the intelligence + paper layer. OpenAlgo remains the optional strategy host from V4.

---

## Locked decisions

| Area | Choice |
|------|--------|
| Markets | India cash + F&O first. Crypto/Delta later, same as V4. |
| Meta-label | Synth scaffold until paper fills fit a logistic. Promote PnL only if n≥2000 and test AUC>0.5. Do not promote on synth-only AUC. |
| Holds | Farm: 90s vertical barrier for labels. PnL: no time-stop — hard stop, 2.2R, trail. Python `meridian_final/` is a frozen port. |
| Greeks | Daily PnL = theta. Gamma scalp = ½ Γ (ΔS)². Long gamma harvests; short gamma hurts. |
| Execution | Paper in the desk. Kite live only after static IP + `LIVE_OK`. |
| Capital | Shared paper book **₹10,00,000**. Farm: max 16 small clips. PnL: max 4, quarter-Kelly, only when meta is promoted. Live cap stays smaller (V4 `LIVE_BUDGET` 25k) when armed. |
| V3/V4 files | Read-only. Ports live under `meridian_final/` (Python) and this desk (TypeScript). The running Auto loop is TypeScript. |

---

## Architecture

```
Research (NL query + universe + Grok)
        ↓ artefacts / shortlists
Scoring (V1 five-factor) + Meta (V4 logistic)
        ↓
Decision engine (gates, size, manage)
        ↓
Greeks book / gamma scalp (reviews, optional futures hedge)
        ↓
OMS: paper (this desk)  →  Kite / OpenAlgo (later, armed)
```

---

## Phases

| Phase | Status | Notes |
|-------|--------|-------|
| F0 Spec + repo | Done | this file, GitHub `MeridianFinal` |
| F1 Book analyzer | Done | CSV parse + B/H/S + predictability |
| F2 Greeks / gamma | Done | Long/short gamma path, rehedge band |
| F3 Auto paper | Done | Watchlist + decide/manage loop. Desk now on PnL profile + F&O watch (perps/ATM options). |
| F4 NL research | Done | Grok + heuristic fallback |
| F5 Market advice | Done | Regime cards |
| F6 Kite live | Gated | Premium key on your box, static IP, Analyzer/paper first |
| F7 Retrain / promote | Done | Fit logistic on `paper-samples.jsonl` (time split). PnL sleeve arms only if n≥2000 and test AUC>0.5. |

---

## Kite (premium)

Personal/free Kite cannot poll quotes. Paid Connect can. Orders still need a **whitelisted static IP**. Never commit API keys. See V4 `docs/ZERODHA_KITE_API.md`.

---

## What never reaches the browser as an order

Kelly internals, logistic coefficients (shown only as finished `meta_prob`), per-leg construction beyond net Δ Γ ν Θ, broker secrets. Review cards always include “not an order”.
