# Agent C — Research & Oversight UX audit

**Desk:** Meridian Final at `http://127.0.0.1:3000` (Paper / Analyzer analog). Not an OpenAlgo-hosted strategy UI. Kite stayed disarmed. No live orders. Reset paper was never clicked.

**When:** 23 Aug 2026, 16:17–16:18 IST (live pass) plus Agent A’s 16:09 IST capture of the same desk.

**Session:** Guest on `127.0.0.1` for the research tour. Test login `WQ3137` succeeded only on `http://localhost:3000` (header showed `WQ3137 / Sign out`). Paper mode locked after first Command load (header had defaulted to `auto`).

**Artefacts:** screenshots `00`–`13`, `log.json`, `jsonl-stats.json`, `meridian-paper-samples-1787482108713.csv`.

---

## Surfaces that present research / status / promotion

| Surface | Primary operator question | Direct or synthesise? |
|---|---|---|
| **Research `/research`** | “Which names actually match my question, and what should I do next?” | **Forces synthesis — and then lies.** Four different queries returned the same six large-caps. |
| **Auto `/auto` Meta card + Last scan** | “Is the model ready to promote the PnL sleeve? Why not?” | **Partial.** Shows `farming` + `n / auc / hit / paper`. Does not name the failing gate or the next action. |
| **Auto Fill tape + Open clips** | “Are we taking quality holds or 90s farm clips?” | **Synthesise from jargon.** `farm:fade_short:live`, `time_stop:short:live`, `pnl:not_promoted`. |
| **Command `/` Paper P&L + Market advice + fills** | “What’s the desk doing, and is that advice model-backed?” | **Synthesise.** Advice talks about a 0.55 meta gate while promotion is off. No Meta card here. |
| **Book `/portfolio` META / PREDICT / ACTION** | “Does the paper model back Buy / Strong Buy on my holdings?” | **Forces a contradiction.** META is `0%`, Predict is `Weak`, Action is still `Buy` / `Strong Buy`. |
| **Download samples** (Auto button) | “Show me experiment history, clean vs contaminated.” | **Dump, not an answer.** CSV of ~92s farm clips from the live DB — not the 8,629-clip fit, no quality split. |
| **Greeks `/greeks`** | “What’s gamma on the live book?” | **Not a research surface.** Demo Nifty straddle. |
| **Tape `/markets`** | “What’s the tape?” | **Prices only.** No model overlay. |

There is **no** experiment-history page. `research_runs` exists in the schema; the UI never lists it. Guest runs are not persisted.

---

## Clean vs contaminated, quality holds, promotion

Observed on Auto Meta card (16:17 IST):

`farming` · `n 8629` · `auc 0.548` · `hit 40%` · `source paper`

Gates in code: n ≥ 2,000 **pass** · AUC ≥ 0.55 **fail** (0.548) · hit > 52% **fail** (40%).

From `paper-samples.jsonl` (the fit file, not the UI):

| Bucket | Count | Share |
|---|---:|---:|
| Total labelled clips | 8,629 | 100% |
| Close reason `time_stop` | 8,240 | 95.5% |
| Hold &lt; 90s | 377 | 4.4% |
| Hold 90–119s (farm barrier) | 8,053 | 93.3% |
| Hold 120–299s | 77 | 0.9% |
| Hold ≥ 300s (quality / longer-hold) | 122 | 1.4% |
| Sleeve `pnl` | 0 | 0% |
| Positive fwd / label | 3,486 | 40.4% |

**The UI never shows any of that.** An operator cannot see that almost every “sample” is a 90-second farm time-stop, that longer-hold quality is ~1%, or that the PnL sleeve has never produced a labelled clip because it is held `FLAT` with reason `pnl:not_promoted`.

Downloaded CSV (`listSamples(800)`) is a **different pile**: current DB, ~92s holds, `time_stop` / `fade_short` only. Meta `n 8629` is the jsonl. Two sample universes, one download button.

Heartbeat earlier in the day said `samples: 411` while the artefact said `n: 8585`. Counts disagree across surfaces.

Book META `0%` on every line — including BTC, which Auto is currently farming at 45–56% meta. The V4 logistic trained on 90s crypto clips is being painted onto NSE holdings and printing zero, while five-factor still says Strong Buy.

---

## Language

Technical and vague, not plain and decisive.

- **Meta: farming** — sounds like a mode, not a verdict. The truth is: “Not ready to size real paper P&amp;L. Hit rate 40% (need 52%). AUC 0.548 (need 0.55).”
- **auc 0.553 / 0.548 · hit 40% · paper** — three raw stats, no pass/fail, no units explained, no “worse than a coin flip at picking winners”.
- Fill / scan reasons: `farm:fade_short:live`, `time_stop:short:live`, `pnl:not_promoted`, `farm:cooldown`. Operator has to decode sleeve + reason + quote label.
- Command Spot advice: “Five-factor Buy names with meta-prob above the 0.55 gate can be worked in cash.” That sentence is **false in this session**: meta is unpromoted, Book meta is 0%, cash session is weekend-closed.
- Research cards: canned theses (“Quality compounder; near-term demand still mixed”) plus “Guest shortlist… Not an order.” No tape-cleanliness check. No “do not paper this.”
- Greeks is clearer English than Research. That is backwards.

---

## Next-action gaps

Every research/status surface stops at data. None say **what the operator should do now**.

| After seeing… | Missing next action |
|---|---|
| Meta `farming`, hit 40% | “Do not promote. Keep the farm sleeve. Ignore Book Buy as model-backed. Hit rate is the blocker.” |
| `pnl:not_promoted` | “PnL sleeve is correctly idle. Do not override.” |
| Research cards | “Open on Tape”, “Add to paper watch”, “This name is not a data-center spare — ignore.” |
| Book META 0% + Strong Buy | “Five-factor likes it; the paper model does not. Do not add size on meta.” |
| Command “Buy quality on dips” | “Weekend. NSE cash is closed. Crypto farm only. Advice is generic.” |
| Sign in to persist | Sign-in on `127.0.0.1` failed/blocked; no fallback path to history. |
| Download samples | No legend: farm vs quality, time-stop vs stop/TP, fit-set vs live DB. |

---

## Single highest-leverage improvement

**A Promotion verdict strip, in English, on Auto and Command** (and a one-line echo on Book and Research):

> **Not ready to promote.** 8,629 farm clips. Hit rate **40%** (need 52%). AUC **0.548** (need 0.55). **95%** of labels are 90-second time-stops; **122** quality holds (≥5 min). PnL sleeve stays flat. Next: keep paper farming; do not treat Book Buy / Command “work in cash” as model-backed.

That one block removes the synthesis tax that currently spans four pages.

---

## Ranked findings

### Blocker
1. **Guest Research does not answer the query.** Crypto, commodity, FX, and AI-spares all returned RELIANCE / TCS / INFY / HDFCBANK / ICICIBANK / SBIN. Guest matcher ORs a keyword then `slice(0, 6)` of the universe. Operator can paper the wrong names.
2. **Promotion state is not stated as a verdict.** `farming` + raw stats. Hit 40% and AUC 0.548 fail the written gates. Easy to misread “auc 0.55 / n 8629 / paper” as ready.
3. **Book META 0% + Strong Buy.** High risk of incorrect action: adding cash size on a five-factor Buy while the paper model is empty/unpromoted.

### High
4. **No quality-hold vs contaminated split anywhere in the UI.** 8,240/8,629 are time-stops. Invisible.
5. **Command advice contradicts Auto.** “Work in cash above 0.55 meta” on a weekend, with unpromoted meta and Book meta 0%.
6. **No experiment history.** Four sequential research runs leave only the last (wrong) cards. `research_runs` is unused. Download samples ≠ the fit set.
7. **Jargon fill/scan reasons** (`pnl:not_promoted`, `farm:fade_short:live`) instead of “PnL sleeve waiting on hit rate”.
8. **Sign-in is origin-fragile.** `127.0.0.1` → Invalid origin (Agent A) / seed crash on empty PGLite. `localhost` worked. Guest research is the broken path.

### Medium
9. Header defaults to **auto**; Paper/Analyzer is not the obvious default for this persona.
10. Duplicate timestamp in Command fill **Price** column.
11. Greeks is an unlabeled demo, not the live book.
12. Two sample counts (heartbeat vs artefact vs jsonl vs CSV).

### Low
13. Research example chips wrap awkwardly; “Sign in to persist” after every run is noise once you know guest results are junk.
14. Mode controls duplicated (header select + Auto chips + Kill / Kill switch).

---

## Top 3 recommendations

1. **Say the promotion truth in one sentence, on Auto and Command.** Pass/fail each gate. Name the blocker (today: hit rate 40%, then AUC). Count quality holds vs 90s time-stops. Tell the operator to keep farming and not size PnL / cash on five-factor Buys.
2. **Make Research answer the question.** Rank by query, refuse mismatched names, stamp source (`desk heuristic` vs `Grok`), keep a run history, and put a next action on each card (open Tape / ignore / wait for session). Guest must not dump the first six universe names.
3. **Stop painting fake confidence.** Book META `0%` should read “model not applicable / unpromoted” not `0%` next to Strong Buy. Fill reasons should be English. Download samples should be the fit set with clean/contaminated flags — or don’t call it history.
