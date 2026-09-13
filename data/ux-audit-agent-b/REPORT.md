# Agent B — Semi-Manual Trader UX audit

**Product:** Meridian Final (V4 paper desk; OpenAlgo Analyzer analog = Paper mode, Kite disarmed)  
**Target:** `http://127.0.0.1:3000`  
**Date:** 23 Aug 2026 (weekend session)  
**Mode constraint:** Paper / Analyzer only. No live arm.  
**Evidence:** `data/ux-audit-agent-b/*.png` plus engine behaviour in `src/lib/server/paper-engine.ts`

The originating prompt was truncated after “you expect”. Persona used for this pass:

> Hybrid control. Happy for the strategy to run, but I expect a veto or skip on a single clip, a pause that is not a nuclear kill, a live proposal tape in Advisory, flatten-one-name, human-readable why, size I can touch, and a guarantee that Paper never means Kite.

**Overall:** the desk is a competent **full-auto paper farm with a global kill**. It is not a hybrid desk. Advisory exists as a label, not as an Action Center.

Score as Agent B: **2.5 / 10** for hybrid control. Paper-safety (no Kite) is the one thing that holds.

---

## Journey (Location → Goal → Steps → Observed → Verdict)

### 1. Login — “Can I sit down as the operator?”

- **Location:** `/login`
- **Goal:** Authenticate so Kill / mode / Auto are *my* controls, not a guest’s.
- **Steps:** Open login, fill `WQ3137` / `Test@password`, Sign in to the desk.
- **Observed:** Copy says “Guest mode still runs the engines without signing in.” Submit returns **Invalid origin**. Header on every later page still shows **Sign in**. Kill, mode, and Reset remain live for a guest.
- **Verdict:** **FAIL**
- **Friction:** I never become the operator. The overnight book is a shared toy any visitor can kill or reset.
- **Fix:** Honor `127.0.0.1` as a trusted origin; until then, disable Kill / Reset / mode for guests or require a desk PIN on those three controls.

### 2. Command — “Is it running, and can I intervene from home?”

- **Location:** `/` header + Paper P&L + Latest paper fills
- **Goal:** See running state, paper vs live, and flatten or skip a fill without hunting Auto.
- **Steps:** Land on Command after failed login (guest). Read badge, Kill, mode select, fills.
- **Observed:** Badge **paper**, Kill, Desk mode select (advisory / paper / auto). Paper P&L −₹253, **9 open**. Advice cards all say “Not an order” while the fill tape is already printing `farm:fade_short:live` on LTC, AVAX, PAXG, DOT… Reason column is snake_case. Price column duplicates the IST stamp. No row actions. Crypto advice says “BTC / ETH on dips — Paper on Delta” while Auto is already in BTC/ETH/SOL farm clips.
- **Verdict:** **PARTIAL**
- **Friction:** I can see that *something* is running and I can Kill from home. I cannot touch a single fill. “live” in the reason looks like live trading. Advice and the engine contradict each other.
- **Fix:** Latest fills need Flatten / Skip-symbol. Rewrite reasons (`Farm fade (live quote)`). Drop the duplicate timestamp. One line under Paper P&L: “Paper book · Kite off · 9 clips you cannot veto from here.”

### 3. Auto — “Where is my veto?”

- **Location:** `/auto` Overnight paper loop
- **Goal:** Find the strategy, last decision, heat / hold / meta, and per-clip controls.
- **Steps:** Click Auto. Set Paper (Analyzer analog). Inspect Open clips, Fill tape, Last scan, buttons.
- **Observed:** Mode chips **advisory / paper / auto** duplicate the header `<select>`. Buttons: Kill switch, Reset paper, Download samples. KPIs: Budget ₹10L, Open MTM ~₹0, Realised −₹253, Meta **farming** `n 8585 · auc 0.553 · hit 40% · paper`. Open clips table: Symbol, Sleeve, Side, Qty, Entry, Opened IST, Last, Stop, Meta, P&L — **zero row buttons, zero checkboxes**. Last scan shows `farm:BTC 24AUG26 76750 CE BUY 50% meta farm:passed_gates` with no Accept/Skip. Fill tape already has the clip. Heat is not a KPI. Hold is an open timestamp, not a countdown to the 90s farm barrier. `paper` and `auto` both execute (Kite still off).
- **Verdict:** **FAIL** (hybrid). **PASS** (paper-only safety copy).
- **Friction:** This is a spectator dashboard on a running farm. Last scan is a log of decisions already taken, not a queue. `auto` vs `paper` is a naming trap — I will not press Auto if I think it is live, and I will press Paper thinking I still confirm.
- **Fix:** OpenAlgo-style Action Center: Last scan rows that are BUY/SELL sit in **Pending** for N seconds (or until I Approve / Skip / Size). Paper executes only after that. Rename modes to **Signals / Paper / Live (gated)**.

### 4. Advisory — “Pause new risk, keep showing me the next trade”

- **Location:** `/auto` advisory chip
- **Goal:** Signals-on, orders-off. Scan must keep refreshing so I can veto.
- **Steps:** Click advisory. Wait two engine ticks (~6s). Compare Open clips, fills, Last scan, heartbeat.
- **Observed:** Header badge → **advisory**. Open clips **unchanged** (did not flatten — good). Fill tape **did not grow** (new entries paused — good). Last scan **identical** including the same option BUY rows. Engine code: `paused = mode === "advisory" || killed` and `if (!paused) eng.scan = scan` — scan is frozen on purpose. `openSleeve` only runs for `auto || paper`.
- **Verdict:** **FAIL**
- **Friction:** Advisory is “engine asleep + stale Last scan”, not “proposal tape”. I cannot see what I *would* have done, so I cannot skip it. The BUY badges still on Last scan look actionable while nothing is pending.
- **Fix:** Keep building `scan` while paused. Badge pending rows **Would BUY — not sent**. Optional: still run `manage()` so stops work during advisory.

### 5. Kill vs Advisory — “Is Kill different, and is Arm live?”

- **Location:** Header Kill / Arm; page Kill switch / Clear kill
- **Goal:** Nuclear stop I can tell apart from advisory. Resume must not go live.
- **Steps:** Kill from advisory. Wait. Arm. Read mode.
- **Observed:** Badge **Killed**, header button **Arm**, page button **Clear kill**. Same frozen scan, same open clips, same realised. No confirm dialog. Arm returns to **advisory** (did not flip to auto/live — good). Two labels for one bit (`killed`). **Arm** is live-trading language on a paper desk.
- **Verdict:** **PARTIAL**
- **Friction:** Kill and Advisory do the same thing to the book. The only difference is a red badge and a scarier resume word. A misclick on Arm after Killed feels like going live.
- **Fix:** One pause control with states: **Paused (signals)** vs **Halted (no manage)**. Resume CTA = **Resume paper**, never Arm. Confirm on Halt.

### 6. Reset paper — “Can I wipe the book by accident?”

- **Location:** `/auto` Reset paper
- **Goal:** Hybrid trader must not one-click destroy the farm.
- **Steps:** Inspect button. Did not click (live farm, n≈8.5k meta samples / hundreds of jsonl rows).
- **Observed:** Immediate `resetDeskPaper()` → `resetEngine()`. No `confirm()`, no dialog, sits next to Download samples. On mobile it is in the first thumb zone under the chips.
- **Verdict:** **FAIL**
- **Fix:** Type RESET, or a dialog that states “Clears open clips and the in-memory book. Does not delete `paper-samples.jsonl`.” Move it behind a ⋮ menu.

### 7. Book — “Can I overlay my cash book on the engine?”

- **Location:** `/portfolio`
- **Goal:** Send a Buy review to paper, or block Auto from a name I already hold.
- **Steps:** Read Core — Zerodha table.
- **Observed:** B/H/S + score. **META 0%** on every line. Predictability Weak. Footer: “Not an order.” No Paper this / Skip in Auto / Size. BTC in the cash book is also an Auto farm clip — two books, no link.
- **Verdict:** **FAIL** as a hybrid overlay. Reviews themselves are readable.
- **Fix:** Row actions: Paper clip / Block symbol / Ignore. Show the live Auto meta, not 0%.

### 8. Greeks — “Can I take or skip the hedge?”

- **Location:** `/greeks`
- **Goal:** Accept/reject the suggested futures clip into the paper book.
- **Steps:** Long gamma default; sliders for move and rehedge band.
- **Observed:** “Model suggestion: no futures clip yet… Keep watching.” “Reviews only — not an order.” Path cards describe selling/buying futures. No Send to paper, no Skip.
- **Verdict:** **FAIL** for intervention. **PASS** as a teaching surface.
- **Fix:** When `needsRehedge`, two buttons: **Queue paper hedge** / **Dismiss**.

### 9. Research — “Names I can paper or skip”

- **Location:** `/research` after Run research (guest)
- **Goal:** Direct shortlist with a paper/skip path.
- **Steps:** Default “AI data center spares”, Run research.
- **Observed:** Guest shortlist: RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK, SBIN — banks and IT, not spares. Every card: “Sign in for Grok research. Not an order.” No add-to-watch. Sign-in is broken (Invalid origin), so I am stuck on the heuristic list.
- **Verdict:** **FAIL** (wrong names + no action). Query chips are good.
- **Fix:** Even the desk universe should prefer POLYCAB / KEI / HAVELLS for that query (the Book sample already knows this). Card CTA: **Watch in Auto** / **Skip**.

### 10. Tape — “Manual overlay from the tape”

- **Location:** `/markets` (inspected via Agent A dump + route)
- **Goal:** Pick a name, size it, run it beside the farm.
- **Observed:** Filters and charts. No “paper this qty” from a row.
- **Verdict:** **FAIL** for hybrid overlay.

### 11. Mobile 390×844

- **Location:** `/auto` mobile
- **Goal:** Advisory/paper + kill without the desktop select.
- **Observed:** Header `<select aria-label="Desk mode">` is `hidden md:block`. Page chips **are** visible — I can still switch. Kill sits in the header. Bottom nav **covers Meta “farming”**. Fill tape is a long unfilterable list. Reset paper is easy to hit. No per-clip action in the cramped table (horizontal scroll).
- **Verdict:** **PARTIAL** (kill/chips exist) / **FAIL** (cognitive load, overlap, no veto).
- **Fix:** Sticky **Pause** + **Kill**. Hide Reset. Proposal cards, not a 20-row scan list. Raise `pb-24` so Meta is not under the tab bar.

---

## Findings by severity

| Sev | Finding | Why Agent B cares |
|-----|---------|-------------------|
| P0 | No veto / skip / flatten / size on a clip or scan row | Strategy runs; I am a spectator |
| P0 | Advisory freezes Last scan instead of proposing | The hybrid mode is a dead tape |
| P0 | Guest + Invalid origin; guest can Kill and Reset the shared book | I am not the operator |
| P1 | `paper` and `auto` both execute; **Arm** sounds live | Mode language fights Paper/Analyzer policy |
| P1 | Kill ≈ Advisory except badge + resume label | No “pause managing” vs “pause entries” |
| P1 | Reset paper, no confirm | One thumb wipe |
| P1 | Reasons `farm:fade_short:live` | “live” on a paper desk |
| P2 | Heat hidden; hold is a timestamp; META 0% on Book | Cannot judge *why* / *how loaded* |
| P2 | Advice / Research / Greeks never queue into Auto | Three brains, no handshake |
| P2 | Duplicate header select + page chips; mobile select hidden | Extra cognition |
| P2 | Last scan BUY on NSE options during **weekend session** | Looks pending, never was |
| P3 | Duplicate IST on Command fill Price column | Clutter |
| P3 | Empty-state copy “Auto must stay on” even though Paper fills | Wrong instruction |

What **works** for this persona:

- Paper really is paper. Copy repeats “Kite stays off / not an order.” Heartbeat `live: false` in decide().
- Kill is always in the header, including on Command.
- Advisory/Kill do **not** flatten open clips (I keep the book).
- Resume stayed in the mode I was in (advisory or paper), not a sneak to Auto.
- Fill tape + Open clips + Last scan exist — the data is there, the **controls** are not.
- Meta farming vs armed is visible (`farming`, n, auc, hit).

---

## Question sheet (Agent B)

| Question | Answer |
|----------|--------|
| Can I tell it is running? | Yes, if I look at the header badge and Paper P&L. Command does not say “engine looping every 2.5s”. |
| Can I keep it in Analyzer/paper? | Yes. There is no Live in the select. Do not confuse **auto** with live. |
| Can I pause without killing? | Advisory pauses entries. Scan dies. Stops/manage also pause. So: pause, but blind. |
| Can I veto one trade? | **No.** |
| Can I flatten one clip? | **No.** |
| Can I change size? | **No.** Qty is engine-computed (0.01 BTC, 56 AVAX). |
| Do I understand the last decision? | Only if I speak `passed_gates` / `fade_short` / `time_stop` / `not_promoted` / `cooldown`. |
| Is heat / daily loss visible? | Daily realised yes. Heat / daily-loss gate: only as a scan reason if I catch it. |
| Will it go live if I fat-finger? | Not to Kite. **Arm** and **auto** still feel like it. Reset is the real fat-finger. |
| Cognitive load | High: three mode controls, two kill labels, a 24-row scan, a 24-row tape, snake_case, weekend + IST. |

---

## What I would ship first (hybrid, Paper only)

1. **Action Center on `/auto`**  
   Pending intents with Approve / Skip / Size. Timeout policy explicit (“auto-skip in 30s” or “auto-send in 30s” — I want skip).  
2. **Advisory = propose + manage, do not send.** Keep `scan` hot.  
3. **Row Flatten on Open clips.**  
4. **Rename:** Signals / Paper / Live(locked). Resume paper. Never Arm.  
5. **Guest lock** on Kill / Reset / mode until origin/login works.  
6. **Human reasons** and a Heat chip.  
7. **Reset** behind confirm.  
8. Handshake: Book Block symbol, Greeks Queue hedge, Research Watch.

Until (1)–(3) exist I will run Paper only as a flight recorder, not as a co-pilot.
