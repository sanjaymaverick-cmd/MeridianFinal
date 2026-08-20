# Meridian Final — Build Master Spec

**Last updated:** 20 Aug 2026  
**Repos:** [sanjaymaverick-cmd/MeridianFinal](https://github.com/sanjaymaverick-cmd/MeridianFinal)  
**Lineage:** V1 advisor → V2 Greeks → V3 auto desk → V4 OpenAlgo / meta-label  
**Isolation:** V3 and V4 stay frozen. Final copies math, never patches those trees.

## Goal

One personal Indian-equity desk with four jobs:

1. **Full auto (paper first)** — V4 decision engine (meta-prob, heat, daily loss, min-hold 300s, 1.5R / trail) plus V3 gamma-scalp rehedge reviews. Live Kite stays **disarmed** until an explicit arm on a static-IP box.
2. **Existing book** — CSV / paste of Zerodha-style holdings → Buy / Hold / Sell + five-factor score + meta-prob + predictability.
3. **NL research** — “find companies that supply spares to AI data centers” → ranked NSE shortlist (Grok when signed in).
4. **Market advice** — regime from VIX / tape → Spot / Futures / Options cards. Always “(not an order)”.

Premium **Kite Connect** is the intended live broker. This app is the intelligence + paper layer. OpenAlgo remains the optional strategy host from V4.

## Locked decisions

| Area | Choice |
|------|--------|
| Markets | India cash + F&O first. Crypto/Delta later, same as V4. |
| Meta-label | V4 logistic artefact (synth scaffold) **blended** with primary p_success. Do not promote on synth-only AUC. |
| Holds | Longer-quality: min 300s, hard stop always, no scratch exits. |
| Greeks | Daily PnL = theta. Gamma scalp = ½ Γ (ΔS)². Long gamma harvests; short gamma hurts. |
| Execution | Paper in the desk. Kite live only after static IP + `LIVE_OK`. |
| Capital | Paper budget ₹1,00,000. Live cap stays smaller (V4 `LIVE_BUDGET` 25k) when armed. |
| V3/V4 files | Read-only. Ports live under `meridian_final/` (Python) and the web desk (TypeScript). |

## Phases

| Phase | Status | Notes |
|-------|--------|-------|
| F0 Spec + repo | Done | this file, GitHub `MeridianFinal` |
| F1 Book analyzer | Done | CSV parse + B/H/S + predictability |
| F2 Greeks / gamma | Done | Long/short gamma path, rehedge band |
| F3 Auto paper | Done | Watchlist + decide/manage loop |
| F4 NL research | Done | Grok + heuristic fallback |
| F5 Market advice | Done | Regime cards |
| F6 Kite live | Gated | Premium key on your box, static IP, Analyzer/paper first |
| F7 Retrain / promote | Later | Real paper fills only; same gates as V4 M5 |

Kite premium keys never belong in git. Paper first. Live is gated.
