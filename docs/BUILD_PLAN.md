# Meridian Final — Build Master Spec

**Last updated:** 14 Sep 2026  
**Repos:** [sanjaymaverick-cmd/MeridianFinal](https://github.com/sanjaymaverick-cmd/MeridianFinal)  
**Lineage:** V1 advisor → V2 Greeks → V3 auto desk → V4 OpenAlgo / meta-label  
**Isolation:** V3 and V4 stay frozen. Final copies math, never patches those trees.

---

## Goal

One personal Indian-equity desk with four jobs:

1. **Full auto (paper first)** — V4 decision engine (meta-prob, heat, daily loss, min-hold 300s, 1.5R / trail) plus V3 gamma-scalp rehedge reviews. Live Kite stays **off** (F6 gated: static IP + `LIVE_OK` later). Desk pause CTA is **Resume paper**, never Arm.
2. **Existing book** — CSV / paste of Zerodha-style holdings → Buy / Hold / Sell + five-factor score + meta-prob + predictability.
3. **NL research** — “find companies that supply spares to AI data centers” → ranked NSE shortlist (Grok when signed in).
4. **Market advice** — regime from VIX / tape → Spot / Futures / Options cards. Always “(not an order)”.

Premium **Kite Connect** is the intended live broker. This app is the intelligence + paper layer. OpenAlgo remains the optional strategy host from V4.

---

## Locked decisions

| Area | Choice |
|------|--------|
| Markets | India cash + F&O first. Crypto/Delta later, same as V4. |
| Meta-label | Synth scaffold until paper fills fit a logistic. Promote PnL only if n≥2000, test AUC≥0.55, and test hit>52%. Do not promote on synth-only AUC. Missing `hitRate` defaults to 0. Sample `label` / `y` is 1 iff net forward return after fees > 0; barrier path is `barrier` / `label_barrier`, not the training label. |
| Holds | Farm: 90s vertical barrier for labels in the spec; the TS desk farm time-stop is 900s (do not silently change in a label-honesty pass). PnL: no time-stop — hard stop, 2.2R, trail. Python `meridian_final/` is a frozen port. |
| Greeks | Daily PnL = theta. Gamma scalp = ½ Γ (ΔS)². Long gamma harvests; short gamma hurts. |
| Execution | Paper in the desk. Kite live only after static IP + `LIVE_OK`. |
| Operator chrome | Boot paused Signals (`advisory` + `killed`). Halt pauses new entries (exits still run). Resume CTA = **Resume paper**, never Arm. |
| Capital | Shared paper book **₹10,00,000**. Farm: max 16 small clips. PnL: max 4, quarter-Kelly, only when meta is promoted. Live cap stays smaller (V4 `LIVE_BUDGET` 25k) when F6 is later enabled. |
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
OMS: paper (this desk)  →  Kite / OpenAlgo (later, F6 gated)
```

---

## Phases

| Phase | Status | Notes |
|-------|--------|-------|
| F0 Spec + repo | Done | this file, GitHub `MeridianFinal` |
| F1 Book analyzer | Done | CSV parse + B/H/S + predictability |
| F2 Greeks / gamma | Done | Long/short gamma path, rehedge band |
| F3 Auto paper | Done | Farm sleeve default + F&O watch. PnL sleeve stays flat until promotion gates pass. |
| F4 NL research | Done | Grok + heuristic fallback |
| F5 Market advice | Done | Regime cards |
| F6 Kite live | Gated | Premium key on your box, static IP, Analyzer/paper first |
| F7 Retrain / promote | Done | Fit logistic on `paper-samples.jsonl` (time split). PnL sleeve opens only if n≥2000, test AUC≥0.55, test hit>52%. |

---

## Kite (premium)

Personal/free Kite cannot poll quotes. Paid Connect can. Orders still need a **whitelisted static IP**. Never commit API keys. See V4 `docs/ZERODHA_KITE_API.md`.

---

## What never reaches the browser as an order

Kelly internals, logistic coefficients (shown only as finished `meta_prob`), per-leg construction beyond net Δ Γ ν Θ, broker secrets. Review cards always include “not an order”.
