# Meridian Final — lineage

**Canonical product:** Meridian Final  
**Canonical repo:** [sanjaymaverick-cmd/MeridianFinal](https://github.com/sanjaymaverick-cmd/MeridianFinal)  
**As of:** 23 Aug 2026

V1–V4 are frozen history. New work ships **only** here. Do not patch the V3 or V4 trees. Do not use [MeridianV4](https://github.com/sanjaymaverick-cmd/MeridianV4) as a working repo.

```
V1 advisor  →  V2 Greeks  →  V3 auto desk  →  V4 OpenAlgo / meta-label
                                                    ↓
                                         Meridian Final (this repo)
                                         TypeScript desk + meridian_final/ Python ports
```

## What each version contributed

| Version | What it was | What Final kept | Isolation |
|---------|-------------|-----------------|-----------|
| **V1** | Five-factor advisor. Book Buy / Hold / Sell. | Scoring on the imported cash book. | Math copied into `meridian_final/scoring.py` + Book UI. |
| **V2** | Greeks book, gamma scalping. | `/greeks` what-if calculator. Gamma-scalp reviews. Daily PnL = theta. Harvest = ½ Γ (ΔS)². | Copied into `meridian_final/greeks.py`, `gamma_scalp.py`. Not the live paper book. |
| **V3** | Auto paper desk. Short holds, EOD flatten. Honest 199-row meta set (21.6% win, ₹50k). | Farm sleeve, fill tape, gamma rehedge reviews. | V3 files (`build_meta_labels.py`, `meridian_v3_*`) are **read-only**. Never edit. |
| **V4** | OpenAlgo strategy host. mlfinlab-style meta. Longer-hold PnL sleeve. Promotion gates. | Decision-engine math. Farm 90s labels vs PnL (hard stop / 2.2R / trail). Promote only on paper fills. | V4 tree frozen. Ports in `meridian_final/decision.py`. OpenAlgo is optional, not the running desk. |

## What Final is (and is not)

**Is:** one personal paper desk. Mock ₹10,00,000. Signals / Paper / Paper auto-send. Live locked. Kite disarmed. Research that answers the query or returns empty. Promotion in English.

**Is not:** a live broker. An OpenAlgo plugin. A continuation of the MeridianV4 GitHub repo. An order.

## Promotion (from V4, tightened)

PnL sleeve stays flat until **all** of: n ≥ 2000, test AUC ≥ 0.55, hit > 52%. Quality holds (≥300s) counted separately from 90s farm time-stops. Synth-only AUC does not promote. Book META is `n/a` until then — never fake 0%.

## Execution path

```
Research (NL + universe + Grok when signed in)
        ↓
Scoring (V1) + Meta (V4 logistic, if promoted)
        ↓
Decision engine (gates, size, manage)
        ↓
Greeks / gamma reviews (V2)
        ↓
OMS: paper desk now  →  Kite / OpenAlgo later, only if LIVE_OK + static IP
```

Spec: [BUILD_PLAN.md](BUILD_PLAN.md). UX contract: [UX_BACKLOG.md](UX_BACKLOG.md). Local run: [../LOCAL.md](../LOCAL.md).
