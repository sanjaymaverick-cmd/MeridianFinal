# Meridian Final — Motion / 3D product design report

**Agent:** Motion / 3D product designer  
**Scope:** Research only. No application source was edited.  
**Desk as it ships today:** Vite + React 19 + Tailwind v4 + `tw-animate-css`. Cards already sit on `#0a0b0c` with `rounded-[24px]` tokens, Instrument Serif titles, IBM Plex Mono numbers. `prefers-reduced-motion` is already a hard CSS kill-switch in `src/styles.css`. There is **no** Motion, GSAP, Three, R3F, Lenis, Lottie, or Rive in `package.json`. Auto paper refetches every **2.5s**. Tape renders many live rows. Kite stays disarmed.

---

## 1. Design thesis

Meridian is a **dark, serious Indian multi-asset PAPER desk**, not a marketing site and not a casino HUD. Motion exists to prove the desk is *alive and under control*: a fill arriving, heat rising, a quote ticking, a regime changing. 3D exists to prove *craft*, once.

**What fits**

- Bloomberg / Fey / Linear, not Binance neon and not Dribbble glass toys.
- One hero 3D object (or CSS-3D) on **Command**, then micro-interactions everywhere else.
- Depth from **light, border, and 6–8° tilt**, not from a WebGL scene that owns the page.
- Numbers stay **tabular, mono, 2D, always readable**. Animation of a number is a *digit roll* or a *cell flash*, never a 3D extrusion.
- Paper language is **calm**. Mode chips, Halt, and Paper P&amp;L must never grow an “armed / live / pulsing cyan” halo that could be read as Kite being on.

**The one-sentence rule**

> If a trader cannot read Nifty, Paper P&amp;L, and Halt in 200 ms from across the room, the motion is wrong.

**Engine constraint (this stack)**

Do **not** put React Three Fiber on Tape, Auto, or Book. Auto already polls 2.5s; Tape already has dozens of rows. A full 3D engine on those pages will fight the quote hydrator. CSS `transform` + one optional 5 KB WebGL globe + one optional 2D canvas heatmap is the ceiling.

---

## 2. Shortlist of references

Named, public, remixable. Fit is **for this desk**, not generic quality.

| # | Name | Source | URL | What to steal | What to ignore | Fit |
|---|------|--------|-----|---------------|----------------|-----|
| 1 | **Fey** (live product + glass craft) | Product | [fey.com](https://fey.com) · [Thiago Costa on glass](https://x.com/tcosta/status/1932468778035540463) · [Fey charts thread](https://x.com/brotzky/status/1733177456293789978) | Dark, high-density finance that still feels expensive. Glass used as *layering*, not frosting. Drag-to-compare charts. Watchlist as a first-class object. | Consumer “investing app” softness. Plaid onboarding theatre. Do not copy their Mac-widget chrome onto a paper OMS. | **5** |
| 2 | **Fey Finance Trading Pro UI kit** | Figma Community | [figma.com/community/file/1525664131110834747](https://www.figma.com/community/file/1525664131110834747/fey-finance-trading-pro-ui-kit) | Dark dashboard + chart hierarchy that matches Meridian’s Command / Tape split. Card radius, muted grid, serif-adjacent titles. | Stock-photo “pro trader” mock copy. Any leftover crypto accent. | **5** |
| 3 | **Linear motion system** (Emil Kowalski) | Product / essay | [animations.dev easing](https://animations.dev/learn/animation-theory/the-easing-blueprint) · [How Linear is so fast](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown) · [Linear vs Vercel motion](https://designmd.co/blog/linear-vs-vercel-motion) | `--speed-quickTransition: .1s`, `--speed-regularTransition: .25s`, `--speed-slowTransition: .35s`. Hover is color-only. Animate `transform`/`opacity` never layout. Spatial origin (popover grows out of the chip). | Issue-tracker metaphors. Springs with overshoot on P&amp;L. | **5** |
| 4 | **Aceternity 3D Card Effect** | OSS (React + Motion + Tailwind) | [ui.aceternity.com/components/3d-card-effect](https://ui.aceternity.com/components/3d-card-effect) | `perspective: 1000px` + `CardItem` `translateZ` layers. Copy-paste into Vite. Caps tilt with mouse delta / 25. | Hero marketing copy, floating screenshots, `scale` on the whole card. Cap rotation at **6–8°**, not the demo’s 15–25°. | **4** |
| 5 | **Aceternity Comet Card** | OSS | [ui.aceternity.com/components/comet-card](https://ui.aceternity.com/components/comet-card) | Perplexity-Comet style: tilt + translate depth, glare as a CSS gradient, not a shader. `rotateDepth` 17.5 / `translateDepth` 20 — **halve both**. | Invitation-card copy. Rainbow holographic foil. | **4** |
| 6 | **Magic UI Number Ticker + Animated List + Marquee** | OSS | [Number Ticker](https://magicui.design/docs/components/number-ticker) · [Animated List](https://magicui.design/docs/components/animated-list) · [Marquee](https://magicui.design/docs/components/marquee) · [21st.dev Number Ticker](https://21st.dev/@dillionverma/components/number-ticker) | Digit count for *first paint* of Command KPIs. `AnimatedList` for Auto fills / scan rows. CSS marquee for a header tape. `pauseOnHover`, linear easing, duplicate track. | Counting **from 0 on every 2.5s poll**. Sparkles, meteors, rainbow buttons, confetti. | **4** |
| 7 | **Cobe / Magic UI Globe** | OSS WebGL, ~5 KB | [github.com/shuding/cobe](https://github.com/shuding/cobe) · demo [cobe.vercel.app](https://cobe.vercel.app) · [Magic UI Globe](https://magicui.design/docs/components/globe) | **The only WebGL hero that belongs here.** Dotted globe, `dark: 1`, muted `baseColor`, markers for NSE / MCX / CME / Binance venues. Pause `onRender` when off-screen. GitHub/Vercel aesthetic, not crypto earth. | Sparkle overlays, auto-spin at 60 fps forever, rainbow arcs, full-bleed globe behind numbers. | **4** |
| 8 | **vanilla-tilt.js** + **@gfazioli/react-tilt** | OSS | [github.com/micku7zu/vanilla-tilt.js](https://github.com/micku7zu/vanilla-tilt.js) · [micku7zu.github.io/vanilla-tilt.js](https://micku7zu.github.io/vanilla-tilt.js) · [npm @gfazioli/react-tilt](https://www.npmjs.com/package/@gfazioli/react-tilt) | Pointer-driven `rotateX/Y`, optional `Tilt.Layer` parallax (label floats, number stays put). 6 KB, no Three. Glare max **0.08**. | Gyro on phones. `max: 25`. Scale 1.1. Rainbow glare. Applying tilt to every Tape row. | **4** |
| 9 | **React Bits TiltedCard / CountUp / SpotlightCard** | OSS | [reactbits.dev](https://reactbits.dev) · catalog via [reactbits.dev/llms.txt](https://reactbits.dev/llms.txt) · TiltedCard (pointer 3D, Motion peer) · CountUp · SpotlightCard (CSS only) | CSS-first variants. SpotlightCard is the right *cursor light* for Command cards (no extra dep). CountUp only on Research “run complete” stats, not live quotes. | Three.js hero shaders, particle text, WebGL backgrounds in the Pro blocks. | **4** |
| 10 | **Framer 3D Tilt** (Fabian Albert) + **Globe Dashboard** | Framer Marketplace | [3D Tilt](https://www.framer.com/marketplace/components/3d-tilt/) · [Globe Dashboard](https://www.framer.com/marketplace/components/globe-dashboard/) · [Finance tag](https://www.framer.com/marketplace/components/tags/finance/) | Property list to copy: tilt vs scale vs perspective vs orthographic. Globe Dashboard’s *vignette + glass panels + chart beside globe* is the Command composition. | Paid Framer lock-in. Cloud layer, city pulses, browser-chrome mock. Credit-card holographic rainbow ([CreditCard3DTilt](https://www.framer.com/marketplace/components/creditcard3dtilt/)). | **3** |
| 11 | **FinCommand: High-Density Financial DS** | Figma Community | [figma.com/community/file/1601618764327437537](https://www.figma.com/community/file/1601618764327437537/fincommand-high-density-financial-design-system) | Density, Inter + mono metrics, z-axis via blur **4–8px** not 40px. Data-grid hover, overlay stacking. Name even matches Command. | “Neon/Glass” as written. Deep navy + neon accents. SOC-operator cyan. | **3** |
| 12 | **Quant Order Book** + **Elenchev heatmap** | GitHub | [nssanta/quant-order-book](https://github.com/nssanta/quant-order-book) (Lightweight Charts + Canvas 2D heatmap) · [Elenchev/order-book-heatmap](https://github.com/Elenchev/order-book-heatmap) live: [elenchev.github.io/order-book-heatmap](https://elenchev.github.io/order-book-heatmap/) | **2D canvas** liquidity as weather-radar intensity. Bid/ask color = Meridian `--color-up` / `--color-down`. Time &amp; sales log beside the map. Worker + typed arrays if Tape ever streams L2. | Crypto-only branding, 5000-level WebSocket heat on NSE cash (we don’t have L2). “Classic / Binance” palettes. | **4** |
| 13 | **Is0tope 3D_order_book** + **Crypto-Orderbook-3d** | GitHub / R3F | [Is0tope/3D_order_book](https://github.com/Is0tope/3D_order_book) · [3303mavihS/Crypto-Orderbook-3d](https://github.com/3303mavihS/Crypto-Orderbook-3d) | How **not** to do Tape. Useful as a *Greeks optional* “explode this surface” lab, behind a toggle, never default. Instancing / fog / camera-rig lessons if we ever ship a research toy. | Default 3D book. Glowing explosion spheres. Full-window WebGLRenderer. | **2** |
| 14 | **Unicorn Studio Block River** | Public shader embed | [unicorn.studio/docs/example-projects](https://www.unicorn.studio/docs/example-projects/) — project `u8EWBwLXNmEjHHeTtQwX` | Dark, blocky, grainy, **tech not candy**. Mouse bulge at very low strength. Login / empty Research only, paused when tab hidden, `prefers-reduced-motion` → static poster. | Plasma, fire, rainbow matrix, meteor, fluted iridescence. Never behind live numbers. | **2** |
| 15 | **Rive Health Bar + data binding** | Rive | [React runtime](https://rive.app/docs/runtimes/react/react) · [Health bar quick start](https://rive.app/marketplace/24637-46037-health-bar-data-binding-quick-start/) · [Interactive badge](https://rive.app/blog/how-to-build-an-interactive-component-with-data-binding) | One `.riv` for Auto **heat / daily-loss / kill** as a bound gauge. View-model number in, animation out. Tiny canvas, 60 fps isolated from React re-renders. | Gamey gold/silver badges. Vehicles demo. Sound. Anything that looks “armed”. | **3** |

Honorable mentions (used in techniques, not scored as a “look”): [Motion](https://motion.dev) (`motion` package), [Number Flow](https://number-flow.barvian.me/), [TradingView lightweight-charts](https://github.com/tradingview/lightweight-charts), [Aceternity Tracing Beam](https://ui.aceternity.com/components/tracing-beam) / [Terminal](https://ui.aceternity.com/components/terminal), [Codrops CSS 3D scroll text](https://tympanus.net/codrops/2025/11/04/creating-3d-scroll-driven-text-animations-with-css-and-gsap/) (ignore as a product pattern), [Theatre.js + R3F](https://www.theatrejs.com) (too much editor for this desk), [Farm UI](https://github.com/Kinfe123/farm-ui) (Motion+shadcn blocks — steal layout, ignore marketing heroes), [Cult UI 3D Carousel](https://21st.dev/blog/cult-ui-components) (ignore as a desk widget).

---

## 3. Ranked “steal this” techniques

Ordered by **desk value / week-of-work**. Each sketch is libraries and constraints, not production code.

### 1. Cell flash on quote change — Tape, Command KPIs, header
**Steal from:** MarketLens “price flash” ([Keith-Munene/stock-dashboard](https://github.com/Keith-Munene/stock-dashboard)); Bloomberg color-of-tick; Linear “never animate layout”.
**Ignore:** Full-row scale, neon outlines.
**1-week:** CSS `@keyframes flash-up/flash-down` on `background-color` only, 280 ms, using `--color-up` / `--color-down` at **12%** mix. Drive via a `data-tick-dir` attribute set in the quote hydrator when `last` changes. `tabular-nums` stays put. Cap to **visible rows** (IntersectionObserver) so Tape doesn’t paint 600 flashes. Reduced-motion: skip animation, keep the static up/down color.

### 2. Header tape marquee — header
**Steal from:** Magic UI Marquee ([docs](https://magicui.design/docs/components/marquee)); CSS duplicate-track ticker ([getskyscraper writeup](https://getskyscraper.com/blog/css-stock-ticker-animation-scrolling-banner-tutorial-2026.html)).
**Ignore:** Logo parades, pause-on-hover *hiding* the Halt chip.
**1-week:** Pure CSS `animation: ticker 60s linear infinite` on a duplicated Nifty / BN / VIX / BTC / Gold / USDINR strip under the existing sticky header. `mask-image: linear-gradient` fade on both edges. `pauseOnHover`. Do **not** use Motion here — Linear says marquees are the one place `linear` easing is correct. Keep `position: sticky` header at `bg-bg/90 backdrop-blur-sm` as now.

### 3. CSS 3D tilt on four Command hero cards — Command
**Steal from:** Aceternity 3D Card ([docs](https://ui.aceternity.com/components/3d-card-effect)); Comet Card ([docs](https://ui.aceternity.com/components/comet-card)); vanilla-tilt max 6–8°.
**Ignore:** Tilt on Book table rows, Tape rows, Auto scan (jank + motion sickness).
**1-week:** Add `motion` (the Motion One / Framer successor already used by Aceternity/Magic). One `DeskTilt` wrapper: `perspective: 1200px`, `rotateX/Y` from pointer, spring `stiffness: 180, damping: 22`, **max 7°**, scale **1.0**. Specular: a `radial-gradient` at `--mx/--my` with opacity 0.06. **Numbers live in a non-tilted inner** (`transform: none` / no `translateZ`) so P&amp;L never shears. Disable if `hover: none` or reduced-motion. Apply only to Nifty, VIX, Paper P&amp;L, regime — not the 8-up grid.

### 4. First-paint number roll, not poll roll — Command, Book, Greeks
**Steal from:** Magic UI Number Ticker; better: [Number Flow](https://number-flow.barvian.me/) (`number-flow` / `@number-flow/react`) which is built for *continuous* values.
**Ignore:** Count-from-zero on every Auto 2.5s refetch.
**1-week:** Install `@number-flow/react`. On Command Stat: animate digits **only when the component mounts** or when `|Δ|` exceeds a threshold (e.g. 0.3% or ₹100). Subsequent 12s market / 2.5s paper ticks: snap or 120 ms digit-roll, no easing that lags the quote. `will-change: contents` not `transform`. Reduced-motion: instant set.

### 5. Animated list for fills and scan — Auto
**Steal from:** Magic UI Animated List ([docs](https://magicui.design/docs/components/animated-list)); Motion `AnimatePresence` + `layout`.
**Ignore:** Notification-toasts stacking over Halt.
**1-week:** `motion` + `AnimatePresence` on the latest paper fills. Enter: `opacity 0→1`, `y 8→0`, 180 ms `ease-out`. Exit: 120 ms. **Max 12 visible**, older rows unmount without animation. Keys = fill id, never array index. Do not layout-animate the 24-row scan table.

### 6. Cursor spotlight (CSS only) — Command cards, Research result cards
**Steal from:** React Bits SpotlightCard; Magic UI Magic Card.
**Ignore:** Full-page spotlight that follows the cursor across Tape.
**1-week:** One `onPointerMove` writing `--spot-x/y` CSS vars; `background: radial-gradient(220px circle at var(--spot-x) var(--spot-y), color-mix(in oklab, var(--color-fg) 8%, transparent), transparent 70%)`. No JS animation frame. Reduced-motion: static 0.04 wash.

### 7. Spatial popovers from the chip they belong to — header, Auto mode
**Steal from:** Linear “status popover scales out of the status pill” ([performance.dev](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown)).
**Ignore:** Center-screen modals for mode changes.
**1-week:** Radix (already in tree) + Motion `initial={{ scale: 0.96, opacity: 0 }}` with `transformOrigin` set to the triggering chip (Paper / Signals / Auto / Halt). Duration 120 ms in, 100 ms out. Halt confirm stays a real dialog (you already have `haltAsk`) — do not cute-ify a flatten.

### 8. Cobe globe as the **one** WebGL hero — Command
**Steal from:** [shuding/cobe](https://github.com/shuding/cobe) (Vercel/GitHub globe lineage); Magic UI Globe wrapper; Framer Globe Dashboard composition (globe **beside** stats, not under them).
**Ignore:** Full-viewport earth, city pulses, atmospheric clouds.
**1-week:** `cobe` + a 240×240 canvas in the regime / session card. `dark: 1`, `baseColor: [0.55, 0.56, 0.58]` (accent gray, not cyan), markers at Mumbai, Singapore, Chicago, UTC crypto. `phi += 0.003` only while `document.visibilityState === 'visible'` and the card intersects viewport. Destroy on unmount. **P&amp;L is never on the globe.** Reduced-motion: static PNG of the same frame.

### 9. 2D canvas depth heatmap — Tape (crypto / later NSE L2)
**Steal from:** Quant Order Book (Lightweight Charts + Canvas) and Elenchev heatmap. Color with `--color-up` / `--color-down`, rank-normalize intensity (Quant’s 5-step radar idea).
**Ignore:** Is0tope / R3F 3D bars; pressure-zone “explosion” spheres.
**1-week:** Behind a “Depth” toggle on Tape, crypto first (Binance already in the desk). `OffscreenCanvas` or a worker if fps drops. Sit **beside** the existing Recharts `PriceChart`, never replace the last-price column. If L2 is missing for NSE, ship a **synthetic** depth from spread + volume as a *visual sketch* labeled “illustrative, not a book”.

### 10. Heat / daily-loss ring — Auto
**Steal from:** Magic UI Animated Circular Progress ([docs](https://magicui.design/docs/components/animated-circular-progress-bar)); optional later: Rive health bar with data binding.
**Ignore:** Game HUD shields, pulsing “danger” neon when heat is fine.
**1-week:** SVG circle, `stroke-dashoffset` tween 200 ms on heat change. Colors: muted → warn (`#c4a46a`) → down (`#c45c4a`) only when gates trip. Center label is **plain mono** `heat 0.42 / 1.00`, not inside a 3D torus. SVG &gt; Rive for week 1; Rive only if design wants a crafted needle.

### 11. Tracing beam for Research pipeline — Research
**Steal from:** Aceternity Tracing Beam ([docs](https://ui.aceternity.com/components/tracing-beam)); Magic UI Animated Beam.
**Ignore:** Background meteors, Google-Gemini full-page effect.
**1-week:** A 2 px SVG path down the left of the query → universe → Grok → ranked list column. Beam length tracks scroll / run progress. Stroke `color-mix(in oklab, var(--color-fg) 35%, transparent)`. No glow blur &gt; 8 px. Reduced-motion: static ticks.

### 12. Terminal-style run log — Research, Auto
**Steal from:** Aceternity Terminal ([docs](https://ui.aceternity.com/components/terminal)); Magic UI Terminal. Typewriter for **run steps**, not for prices.
**Ignore:** Key-clack audio (`enableSound` default true on Aceternity — turn it off).
**1-week:** Reuse the desk’s existing copy voice (`Not an order`, `Kite stays off`). Animate only the log of a Research run or an Auto flatten: 18–24 ms/char, IBM Plex Mono, no rainbow syntax. Skip if the user has already seen the run.

### 13. Greeks as 2.5D stacked planes, not a WebGL surface — Greeks
**Steal from:** CSS `preserve-3d` + small `rotateX(8deg)` on a stack of expiry cards; Codrops [3D infinite carousel](https://tympanus.net/codrops/2025/11/11/building-a-3d-infinite-carousel-with-reactive-background-gradients/) *composition* (perspective on the stage, cards stay DOM). Figma 3D Market Profile is a **charting** idea, not a page theme ([TradingView script](https://www.tradingview.com/script/QdfnWDjO-3D-Market-Profile-BOSWaves/) — steal “row width = participation”, ignore extrusion).
**Ignore:** Three.js vol-surface meshes that hide Δ Γ ν Θ.
**1-week:** Each expiry is a `rounded-xl` card; hover lifts `translateY(-2px)` and `rotateX(4deg)`. Net greeks stay a 2D table above the stack. Optional later: a Plotly/Recharts contour, still 2D.

### 14. Active scale 0.98, color 120 ms — header nav, buttons
**Steal from:** Linear active scale 0.97–0.98, hover color 0.12 s; desk already uses `transition-colors duration-150` on nav.
**Ignore:** Magnetic buttons, tilt buttons ([Framer Custom Tilt Button](https://www.framer.com/marketplace/components/custom-tilt-button/)).
**1-week:** Tailwind `active:scale-[0.98] duration-100` on `Button` and nav chips. **No** scale on Halt (must feel like a physical kill, not a toy). Mode chips: background swap only.

### 15. Paper vs killed vs guest as motion states, not glows — header, Auto
**Steal from:** Rive/view-model thinking (enum drives timeline) without the file: CSS data-state.
**Ignore:** “Live armed” cyan pulse, trading-game “ready to fire”.
**1-week:** `data-desk="paper|signals|auto|killed|guest"`. Paper: no pulse. Auto: a **2px** muted breathing opacity on the Auto nav item only (2.4 s, 0.55↔0.85). Killed: freeze marquees, freeze globe, desaturate fills list 20%, Halt chip solid `--color-down`. Guest: no motion that implies control. Never pulse Paper P&amp;L.

### 16. Book row expand with layoutId — Book
**Steal from:** Motion `layout` / Aceternity Layout Grid; Fey “portfolio as a designed spreadsheet”.
**Ignore:** 3D card-flip to reveal a holding (hides the number mid-flip).
**1-week:** Click a holding → height animate the review (B/H/S + five-factor) with `overflow: hidden` and `grid-template-rows: 0fr → 1fr` (CSS, 200 ms ease-out). Numbers in the row do not move on the X axis.

### 17. Chart interaction, not chart decoration — Tape, Command
**Steal from:** Fey dual-chart drag-to-compare ([Brotzky thread](https://x.com/brotzky/status/1733177456293789978), Nivo under the hood); Recharts already in the repo (`src/components/price-chart.tsx`).
**Ignore:** Gradient-blob area fills, sparkle tooltips, 3D candles ([Sketchfab 3D chart](https://sketchfab.com/3d-models/3d-financial-trading-chart-interface-99c0b21d53a34e23be5d9bbce186bd0a) is illustration, not UI).
**1-week:** Crosshair + Δ% from mousedown origin, 2D overlay. Tooltip follows pointer with 40 ms lag. No animation of the series itself on each poll — `isAnimationActive={false}` on live Recharts (critical).

### 18. Stagger only on first Command paint — Command
**Steal from:** Linear list stagger ~20 ms; Linearity duration table 50–150 ms between items.
**Ignore:** 80 ms stagger × 12 cards = 1 s of waiting for P&amp;L.
**1-week:** `transition-delay: calc(var(--i) * 40ms)` on the 8 Command stats, opacity only, 180 ms, **once** per session (`sessionStorage`). Reduced-motion: all visible immediately.

---

## 4. Anti-patterns

Do not ship these, even if the references are pretty.

| Anti-pattern | Why it fails here | Typical source |
|--------------|-------------------|----------------|
| **Crypto-casino neon** (cyan #00F0FF, orange BTC, rainbow glare) | Reads as a perp DEX. Conflicts with `--color-accent: #c8ccd4` and “Kite off”. | Figma Stock Trader / CrypTrade kit ([file](https://www.figma.com/community/file/1566555329071317833)); Framer CreditCard3DTilt holographic rainbow; Magic UI neon-gradient-card / meteors / sparkles |
| **WebGL as theme** | Auto 2.5s + Tape rows + quotes hydrator will miss frames. Numbers in a shader are not selectable, not copyable, not accessible. | R3F 3D books ([Is0tope](https://github.com/Is0tope/3D_order_book), [Crypto-Orderbook-3d](https://github.com/3303mavihS/Crypto-Orderbook-3d)); NYSE Floor toy ([sivaram311/nyse-floor](https://github.com/sivaram311/nyse-floor)); Codrops [3D product grid](https://tympanus.net/codrops/2026/02/24/from-flat-to-spatial-creating-a-3d-product-grid-with-react-three-fiber/); Theatre.js+PlayCanvas dashboard |
| **Particles, sparkles, confetti, meteors** | Celebration language on a P&amp;L number is unethical on a paper desk that uses real-money vocabulary. | Magic UI Particles/Confetti/Meteors; Aceternity Background Beams With Collision; Unicorn plasma/fire |
| **3D that hides data** | Card-flip, MacBook-lid, cylinder-text, LED marquee orb: the value is off-screen or sheared. | Aceternity Macbook Scroll / 3D Marquee; Codrops [3D scroll text](https://tympanus.net/codrops/2025/11/04/creating-3d-scroll-driven-text-animations-with-css-and-gsap/); npm `3d-marquee` LED orb |
| **Count-up on every poll** | 2.5s Auto + 12s Command = perpetual slot-machine digits. Trader cannot trust the last figure. | Naive Magic UI Number Ticker on live quotes |
| **“Live / armed / ready” glow** | Implies Kite. Brand copy is explicit: *Live Kite stays disarmed.* | FinCommand neon; any pulse on Paper P&amp;L |
| **Tilt on dense tables** | 24 Tape rows × mouse-move = layout thrash and motion sickness. | vanilla-tilt applied to lists |
| **Lenis / heavy scroll-jacking** | This is an app, not a case-study site. Native scroll + sticky header already. | Codrops cinematic 3D scroll; Aceternity container-scroll |
| **Custom cursor / magnetic buttons** | Fights data selection (traders highlight numbers). | Magic UI Pointer; Framer tilt button |
| **Glass over text** | Fey’s own warning: realism vs utility. Blur &gt; 8px on `#0a0b0c` washes IBM Plex. | Generic glassmorphism dashboards ([Figma glass finance](https://www.figma.com/community/file/1314502385140716384)) |
| **Audio** | Aceternity Terminal key-clacks, Rive whooshes. A desk is silent unless the user asks. | Aceternity Terminal `enableSound` |

---

## 5. Top 8 recommendations (impact / cost)

Highest visual impact per engineer-day, given **no motion library today** and a 1-week first slice.

| Rank | Ship | Where | Impact | Cost | Why this order |
|------|------|-------|--------|------|----------------|
| **1** | **Motion tokens + cell flash + `isAnimationActive={false}` on live charts** | Global, Tape, Command | High | 1 day | Makes the desk feel live without 3D. Prevents Recharts from re-animating on every poll (the actual jank risk). |
| **2** | **Header CSS marquee** (Nifty · BN · VIX · BTC · Gold · USDINR) | Header | High | 0.5 day | Instant “terminal” read. Pure CSS, linear, pause on hover, respects reduced-motion. |
| **3** | **`DeskTilt` on 4 Command cards + CSS spotlight** | Command | High | 1.5 days | The 3D *spice*. CSS/Motion only, numbers not transformed. This is the hero. |
| **4** | **Number Flow with threshold gating** | Command stats, Book totals, Greeks nets | High | 1 day | First-paint craft; live ticks stay honest. |
| **5** | **AnimatePresence on Auto fills + heat SVG ring** | Auto | High | 1.5 days | Auto is the product. Fills arriving is the one motion an operator will notice at 1am. |
| **6** | **Linear-style popovers + Halt/killed freeze** | Header, Auto | Med-high | 1 day | Trust. Killed = motion stops. Mode grows from the chip. |
| **7** | **Cobe globe in the regime card** | Command | Med | 1.5 days | The single WebGL object. 5 KB. Pause off-screen. Skip if week is tight — tilt already sells depth. |
| **8** | **Tape depth heatmap (canvas 2D) behind a toggle** | Tape | Med | 2–3 days | Real microstructure craft for crypto now, NSE later. Do **not** do 3D books. |

**Explicitly not in the top 8:** R3F, Theatre.js, Spline scene ([21st.dev Spline](https://21st.dev) 942 saves — marketing hero, not a desk), Unicorn embeds on Command, Lottie, Lenis, Apple Cards Carousel, 3D credit cards.

**Library add list (keep short)**

| Add | Why | Do not add |
|-----|-----|------------|
| `motion` | One animation engine for tilt, presence, layout. Tree-shakeable. Used by Aceternity + Magic UI copy-pastes. | `framer-motion` *and* GSAP *and* anime |
| `@number-flow/react` | Live digits without slot-machine count-up | Wrapping every Stat in Magic NumberTicker |
| `cobe` (optional, rec 7) | 5 KB globe | `@react-three/fiber` + `@react-three/drei` |
| none for marquee / flash / spotlight | CSS | Unicorn runtime, Spline viewer |

Existing: `tw-animate-css`, `recharts`, `vaul`, `sonner`, Radix, Tailwind v4 — enough for recs 1, 2, 6, 8’s chrome.

---

## 6. Proposed motion system

Name it internally **Meridian Motion**. Put the tokens next to color in `@theme` when you implement (not done in this research pass).

### Durations

Borrowed from Linear’s published CSS ([performance.dev](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown)) and tightened for a trading surface.

| Token | Time | Use |
|-------|------|-----|
| `--motion-instant` | 0 ms | Halt confirm appear, killed freeze, quote **snap** when `|Δ|` is tiny |
| `--motion-quick` | **100 ms** | Hover color, `:active` scale, nav chip, button |
| `--motion-regular` | **180 ms** | Card enter, fill row, popover in, heat ring |
| `--motion-out` | **120 ms** | Popover out, flash fade, fill exit |
| `--motion-slow` | **280 ms** | First-paint number roll, Command stagger window, heatmap slice |
| `--motion-pulse` | **2400 ms** | Auto nav breathe only |
| **Hard cap** | **350 ms** | Nothing in the product UI is slower. Marketing-length 800 ms does not exist on this desk. |

Marquee period is **not** a UI duration: 45–60 s linear loop.

### Easings

| Token | Value | Use |
|-------|-------|-----|
| `--ease-out-desk` | `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out expo-ish) | Enters, popovers — Emil Kowalski: ease-out feels fast ([animations.dev](https://animations.dev/learn/animation-theory/the-easing-blueprint)) |
| `--ease-in-desk` | `cubic-bezier(0.32, 0, 0.67, 0)` | Exits |
| `--ease-color` | `ease` 100–150 ms | Background/color only |
| `--ease-linear` | `linear` | Marquee, heat-of-hold timers, progress that *means time* |
| **Spring (Motion only)** | `stiffness: 180, damping: 22, mass: 1` | Tilt return-to-flat. **Almost no overshoot.** |
| **Forbidden** | bounce, elastic, `ease-in` on enters | Makes the desk feel slow or playful |

### What may be 3D

| Allowed | How | Where |
|---------|-----|-------|
| CSS `perspective` + `rotateX/Y` ≤ **8°** | Motion or vanilla-tilt, pointer only, hover devices | Command 4 hero cards |
| Specular gradient (opacity ≤ 0.08) | CSS vars from pointer | Those same cards |
| `translateZ` on **labels/icons**, never on numbers | Aceternity `CardItem` pattern | Command, Research result chrome |
| One Cobe canvas ≤ 280 px | Pause off-screen / hidden tab / reduced-motion | Command regime card |
| CSS `rotateX(4–8°)` stacked expiry cards | Static 2.5D, hover lift | Greeks |
| Canvas **2D** heatmap | Worker if needed | Tape Depth toggle |

### What must stay 2D type / numbers

| Must stay 2D | Why |
|--------------|-----|
| All P&amp;L, last, qty, greeks, meta-prob, VIX, heat | Trust. Copy-paste. Screen readers. |
| Tape rows, Book table, Auto scan | Density. 2.5s updates. |
| Header Meridian wordmark | Display type is already the brand; don’t extrude it |
| Halt, mode chips, “Kite off”, “Not an order” | Legal/operator language |
| Recharts series while live | `isAnimationActive={false}` |
| Toasts (`sonner`) | Informational, not cinematic |

### Reduced motion (already partially shipped)

Keep the existing `src/styles.css` hammer. Additionally:

1. `useReducedMotion()` from Motion — skip tilt, globe `phi` increment, marquee, presence y-offset, number roll.
2. Flash → instant background, 0 ms.
3. Auto pulse → static badge.
4. Cobe → poster frame.
5. Heat ring → set `stroke-dashoffset` with no transition.

Never hide P&amp;L “inside” a scene that then collapses to a poster; the 2D number is the source of truth **always**, 3D is decoration beside it.

### Performance budget

| Surface | Budget |
|---------|--------|
| Command | ≤ 1 WebGL context (Cobe) **or** none |
| Tape | 0 WebGL. CSS flashes + optional 1 canvas 2D |
| Auto | 0 WebGL. SVG ring + 12 animated rows max |
| Book / Greeks / Research | 0 WebGL |
| Main thread | Pointer handlers write CSS vars, not React state, for tilt/spotlight |
| Polling | Never start a 300 ms tween that cannot be interrupted by the next tick |

### Paper-desk language in motion

- Paper mode: **still**. The only loops are marquee (market) and optional globe (geography).
- Auto mode: **one** quiet breath on the Auto nav item.
- Killed: **all loops stop**.
- Guest: **no** control-affordance animation (no mode-chip spring).
- No cyan, no “LIVE” badge animation, no outer glow on Paper P&amp;L.

---

## Appendix — current desk facts this report assumed

- Routes: Command `/`, Tape `/markets`, Book `/portfolio`, Auto `/auto`, Greeks `/greeks`, Research `/research`.
- Tokens: `--color-bg #0a0b0c`, `--color-up #3f8f6b`, `--color-down #c45c4a`, `--color-warn #c4a46a`, `--radius-xl: 24px`, fonts Instrument Serif / IBM Plex Sans / IBM Plex Mono (`src/styles.css`).
- Auto paper query `refetchInterval: 2500` (`src/routes/auto.tsx`); Command market 12 s, paper 2.5 s (`src/routes/index.tsx`).
- No 3D/motion dependencies in `package.json` besides `tw-animate-css`.

Remix the named OSS into Meridian’s tokens. Do not import their palettes.
