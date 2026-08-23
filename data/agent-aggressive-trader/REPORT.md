# Agent 1 — Active Aggressive Trader + product designer

**Product:** Meridian Final (paper desk, not live Kite)  
**Pass:** Sunday 23 Aug 2026, 19:35–19:36 IST (`weekend session`)  
**Login:** `WQ3137` on http://localhost:3000  
**Driver:** Playwright Chromium, 1440×900 then 390×844. Never clicked Reset paper. Never armed live. Halt was probed then Resume paper.  
**Screenshots:** `00-login.png` … `18-mobile-auto-more.png` (15 files in this folder)

---

## 1. Persona score / verdict

**4 / 10 — looks like a desk, trades like a newsletter.**

I can flatten a name if I scroll past a serif headline and a promotion essay. I cannot scan → decide → size → send/skip in seconds. Sunday NSE still looks open. Crypto — the only thing I should be clipping tonight — paints an empty tape. Keyboard does nothing. Heat and P&L are in cards, not in my face.

---

## 2. Journey table

| Location | Goal | Steps | Observed | Verdict |
|---|---|---|---|---|
| `/login` | Get on the book in <5s | Land, ID prefilled `WQ3137`, type password, **Sign in to the desk** | Headline **“The desk that holds.”** Guest copy first. Submit stays disabled until password. Google/X sit equal to desk login. Hydration mismatch in console. | PARTIAL |
| `/` Command | Heat, P&L, session, next clip | Login lands here; read header + blotter | **Paper P&L −₹317**, **11 open clips** in 12px subtitle. Nifty 24252.0 +0.1% is the first tile on a Sunday. Session is a tiny pill **“weekend session”**. Fills have a ghost **Flatten** link. No size, no reverse, no skip here. | FAIL |
| `/markets` Tape crypto | Weekend book, one-click clip | Default tab is crypto; wait for ticks | First paint: **“0 Binance USDT · 0 book live”**, empty table, BTC chart still $77,517. **Paper this qty** (long only, qty 1). No short, no flatten, no skip. Later Binance hydrates (474 pairs). | FAIL |
| Tape equity / options | Confirm NSE is obviously closed | Click **equity**, **options** | Equity prints RELIANCE ₹1,316 +0.2% with no CLOSED banner. `closedCopy=false`. Options: **NIFTY 25AUG26 24250 CE · delayed**, RSI 50, duplicated as `NIFTYCE` and the long name. **TATAMOTORS ₹0.00**. Paper this qty still live. | FAIL |
| `/portfolio` Book | See open risk, flatten/reverse | Nav **Book** | This is an imported Zerodha CSV, not the paper clips. **Factor Buy / Paper clip / Block** on RELIANCE while cash is shut. Promotion strip first. Unrealised ₹11,715 is the cash book, not farm MTM. | FAIL |
| `/auto` Signals / Paper / Auto | Drive the engine | Chips **Signals**, **Paper**, **Auto**; **Halt**; Action center; Open clips; Fill tape | Three mode UIs (header badge + `<select>` + page chips). Dual **Halt**. Action center often **“No BUY/SELL proposals this tick”** while fills print. Flatten per clip works. No Reverse. Fill tape **Skip name** on already-closed fills. **Reset paper…** sits next to Halt. | PARTIAL |
| Auto Halt | Kill new risk without thinking | Header Halt → confirm; page Halt one-click | Header: **“Halt the paper engine? Open clips stay. Stops pause. This is not live Kite.”** Page Halt has **no confirm**. While Halted, copy still says **“Paper is sending farm clips.”** BUY/SELL rows still sit in Action center. | PARTIAL |
| Tape → send | Size a clip and know what happened | Qty 1, **Paper this qty** on BTC | Toast **“Papered 1 BTC. Kite stays off.”** Fill tape 3s later: BUY 1 @ 77501.42 **opened by you**, then SELL 1 @ 77375.61 **closed overlapping name**. −₹126 and I’m flat. No preview, no short. | FAIL |
| `/greeks` | Hedge leftover delta now | Open, toggle Short gamma | Teaching Nifty demo, **not paper clips**. Dual **Short gamma** chip + brown badge. Mark 24252.0 on Sunday. Queue hedge only if outside band (not shown on this short-gamma snap). | PARTIAL |
| `/research` hit | Rank names, watch or skip | Query AI-spares example, **Run research** | SIEMENS / ABB / RELIANCE / LT / POWERGRID / BHARTIARTL, scores 7.9–8.2. **Watch in Auto / Open on Tape / Skip**. Source **desk heuristic** though signed in. Open on Tape does not jump to the symbol. Watch is a cash name on Sunday. | PARTIAL |
| `/research` garbage | Empty state I trust | `zzzzqwerty asdfghjkl not-a-real-market-universe-query-xyz` | Amber: **“Nothing in the modelled universe matches that question. Try cables, BTC/ETH, gold, or USDINR — or sign in for Grok.”** Honest. Then it still says sign in for Grok while I am signed in. | PASS |
| Mobile 390×844 Command | Trade from phone | Viewport, `/` | Header overflow: **Paper · Halt · Paper · W WQ**. Sign out clipped (`overflow: true`). Nifty still first. Paper P&L below the fold after VIX. Horizontal overflow. | FAIL |
| Mobile Auto | Halt / flatten / skip | `/auto`, **More** | Promotion eats the fold. Heat/MTM/clips below. Bottom nav overlays **BUDGET ₹10,00,000**. Dual Halt. **More** reveals Download fit samples; Reset hidden (good). Clips table needs horizontal scroll. | FAIL |

---

## 3. Ranked findings

### Blocker

**B1. Sunday NSE still looks tradable.**  
*Why the aggressive trader cares:* Fat-finger is the only way I blow up a clip book after hours. I need the closed cash session to slap me.  
*On screen (19:35 IST Sunday):* first Command tiles are **NIFTY 24252.0 +0.1%** and **BANK NIFTY 57762 +0.5%** in up-green. Session is an 11px pill **“weekend session”** next to a calm green **Calm**. Equity tape has no CLOSED rail; delayed count was 1; copy search for closed/weekend on that tab returned false. Advice card buried under Promotion: **“Cash session is closed. No NSE futures overlay until the next open. Crypto farm only.”** Meanwhile **Paper this qty**, Book **Paper clip**, and Research **Watch in Auto** still fire on NSE names. TATAMOTORS last is **₹0.00**.  
*Fix:* Full-width **NSE CASH CLOSED · CRYPTO ONLY** strip in warn/down, pinned under the header, until next 09:15 IST. Grey + lock equity/F&O rows. Disable Paper clip / Paper this qty / Watch on `isNseHoursOnly` names. Promote BTC/ETH tiles to slot 1–2 on weekend. Do not paint +0.1% on a stale Nifty snapshot without **STALE**.

**B2. Crypto tape is empty on first paint — the weekend book is missing.**  
*Why:* Tonight the only live venue is Binance. I opened Tape (default **crypto**) and got a blank blotter: **“0 Binance USDT · 0 book live”**, **“… IST”**, empty `tbody` (rowCount 0). Right pane still showed Bitcoin $77,517 and a live **Paper this qty**. ~4s later options tab showed **474 Binance USDT · 165 book live**. Command had already claimed **643 live**.  
*Fix:* Skeleton rows immediately; if Binance is late, banner **“Binance USDT hydrating…”** with last-good ticks from the desk store. Never show a send button against an empty book. Prefetch Binance on login, not on first Tape visit.

**B3. `Maximum update depth exceeded` (10 console errors this pass).**  
*Why:* If React is looping, ticks and flatten lag. Latency of understanding is the enemy.  
*On screen:* console flooded after login; page still painted, but I do not trust the 2.5s paper poll when the client is spinning. Hydration mismatch on the login inputs (`style={{}}`) as well.  
*Fix:* Find the `useEffect` without a stable dep (likely `hydratePaper` / quotes). Cap console. This is a trading bug, not a lint.

### High

**H1. Zero keyboard. `?` and Ctrl+K do nothing.**  
Tab after login focused the **Tape** link. No command palette, no `F` flatten, no `S` skip, no `H` halt, no `1–6` nav, no `/` symbol jump. Every clip is a mouse hunt.  
*Fix:* Desk keymap: `/` focus symbol, `Enter` paper default qty, `Shift+Enter` short, `F` flatten focused, `R` reverse, `S` skip 15m, `H` halt (with the existing confirm), `Esc` cancel. `?` overlay. Show the bindings on Halt/Flatten tooltips.

**H2. Mode and Halt are drawn three times and they disagree.**  
Header: badge **Auto**, button **Halt**, `<select aria-label="Desk mode">` **Auto**. Page: chips **Signals / Paper / Auto / Halt**. Nav item is also **Auto**. Header Halt asks confirm; Auto-page Halt is one-click `setDeskKilled(!killed)`. While Halted, Action center still reads **“Paper is sending farm clips. Skip a name or flatten an open clip.”** and still lists `farm:ETHUSDPERP SELL`.  
*Fix:* One mode control (the chips). Header keeps **Halted** badge + a single Halt that always confirms. When killed, rewrite Action center to **HALTED — no new clips. Open risk still here.** Dim BUY/SELL rows.

**H3. “Book” is not the book I am trading.**  
`/portfolio` is **“Buy / Hold / Sell”** on a Zerodha CSV (RELIANCE 40 @ 1284, Factor Buy, Paper clip, Block). Open farm clips live on Auto. Command **Imported book ₹5,79,673** is that CSV, while **Paper P&L −₹317 · 11 open clips** is the real risk. I will flatten the wrong object.  
*Fix:* Book = paper positions + MTM + flatten/reverse/skip, cash import as a second tab **Imported**. Or rename nav to **Holdings**.

**H4. Send path has no size, no short, no reverse — and overlapping names eat the clip.**  
Tape: **Qty 1** + **Paper this qty** (always long, sleeve farm). Toast: **“Papered 1 BTC. Kite stays off.”** Fill tape: BUY 1 @ 77501.42 **Farm · opened by you**, 3s later SELL 1 @ 77375.61 **closed overlapping name · was long**. Command Flatten is a 12px underline on *fills*, not on open clips. Auto has Flatten, no Reverse. Fill tape **Skip name** sits on already-closed time-stops.  
*Fix:* On Tape and Action center: **BUY / SELL / FLATTEN / REVERSE / SKIP** as 44px buttons. Preview notional in INR before send. If the name is already open, don’t silently close-overlap — offer **add / flatten / reverse**. Move Flatten off the fill tape; Skip only on pending proposals.

**H5. Heat and P&L are not in my face.**  
Command: **Paper P&L −₹317** is tile 4 of 8, subtitle **“Paper book · Kite off · 11 open clips”**. Auto: **Open MTM ₹2**, **Realised −₹446**, **Heat 40%** as five equal 24px-radius cards *under* a Promotion novel. Clip P&Ls are ₹0 / ₹1 / ₹2. Hold column is **“31s to label”** not a fuse.  
*Fix:* Sticky blotter under header: `P&L −₹446 · MTM ₹2 · HEAT 40% ████░░░░ · 10 clips · NSE CLOSED`. Per-row spark + seconds-to-stop bar. Heat as a meter, red > 60%.

**H6. Promotion strip occupies the fold on Command, Book, Auto, Research, mobile.**  
Copy: **“Not ready to promote… 8,959 of 9,355 labels are 90s time-stops… Hit 41% is worse than a coin flip.”** True, and I already believed you. On 390×844 Auto I cannot see a single clip without scrolling through it.  
*Fix:* Collapse to a one-line chip **PnL sleeve not ready · hit 41%** in the header. Expand on click. Never on Auto’s first screen.

**H7. Mobile header is a fat-finger trap.**  
390×844: **Meridian FINAL | Paper | Halt | Paper | W WQ** — Sign out clipped (`overflowX: true`, Sign out `overflow: true`). Two Paper controls + Halt in 46×36px. Bottom nav `min-h-14` covers **BUDGET ₹10,00,000**. Horizontal overflow on Command and Auto.  
*Fix:* Header on small: wordmark + Halt + Halted/mode badge only. Mode chips on Auto page. `pb-28` is already there; stop drawing KPIs under the nav. `overflow-x: hidden` on header.

### Medium

**M1. Action center is empty on the tick that matters.**  
Auto initial: **“No BUY/SELL proposals this tick.”** while Fill tape is a firehose of fade-shorts and 90s time-stops. I see the trade after it exists.  
*Fix:* Show next 5 scan rows with countdown, even if FLAT. Don’t hide the book behind “this tick.”

**M2. Reset paper… is one ghost click from Halt on desktop.**  
I did not click it. An aggressive mouse will. Hide behind **More → danger**. Auto already hides it on mobile (`hidden md:inline-flex`) — do that everywhere.

**M3. Options tape is a duplicate delayed model, RSI frozen at 50.**  
`NIFTYCE` and `NIFTY 25AUG26 24250 CE · delayed` same ₹113. BTC options 0.0% 50 RSI. Chart pane stayed on BTC while I clicked Nifty rows (pick state).  
*Fix:* One row per contract. **DELAYED · MODEL** badge at row level. Selecting a row must retarget the chart. Disable paper-qty on delayed NSE on weekend.

**M4. Research “Open on Tape” is a dead hop.**  
`<Link to="/markets">` — lands on crypto default, not SIEMENS. **Watch in Auto** on Sunday cash. Source line: **“Source: desk heuristic. Not an order.”** after promising Grok for signed-in sessions. Garbage empty-state still says **“or sign in for Grok.”**  
*Fix:* `/markets?symbol=SIEMENS`. Disable Watch on closed venues. If Grok didn’t run, say **“Grok unavailable — desk heuristic”**, not “sign in.”

**M5. Greeks is a teaching poster, not a hedge pad.**  
**“Demo book — not your live paper clips.”** Nifty 24252.0 on Sunday. Two **Short gamma** controls (selected chip + brown badge). Queue paper hedge only appears outside band. No keyboard, no link to open NIFTYFUT clip. Fine as a lesson; don’t put it in the primary nav equal to Tape.

**M6. Login is a brand page.**  
**“The desk that holds.”** Test-desk paragraph before the form. **Sign in to the desk** disabled (opacity 40%) until password — looks broken. Continue with Google/X are the same size as submit.  
*Fix:* ID + password + Sign in first. One line: paper desk, Kite off. Disable OAuth or park them under a disclosure.

**M7. Fill tape density is good; labels are farm-internal.**  
**“31s to label”**, **“Farm · fade short · paper quote”**, `farm:ETH 24AUG26 2450 CE`. I need **STOP 31s · short 0.17 · −₹1**. Prefixes belong in a tooltip.

### Low

**L1. Magazine layout vs blotter.** 48px Instrument Serif **“Multi-asset desk”**, `rounded-[24px]`, `gap-8`. Contrast of body `#ecece8` on `#0a0b0c` is fine; muted `#8d918c` on cards is soft for 11px uppercase. Halt is 36×47px — primary kill should be ≥44×88.  
**L2. Naming drift:** `ETH` vs `ETHPERP` vs `ETHUSDPERP` vs `farm:ETH`. Flatten ETH does not obviously flatten ETHPERP.  
**L3. Login hydration warning** (`style={{}}` mismatch).  
**L4. Command fills Flatten** on a SELL that already closed the name — I flattened ETHPERP from that control (fill `flattened by you · was short`). Dangerous aliasing.  
**L5. Run research** disabled under 8 characters — fine, but no hint.

---

## 4. Module-by-module

### Command (`/`)

Sticky header: **Meridian FINAL · Command Tape Book Auto Greeks Research · [Auto] Halt [Auto ▾] W WQ3137 Sign out**. Three “Auto”s. Paper P&L is not in the chrome.

Hero **“Multi-asset desk”** + source sermon. Badges **weekend session · Calm · 23 Aug, 07:35 pm IST · 643 live**. The live count is the only hot number; it is the quietest chip.

Eight stat tiles, NSE first. Bitcoin $77,555 is tile 5. Gold MCX est. +3.6% looks more alive than BTC. Then the full Promotion gate. Then **Market advice** cards (Spot LONG **Buy quality on dips**, Futures LONG **Index longs only with a stop** with the closed-cash sentence inside, Options NEUTRAL, Crypto LONG, FX NEUTRAL, Commodity LONG). Stance **LONG** on Futures while the body says cash is closed — stance vs body fight. **Imported book** lists RELIANCE Buy as if I should care. **Latest paper fills** is the actual desk: AAVE SELL 2.97, ETHPERP SELL, time stops — Flatten as underline.

Density 1.12 chars/kpx, 253 words/screen. For this persona that is sparse. I want 4× that in the fills region and 0.3× in the advice region.

### Tape (`/markets`)

Default filter **crypto** — correct instinct, broken first frame (B2). Filters: all / equity / crypto / forex / commodity / futures / options. Search **Filter symbol**. Chart ranges 1mo/3mo/1y/5y (daily history, not a 1s tape). Venue badge **Delta**. **Paper this qty** is the only send; no SELL, no flatten, no skip, no notional. Clicking options rows did not move the BTC chart. Equity tab is a long NSE list with live-looking LTPs and almost no delayed flags.

### Book (`/portfolio`)

Kicker **PORTFOLIO**, title **Buy / Hold / Sell**. Import CSV / **Load AI-supply sample** / paste sit *above* the table. Meta column **n/a — not promoted**. Action **Factor Buy** + **Paper clip** + **Block**. Footer: **“Five-factor likes some names. The paper model is not promoted — do not add size on meta. Not an order.”** Honest research UI. Wrong module for a clip trader. I needed open farm risk here.

### Auto (`/auto`)

Best module for this persona, still not fast enough.

- Title **Overnight paper loop** — I am not overnight, I am now.  
- Chips work; Paper and Auto both send; Signals copy **“Action center — would send, not sent”** / **“Approve opens a paper clip. Skip cools the name for 15 minutes.”** Approve did not show this tick (empty pending).  
- KPIs: Budget ₹10,00,000 farm 16 · pnl 4; Open MTM ₹1–₹3; Realised −₹446; Heat 40%; Meta **not ready**.  
- Open clips table: symbol, sleeve farm, side short/long, qty, hold **Ns to label**, stop 1.20%, meta %, P&L, **Flatten**. Flatten on ETHPERP worked (`flattened by you`). No Reverse, no flatten-all, no click-row to Tape.  
- Fill tape: dense, BUY/SELL badges, Skip name on every line including time-stops.  
- Other scan rows: `farm:BTC FLAT 55% meta Farm · same coin already open` — useful if it were the first thing I saw.

Header Halt confirm copy is clear. Page Halt is a loaded gun next to **Reset paper…**.

### Greeks (`/greeks`)

Teaching surface. Long vs Short gamma, sliders **Assumed move 1.0%** / **Rehedge band 1.0 lots**, path **Start (delta flattened)**. Short gamma copy: **“this is not a harvest… a 1.0% jump can cost about ₹-3,211.”** Trustworthy as a lesson. I will not open this during a clip.

### Research (`/research`)

Hit query returned six modelled names with **Watch in Auto / Open on Tape / Skip** and score chips. Garbage query empty-state is one of the few honest screens in the product. Promotion strip again. Grok never appeared; every card repeats **“Desk heuristic over the modelled universe. Not Grok. Not an order.”** plus **“Watch in Auto or open on Tape. Not an order.”** — three “not an order”s on one card. I got it.

### Header / nav

Desktop nav is scannable. Mode `<select>` duplicates chips. Halt contrast is good (`bg rgb(196, 92, 74)` on light text) but the control is tiny. Guest Halt is disabled with title **Sign in to halt** — correct. Sticky header + blur is fine. No P&L in chrome. Bottom mobile nav 6-up is the right IA; the header should get out of its way.

### Mobile (390×844)

Command: Nifty still hero; Paper P&L is the fourth card; badges wrap; overflow-x true. Auto: Promotion + chips + More; clips and Halt targets below the fold; nav collides with Budget. More menu correctly keeps Reset off-canvas. I cannot flatten a name with one thumb without scrolling 2–3 screens.

---

## 5. Top 7 recommendations (leverage for this persona)

1. **Weekend/closed session lock.** Pinned **NSE CASH CLOSED · CRYPTO ONLY** bar. Disable send/watch/paper-clip on cash/F&O. Stale snapshot labels. BTC/ETH first. (Kills fat-finger; I trade Sunday.)
2. **One blotter chrome.** Sticky `P&L · MTM · HEAT meter · clips · Halt`. Kill the 48px serif hero and relocate Promotion to a chip. (I see risk in 200ms.)
3. **Clip actions on the name, not the essay.** Per row: BUY / SELL / FLATTEN / REVERSE / SKIP, 44px, keyboard F/R/S. Preview INR notional. Don’t close-overlap silently. Flatten-all in the chrome. (This is the product.)
4. **Book = paper positions.** Holdings CSV is a tab. Auto’s Open clips table *is* Book. Deep-link symbol → Tape. (Stops me flattening the wrong book.)
5. **One Halt, one mode.** Chips on Auto; header Halt with confirm everywhere; Halted copy must not say “sending.” Park **Reset paper…** behind More on desktop too. (Stops dual-gun Halt and reset fat-finger.)
6. **Tape that is actually a tape.** Don’t mount crypto empty. Tick the selected row. 1m/5m chart default, not 1y. Short as well as long. Grey delayed NSE. (Weekend speed.)
7. **Keymap + empty Action center.** `?` overlay, `/` jump, H halt. Always show the next scan rows with a fuse, not “no proposals this tick.” (Scan → decide in seconds.)

---

## 6. What already works

- Paper engine is alive: fills IST-stamped, farm shorts on AAVE/DOT/AVAX, 90s time-stops, take-profit on AAVE. Kite stays off in copy and in the toast **“Papered 1 BTC. Kite stays off.”**
- **Flatten** on an open clip does what it says (`flattened by you · was short` on ETHPERP).
- Mode chips **Signals / Paper / Auto** with honest hints (Signals = propose; Paper/Auto = send farm). Signals empty-state copy is correct when it appears.
- Header Halt confirm: **“Halt the paper engine? Open clips stay. Stops pause. This is not live Kite.”** / **Halt paper** / **Cancel**. Resume paper restores.
- Heat / budget / realised KPIs exist and the 40% heat matches a full farm (10/16).
- Promotion gates (n 9,355, AUC 0.520, hit 41%, source paper fills) are specific and not marketing. Hit-rate **“worse than a coin flip”** is the right temperature — just not on every page.
- Research garbage empty-state is excellent. Hit list is modelled-universe-only, with Skip.
- BUY/SELL color, mono qty/price, tabular numbers, dark desk palette (`#0a0b0c` / IBM Plex / up `#3f8f6b` / down `#c45c4a`). Focus ring exists.
- Mobile bottom nav maps 1:1 to Command/Tape/Book/Auto/Greeks/Research. Reset hidden on small screens.
- Guest vs signed-in is real: Halt/mode disabled until WQ3137. Login ID prefilled.
- Skip cooldown and “same coin already open” reasons in Other scan rows — the engine is thinking; the UI just hides it.

---

*Pass artefacts: `log.json`, 15 PNGs, `audit.mjs`. Console: hydration mismatch + 10× max update depth. No Reset paper click. No live arm.*
