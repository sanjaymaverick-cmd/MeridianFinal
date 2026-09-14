import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const core = pathToFileURL(join(root, "../src/lib/meridian/research-rank-core.ts")).href;
const reasons = pathToFileURL(join(root, "../src/lib/meridian/reasons.ts")).href;
const kelly = pathToFileURL(join(root, "../src/lib/meridian/kelly.ts")).href;
const fo = pathToFileURL(join(root, "../src/lib/meridian/fo-contracts.ts")).href;

test("research rank answers the query; promotion copy is a verdict", () => {
  const src = `
    import { rankFromUniverse } from ${JSON.stringify(core)};
    import { explainReason } from ${JSON.stringify(reasons)};
    import { shouldPromote, PROMOTE_MIN_AUC, PROMOTE_MIN_HIT, PROMOTE_MIN_N } from ${JSON.stringify(kelly)};

    const book = [
      { symbol: "POLYCAB", name: "Polycab", sector: "Cables", quality: 7.8, sentiment: 7.8, themes: ["cables", "ai-data-center", "power"], thesis: "cables", assetClass: "equity" },
      { symbol: "KEI", name: "KEI", sector: "Cables", quality: 7.4, sentiment: 7.6, themes: ["cables", "ai-data-center"], thesis: "cables", assetClass: "equity" },
      { symbol: "SBIN", name: "SBI", sector: "BANKS", quality: 7.2, sentiment: 6, themes: ["banks"], thesis: "bank", assetClass: "equity" },
      { symbol: "TCS", name: "TCS", sector: "IT", quality: 9.1, sentiment: 5, themes: ["it-services"], thesis: "it", assetClass: "equity" },
      { symbol: "BTC", name: "Bitcoin", sector: "Crypto", quality: 8.4, sentiment: 7, themes: ["crypto", "delta"], thesis: "btc", assetClass: "crypto" },
      { symbol: "USDINR", name: "USDINR", sector: "FX", quality: 6, sentiment: 5, themes: ["forex"], thesis: "rupee", assetClass: "forex" },
      { symbol: "GOLD", name: "Gold", sector: "Commodity", quality: 7, sentiment: 6, themes: ["commodity", "gold"], thesis: "gold", assetClass: "commodity" },
    ];

    const spares = rankFromUniverse("Find me the best companies that supply spares and components to AI data centers", book);
    const syms = spares.names.map((n) => n.symbol);
    if (!syms.includes("POLYCAB") || !syms.includes("KEI")) throw new Error("spares " + syms.join(","));
    if (syms.includes("SBIN") || syms.includes("TCS")) throw new Error("banks leaked " + syms.join(","));

    const crypto = rankFromUniverse("Crypto names I can paper on Delta — BTC and ETH only if the tape is clean", book);
    if (!crypto.names.some((n) => n.symbol === "BTC")) throw new Error("crypto " + crypto.names.map((n) => n.symbol));
    if (crypto.names.some((n) => n.symbol === "TCS" || n.symbol === "SBIN")) throw new Error("crypto mixed");

    const fx = rankFromUniverse("USDINR and G10 dollar pairs as a rupee hedge", book);
    if (!fx.names.some((n) => n.symbol === "USDINR")) throw new Error("fx");

    const empty = rankFromUniverse("zzzzqwerty not a real sleeve", book);
    if (empty.names.length) throw new Error("empty should refuse");
    if (!empty.emptyNote) throw new Error("need empty note");

    const r = explainReason("farm:fade_short:live");
    if (!/paper quote/i.test(r)) throw new Error("reason should say paper quote: " + r);
    if (!/fade/i.test(r)) throw new Error("fade missing " + r);
    const paper = explainReason("farm:fade_short:paper");
    if (!/paper quote/i.test(paper)) throw new Error("paper tag should say paper quote: " + paper);
    if (!/fade/i.test(paper)) throw new Error("fade missing on paper " + paper);

    if (shouldPromote(8629, 0.548, "paper", 0.4)) throw new Error("should not promote");
    if (!shouldPromote(PROMOTE_MIN_N, PROMOTE_MIN_AUC, "paper", PROMOTE_MIN_HIT + 0.01)) throw new Error("clear gates should promote");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("auto/paper scan gates match execute: family, stale model, NSE hours", () => {
  const src = `
    import { openSkipReason } from ${JSON.stringify(fo)};
    import { explainReason } from ${JSON.stringify(reasons)};

    const book = [{ symbol: "BTC", sleeve: "farm" }];
    const opt = openSkipReason({
      symbol: "BTC 24AUG26 77000 CE",
      sleeve: "farm",
      feed: "binance-opt",
      delayed: false,
      openSession: false,
      positions: book,
    });
    if (opt !== "no_leverage") throw new Error("BTC option vs BTC spot: " + opt);

    const perp = openSkipReason({
      symbol: "BTCPERP",
      sleeve: "farm",
      feed: "binance-fut",
      openSession: false,
      positions: book,
    });
    if (perp !== "no_leverage") throw new Error("BTCPERP vs BTC: " + perp);

    const fam = openSkipReason({
      symbol: "BTC",
      sleeve: "farm",
      feed: "binance",
      openSession: false,
      positions: book,
    });
    if (fam !== "family_open") throw new Error("BTC vs BTC family: " + fam);

    const doge = openSkipReason({
      symbol: "DOGE",
      sleeve: "farm",
      feed: "binance",
      openSession: false,
      positions: book,
    });
    if (doge) throw new Error("DOGE should send overnight: " + doge);

    const nse = openSkipReason({
      symbol: "NIFTY 25AUG26 24500 CE",
      sleeve: "farm",
      feed: "nse-opt-model",
      delayed: true,
      openSession: false,
      positions: [],
    });
    if (nse !== "nse_session_closed") throw new Error("weekend NSE: " + nse);

    const stale = openSkipReason({
      symbol: "BTC 24AUG26 77000 CE",
      sleeve: "farm",
      feed: "crypto-opt-model",
      delayed: false,
      openSession: false,
      positions: [],
    });
    if (stale !== "stale_model") throw new Error("model crypto opt: " + stale);

    const liveOpt = openSkipReason({
      symbol: "BTC 24AUG26 77000 CE",
      sleeve: "farm",
      feed: "binance-opt",
      delayed: false,
      openSession: false,
      positions: [],
    });
    if (liveOpt !== "no_leverage") throw new Error("live binance opt should be spot-only: " + liveOpt);

    const text = explainReason("farm:family_open");
    if (!/already open/i.test(text)) throw new Error("family_open copy: " + text);
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const chips = readFileSync(join(root, "../src/lib/meridian/operator-copy.ts"), "utf8");
  assert.match(chips, /id: "auto" as const, label: "Auto-send"/);
});

test("boot paused Signals; paper fills tagged :paper; Halt/Reset need auth", () => {
  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  const desk = readFileSync(join(root, "../src/lib/server/desk.ts"), "utf8");
  const shell = readFileSync(join(root, "../src/components/desk-shell.tsx"), "utf8");
  const rev = engine.match(/const ENGINE_REV = (\d+)/);
  assert.ok(rev && Number(rev[1]) >= 21, "ENGINE_REV " + rev?.[1]);
  const empty = engine.slice(engine.indexOf("function emptyEngine"), engine.indexOf("function emptyEngine") + 400);
  assert.match(empty, /mode:\s*"advisory"/);
  assert.match(empty, /killed:\s*true/);
  assert.match(engine, /flatten_operator:\$\{pos\.side\}:paper/);
  assert.match(engine, /\$\{sleeve\}:\$\{reason\}:paper/);
  assert.match(engine, /\$\{intent\.reason\}:\$\{pos\.side\}:paper/);
  assert.match(engine, /\$\{sleeve\}:\$\{pos\.reasonOpen\}:paper/);
  assert.match(engine, /closeClipFields/);
  assert.match(engine, /economicLabel/);
  assert.match(engine, /reasonCloseFull/);
  assert.match(engine, /\$\{sleeve\}:\$\{skip \?\? row\.intent\.reason\}:paper/);
  assert.doesNotMatch(engine, /:live`/);
  assert.doesNotMatch(engine, /flatten_operator:[^`]*:live/);
  assert.doesNotMatch(engine, /reason: `\$\{sleeve\}:\$\{skip \?\? row\.intent\.reason}`/);

  assert.match(shell, /Resume paper/);
  assert.doesNotMatch(shell, /\bArm\b/);
  const flags = desk.slice(desk.indexOf("export const setPaperFlags"), desk.indexOf("export const resetPaperBook"));
  const reset = desk.slice(desk.indexOf("export const resetPaperBook"), desk.indexOf("export const getPaperSamples"));
  assert.match(flags, /authMiddleware/);
  assert.match(reset, /authMiddleware/);
  assert.match(desk, /runPaperOp[\s\S]{0,80}authMiddleware/);
});

test("Auto fills crypto spot core only; Pause still exits; cash/F&O/MCX do not fill", () => {
  const src = `
    import { openSkipReason } from ${JSON.stringify(fo)};
    const FARM_CORE = ["BTC", "ETH", "SOL", "BNB"];
    const FARM_TAIL = ["XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT", "LTC", "BCH", "NEAR", "SUI", "AAVE", "UNI", "ATOM", "FIL", "APT", "ARB", "OP", "INJ", "TIA", "SEI", "PEPE", "WIF", "BONK", "RENDER", "FET", "TAO", "PAXG"];
    const CASH_WATCH = ["HDFCBANK", "ICICIBANK", "RELIANCE", "TCS", "INFY", "LT", "POLYCAB"];
    const COMMODITY_WATCH = ["GOLD", "SILVER", "CRUDE", "COPPER", "NATGAS"];
    function farmBucket(sym) {
      const u = String(sym).toUpperCase();
      if (FARM_CORE.includes(u)) return "core";
      if (FARM_TAIL.includes(u)) return "tail";
      return "other";
    }
    function autoCanSend(mode, killed) { return mode === "auto" && !killed; }
    function autoOpenSkip(args) {
      const skip = openSkipReason(args);
      if (skip) return skip;
      if (args.sleeve === "pnl") return null;
      const bucket = farmBucket(args.symbol);
      if (bucket === "other") return "universe_filter";
      if (bucket === "tail" && !args.farmTail) return "tail_off";
      return null;
    }

    if (!FARM_CORE.includes("BTC") || farmBucket("BTC") !== "core") throw new Error("core BTC");
    if (farmBucket("XRP") !== "tail") throw new Error("tail XRP");
    if (CASH_WATCH.includes("GOLD") || CASH_WATCH.includes("NIFTYFUT") || CASH_WATCH.includes("CRUDE") || CASH_WATCH.includes("USDINR")) {
      throw new Error("CASH_WATCH must be NSE cash only");
    }
    if (!COMMODITY_WATCH.includes("GOLD") || !COMMODITY_WATCH.includes("CRUDE")) throw new Error("commodity watch");

    const base = { sleeve: "farm", feed: "binance", delayed: false, openSession: false, positions: [], farmTail: false };
    const btc = autoOpenSkip({ ...base, symbol: "BTC" });
    if (btc) throw new Error("Auto+BTC should open: " + btc);
    const xrp = autoOpenSkip({ ...base, symbol: "XRP" });
    if (xrp !== "tail_off") throw new Error("tail off: " + xrp);
    const xrpOn = autoOpenSkip({ ...base, symbol: "XRP", farmTail: true });
    if (xrpOn) throw new Error("tail on should open: " + xrpOn);

    const blocked = new Set(["nse_session_closed", "no_leverage", "universe_filter", "stale_model", "tail_off"]);
    const nifty = autoOpenSkip({ ...base, symbol: "NIFTYFUT", feed: "nse-opt-model", openSession: true });
    if (!blocked.has(nifty ?? "")) throw new Error("NIFTYFUT fill: " + nifty);
    const rel = autoOpenSkip({ ...base, symbol: "RELIANCE", feed: "yahoo", openSession: true });
    if (!blocked.has(rel ?? "")) throw new Error("RELIANCE fill: " + rel);
    const gold = autoOpenSkip({ ...base, symbol: "GOLD", feed: "yahoo", openSession: true });
    if (!blocked.has(gold ?? "")) throw new Error("GOLD fill: " + gold);

    if (autoCanSend("auto", true)) throw new Error("paused must not open");
    if (!autoCanSend("auto", false)) throw new Error("Auto unkilled should send");
    if (autoCanSend("paper", false)) throw new Error("Paper must wait for Approve — not auto-send");
    if (autoCanSend("advisory", false)) throw new Error("Signals must not auto-send");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /autoCanSend\(eng\.mode, eng\.killed\)/);
  assert.doesNotMatch(engine, /if \(halted && !staleCrypto/);
  const watches = readFileSync(join(root, "../src/lib/meridian/paper-watch.ts"), "utf8");
  assert.match(watches, /mode === "auto" && !killed/);
  assert.doesNotMatch(watches, /mode === "auto" \|\| mode === "paper"/);
  assert.match(watches, /CASH_WATCH = \["HDFCBANK", "ICICIBANK", "RELIANCE", "TCS", "INFY", "LT", "POLYCAB"\]/);
  assert.match(watches, /COMMODITY_WATCH = \["GOLD"/);
  assert.match(watches, /"TRX"/);
  assert.match(watches, /"HBAR"/);
  assert.match(watches, /"TON"/);
  assert.match(watches, /"POL"/);
  assert.match(watches, /"SHIB"/);
  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");
  assert.match(autoPage, /actionCenterBlurb/);
  const chips = readFileSync(join(root, "../src/lib/meridian/operator-copy.ts"), "utf8");
  assert.match(chips, /Crypto spot farm/);
  assert.match(chips, /crypto spot only/i);
});

test("IMP-10 Action Center: Approve / Skip / Size; 15s auto-skip labelled; Flatten-one; Paper not auto-send", () => {
  const copyPath = join(root, "../src/lib/meridian/operator-copy.ts");
  const watchPath = join(root, "../src/lib/meridian/paper-watch.ts");
  const copyBody = readFileSync(copyPath, "utf8")
    .replace('from "./kelly"', `from ${JSON.stringify(kelly)}`)
    .replace(/export \{ explainReason \} from "\.\/reasons";\s*/, "");
  const watchBody = readFileSync(watchPath, "utf8")
    .replace('from "./fo-contracts"', `from ${JSON.stringify(fo)}`);
  const src = copyBody + "\n" + watchBody + `
    if (PAPER_AUTO_SKIP_SEC !== 15) throw new Error("15s auto-skip: " + PAPER_AUTO_SKIP_SEC);
    if (autoSkipLabel(15) !== "Auto-skip 15s") throw new Error(autoSkipLabel(15));
    if (autoSkipLabel(0.2) !== "Auto-skip 1s") throw new Error(autoSkipLabel(0.2));
    if (autoSkipLabel(0) !== "Auto-skip 0s") throw new Error(autoSkipLabel(0));

    const q = suggestedQty(100, 0.015);
    if (q !== 150) throw new Error("suggestedQty " + q);
    const ladder = sizeLadder(q);
    if (ladder.length !== 3) throw new Error("size ladder");
    if (ladder[0].label !== "½" || ladder[1].label !== "1×" || ladder[2].label !== "1½") throw new Error("labels");
    if (ladder[0].qty !== 75 || ladder[1].qty !== 150 || ladder[2].qty !== 225) throw new Error(JSON.stringify(ladder));

    const paperBlurb = actionCenterBlurb("paper", false);
    if (!/Approve \\/ Skip \\/ Size/i.test(paperBlurb) || !/15s auto-skip/i.test(paperBlurb) || !/Flatten one/i.test(paperBlurb)) {
      throw new Error("paper blurb: " + paperBlurb);
    }
    if (/sending crypto/i.test(paperBlurb)) throw new Error("paper must not auto-send in copy");

    if (autoCanSend("paper", false)) throw new Error("paper must not auto-send");
    if (!autoCanSend("auto", false)) throw new Error("auto should send");
    if (autoCanSend("auto", true)) throw new Error("paused auto");
  `;
  const dir = mkdtempSync(join(tmpdir(), "imp10-"));
  const file = join(dir, "action-center.ts");
  writeFileSync(file, src);
  const r = spawnSync(process.execPath, ["--experimental-strip-types", file], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /const ENGINE_REV = (3[6-9]|[4-9]\d)/);
  assert.match(engine, /proposeOnly = \(eng\.mode === "advisory" \|\| eng\.mode === "paper"\)/);
  assert.match(engine, /pending: !skip && proposeOnly/);

  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");
  assert.match(autoPage, /data-action-center/);
  assert.match(autoPage, /data-approve/);
  assert.match(autoPage, /data-skip/);
  assert.match(autoPage, /data-size-control/);
  assert.match(autoPage, /data-auto-skip/);
  assert.match(autoPage, /PAPER_AUTO_SKIP_SEC/);
  assert.match(autoPage, /autoSkipLabel/);
  assert.match(autoPage, /Flatten one/);
  assert.match(autoPage, /data-flatten-one/);
  assert.match(autoPage, /mode === "paper"/);
  assert.doesNotMatch(autoPage, /Paper is sending crypto spot/);

  const chips = readFileSync(copyPath, "utf8");
  assert.match(chips, /Approve \/ Skip \/ Size\. 15s auto-skip/);
});

test("IMP-01 identity strip: MOCK ₹, mode, ENGINE ON|PAUSED, KITE DISARMED", () => {
  const idPath = pathToFileURL(join(root, "../src/lib/meridian/identity-strip.ts")).href;
  const src = `
    import { deskIdentityStrip, deskIdentityStripText } from ${JSON.stringify(idPath)};

    const cases = [
      { mode: "advisory", killed: true, modeLabel: "Signals", engine: "ENGINE PAUSED" },
      { mode: "advisory", killed: false, modeLabel: "Signals", engine: "ENGINE ON" },
      { mode: "paper", killed: false, modeLabel: "Paper", engine: "ENGINE ON" },
      { mode: "paper", killed: true, modeLabel: "Paper", engine: "ENGINE PAUSED" },
      { mode: "auto", killed: false, modeLabel: "Auto-send", engine: "ENGINE ON" },
      { mode: "auto", killed: true, modeLabel: "Auto-send", engine: "ENGINE PAUSED" },
    ];
    for (const c of cases) {
      const s = deskIdentityStrip({ mode: c.mode, killed: c.killed });
      if (s.mock !== "MOCK ₹") throw new Error("mock " + s.mock);
      if (!/MOCK/.test(s.mock) || !/₹/.test(s.mock)) throw new Error("mock rupee");
      if (s.mode !== c.modeLabel) throw new Error("mode " + c.mode + " -> " + s.mode);
      if (s.engine !== c.engine) throw new Error("engine " + s.engine);
      if (s.kite !== "KITE DISARMED") throw new Error("kite " + s.kite);
      if (/\\blive\\b/i.test(s.mode) || s.kite !== "KITE DISARMED") throw new Error("live/armed leak " + JSON.stringify(s));
      const text = deskIdentityStripText({ mode: c.mode, killed: c.killed });
      if (!text.includes("MOCK ₹") || !text.includes(c.modeLabel) || !text.includes(c.engine) || !text.includes("KITE DISARMED")) {
        throw new Error("text " + text);
      }
    }

    const live = deskIdentityStrip({ mode: "live", killed: false });
    if (live.mode === "Live" || /live/i.test(live.mode)) throw new Error("must not show Live: " + live.mode);
    if (live.kite !== "KITE DISARMED") throw new Error("kite always disarmed");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const shell = readFileSync(join(root, "../src/components/desk-shell.tsx"), "utf8");
  assert.match(shell, /deskIdentityStrip/);
  assert.match(shell, /data-identity-strip/);
  assert.match(shell, /identity\.mock/);
  assert.match(shell, /identity\.engine/);
  assert.match(shell, /identity\.kite/);
  assert.match(shell, /Resume paper/);
  assert.doesNotMatch(shell, /\bArm\b/);
  const chips = readFileSync(join(root, "../src/lib/meridian/operator-copy.ts"), "utf8");
  assert.match(chips, /id: "auto" as const, label: "Auto-send"/);
  const idSrc = readFileSync(join(root, "../src/lib/meridian/identity-strip.ts"), "utf8");
  assert.match(idSrc, /MOCK ₹/);
  assert.match(idSrc, /Auto-send/);
  assert.match(idSrc, /KITE DISARMED/);
  assert.match(idSrc, /ENGINE PAUSED/);
});

test("IMP-04 kill split: Pause does not flatten; exits still run; Flatten+Reset confirm", () => {
  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  const shell = readFileSync(join(root, "../src/components/desk-shell.tsx"), "utf8");
  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");

  const flags = engine.slice(engine.indexOf("export function setEngineFlags"), engine.indexOf("export function resetEngine"));
  assert.match(flags, /if \(patch\.killed != null\) e\.killed = patch\.killed/);
  assert.doesNotMatch(flags, /flatten/i);
  assert.doesNotMatch(flags, /positions\s*=\s*\[\]/);

  assert.match(engine, /intent = manage\(/);
  assert.doesNotMatch(engine, /if\s*\(\s*eng\.killed\s*\)\s*[^{]*manage\(/);
  assert.doesNotMatch(engine, /if\s*\(\s*!eng\.killed\s*\)\s*\{[^}]*manage\(/);
  assert.match(engine, /autoCanSend\(eng\.mode, eng\.killed\)/);
  const manageIdx = engine.indexOf("intent = manage(");
  const killedGateBeforeManage = engine.lastIndexOf("if (eng.killed", manageIdx);
  assert.ok(killedGateBeforeManage < 0 || manageIdx - killedGateBeforeManage > 800, "manage must not be gated on eng.killed");

  assert.match(shell, /flattenAsk/);
  assert.match(shell, /Confirm flatten/);
  assert.match(shell, /setFlattenAsk\(true\)/);
  assert.doesNotMatch(shell, /onClick=\{\(\) => void paperSend\(\{ type: "flatten_all" \}\)\}/);
  assert.match(shell, /Open clips stay/);
  assert.match(shell, /exits still run/i);
  assert.doesNotMatch(shell, /Stops pause/);

  assert.match(autoPage, /resetAsk/);
  assert.match(autoPage, /Confirm reset/);
  assert.match(autoPage, /setResetAsk\(true\)/);
  assert.match(autoPage, /exits still run/i);
});

test("IMP-07 META copy: n/a not 0%; Factor Buy not model-backed; two ledgers named", () => {
  const book = readFileSync(join(root, "../src/routes/portfolio.tsx"), "utf8");
  assert.match(book, /n\/a — not promoted/);
  assert.match(book, /promoted \? `\$\{\(r\.metaProb \* 100\)\.toFixed\(0\)\}%` : "n\/a — not promoted"/);
  assert.match(book, /Factor \$\{r\.action\}/);
  assert.match(book, /Paper clips/);
  assert.match(book, /\bHoldings\b/);
  assert.match(book, /Imported Zerodha CSV is a second tab/);
  assert.match(book, /do not add size on meta/);
  const advice = readFileSync(join(root, "../src/lib/meridian/advice.ts"), "utf8");
  assert.match(advice, /Do not treat Book Buy as model-backed/);
  // meta-0.55 cash-work copy only on the promoted arm of each ternary
  const elev = advice.slice(advice.indexOf('regime === "Elevated"'), advice.indexOf("} else {"));
  const calm = advice.slice(advice.lastIndexOf("} else {"));
  assert.match(elev, /promoted\s*\?\s*"Tape is two-sided\.[\s\S]*0\.55[\s\S]*:\s*"Tape is two-sided, but the paper model is not promoted/);
  assert.match(calm, /promoted\s*\?\s*"Calm regime\.[\s\S]*0\.55[\s\S]*:\s*"Calm tape, but the paper model is not promoted/);
  assert.match(advice, /meta above 0\.55/);
  assert.match(advice, /meta-prob is above 0\.55/);

  const copy = readFileSync(join(root, "../src/lib/meridian/operator-copy.ts"), "utf8");
  assert.match(copy, /treat Book Buy as model-backed/);
  assert.match(copy, /Ignore Command cash advice that assumes a 0\.55 meta gate/);

  // runtime: unpromoted Calm advice must not pitch the 0.55 gate
  const adviceUrl = pathToFileURL(join(root, "../src/lib/meridian/advice.ts")).href;
  const src = `
    import { buildAdvice } from ${JSON.stringify(adviceUrl)};
    const base = {
      nifty: 25000, niftyChg: 0, bankNifty: 52000, bankChg: 0, indiaVix: 12, pcr: 1,
      btc: 100000, btcChg: 0, gold: 70000, goldChg: 0, usdinr: 84, usdinrChg: 0,
      crude: 70, crudeChg: 0, regime: "Calm", session: "open", asOf: Date.now(), source: "test",
    };
    const off = buildAdvice(base, { promoted: false });
    const spotOff = off.find((c) => c.id === "spot-1");
    if (!spotOff || /0\.55/.test(spotOff.body) || !/model-backed/i.test(spotOff.body)) {
      throw new Error("Calm unpromoted: " + spotOff?.body);
    }
    const on = buildAdvice(base, { promoted: true });
    const spotOn = on.find((c) => c.id === "spot-1");
    if (!spotOn || !/0\.55/.test(spotOn.body)) throw new Error("Calm promoted: " + spotOn?.body);
    const elevOff = buildAdvice({ ...base, regime: "Elevated" }, { promoted: false }).find((c) => c.id === "spot-1");
    if (!elevOff || /0\.55/.test(elevOff.body) || !/model-backed/i.test(elevOff.body)) {
      throw new Error("Elevated unpromoted: " + elevOff?.body);
    }
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("IMP-09 promotion verdict strip: gates actual vs required; quality vs 90s; English next", () => {
  const copyPath = join(root, "../src/lib/meridian/operator-copy.ts");
  const copyBody = readFileSync(copyPath, "utf8")
    .replace('from "./kelly"', `from ${JSON.stringify(kelly)}`)
    .replace(/export \{ explainReason \} from "\.\/reasons";\s*/, "");
  const src = copyBody + `
    const empty = promotionVerdict(undefined);
    if (empty.ready) throw new Error("empty should not be ready");
    if (!empty.next || empty.next.length < 12) throw new Error("english next: " + empty.next);
    if (!/farm sleeve on paper/i.test(empty.next)) throw new Error("next action: " + empty.next);
    if (!/quality holds/i.test(empty.holds) || !/90s time-stops/i.test(empty.holds)) {
      throw new Error("holds: " + empty.holds);
    }

    const by = Object.fromEntries(empty.gates.map((g) => [g.label, g]));
    for (const label of ["Sample count", "AUC", "Hit rate", "Source"]) {
      if (!by[label]) throw new Error("missing gate " + label);
    }
    if (by["Sample count"].pass) throw new Error("n should fail");
    if (!by["Sample count"].detail.includes(String(PROMOTE_MIN_N)) && !by["Sample count"].detail.includes("2,000") && !by["Sample count"].detail.includes("2,00")) {
      throw new Error("n actual vs required: " + by["Sample count"].detail);
    }
    if (by["AUC"].pass || !by["AUC"].detail.includes(PROMOTE_MIN_AUC.toFixed(2))) {
      throw new Error("auc actual vs required: " + by["AUC"].detail);
    }
    if (by["Hit rate"].pass || !/52/.test(by["Hit rate"].detail)) {
      throw new Error("hit actual vs required: " + by["Hit rate"].detail);
    }
    if (by["Source"].pass || !/synth/i.test(by["Source"].detail)) throw new Error("source: " + by["Source"].detail);

    const missingHit = promotionVerdict({ n: 2500, auc: 0.6, promoted: true, source: "paper", timeStopN: 1800, qualityHoldN: 200 });
    if (missingHit.ready) throw new Error("missing hitRate must default 0 and block");
    const hitG = missingHit.gates.find((g) => g.label === "Hit rate");
    if (!hitG || hitG.pass || !hitG.detail.startsWith("0%")) throw new Error("missing hit: " + hitG?.detail);
    if (!/200/.test(missingHit.holds) || !/1,800|1800/.test(missingHit.holds)) throw new Error("holds counts: " + missingHit.holds);

    const clear = promotionVerdict({
      n: PROMOTE_MIN_N,
      auc: PROMOTE_MIN_AUC,
      hitRate: PROMOTE_MIN_HIT + 0.01,
      promoted: true,
      source: "paper",
      timeStopN: 400,
      qualityHoldN: 1600,
    });
    if (!clear.ready) throw new Error("clear gates should be ready");
    if (!clear.gates.every((g) => g.pass)) throw new Error("all gates pass: " + JSON.stringify(clear.gates));
    if (!/Kite stays off/i.test(clear.next)) throw new Error("ready next: " + clear.next);
    if (!/1,600|1600/.test(clear.holds) || !/400/.test(clear.holds)) throw new Error("ready holds: " + clear.holds);
    if (!/quality holds/i.test(clear.holds)) throw new Error("ready holds missing");

    const synth = promotionVerdict({ n: PROMOTE_MIN_N, auc: 0.9, hitRate: 0.9, promoted: true, source: "synth", timeStopN: 0, qualityHoldN: 0 });
    if (synth.ready) throw new Error("synth must not promote");
    if (!/source/i.test(synth.body)) throw new Error("synth blocker: " + synth.body);
  `;
  const dir = mkdtempSync(join(tmpdir(), "imp09-"));
  const file = join(dir, "verdict.ts");
  writeFileSync(file, src);
  const r = spawnSync(process.execPath, ["--experimental-strip-types", file], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const index = readFileSync(join(root, "../src/routes/index.tsx"), "utf8");
  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");
  const strip = readFileSync(join(root, "../src/components/promotion-strip.tsx"), "utf8");
  assert.match(index, /import \{ PromotionStrip \} from "@\/components\/promotion-strip"/);
  assert.match(index, /<PromotionStrip meta=\{paper\.data\?\.meta\} \/>/);
  assert.doesNotMatch(index, /PromotionChip/);
  assert.match(autoPage, /import \{ PromotionStrip \} from "@\/components\/promotion-strip"/);
  assert.match(autoPage, /<PromotionStrip meta=\{paper\.data\?\.meta\} \/>/);
  assert.doesNotMatch(autoPage, /PromotionChip/);
  assert.match(strip, /data-promotion-strip/);
  assert.match(strip, /data-promotion-holds/);
  assert.match(strip, /data-promotion-next/);
  assert.match(strip, /Next: \{v\.next\}/);
  assert.match(strip, /\{v\.holds\}/);
  assert.match(strip, /gates\.map/);
  const copy = readFileSync(copyPath, "utf8");
  assert.match(copy, /quality holds \(≥5 min\) vs/);
  assert.match(copy, /90s time-stops/);
  assert.match(copy, /Keep the farm sleeve on paper/);
});

test("IMP-11 Signals tape: Would BUY/SELL not sent; last scan refreshes; no new fills", () => {
  const copyPath = join(root, "../src/lib/meridian/operator-copy.ts");
  const copyBody = readFileSync(copyPath, "utf8")
    .replace('from "./kelly"', `from ${JSON.stringify(kelly)}`)
    .replace(/export \{ explainReason \} from "\.\/reasons";\s*/, "");
  const src = copyBody + `
    if (wouldActionLabel("BUY", "advisory") !== "Would BUY") throw new Error("would buy");
    if (wouldActionLabel("SELL", "advisory") !== "Would SELL") throw new Error("would sell");
    if (wouldActionLabel("BUY", "paper") !== "BUY") throw new Error("paper buy");
    if (wouldActionLabel("FLAT", "advisory") !== "FLAT") throw new Error("flat");
    if (signalsCanApprove("advisory")) throw new Error("Signals must not Approve");
    if (!signalsCanApprove("paper")) throw new Error("Paper may Approve");
    if (signalsCanApprove("auto")) throw new Error("Auto has no Approve ladder");

    const blurb = actionCenterBlurb("advisory", false);
    if (!/Would BUY \\/ Would SELL/i.test(blurb) || !/not sent/i.test(blurb)) throw new Error("blurb would: " + blurb);
    if (!/Last scan still refreshes/i.test(blurb)) throw new Error("blurb scan: " + blurb);
    if (!/No new fills/i.test(blurb)) throw new Error("blurb fills: " + blurb);
    if (/Approve opens a paper clip/i.test(blurb)) throw new Error("Signals must not open on Approve");
  `;
  const dir = mkdtempSync(join(tmpdir(), "imp11-"));
  const file = join(dir, "signals-tape.ts");
  writeFileSync(file, src);
  const r = spawnSync(process.execPath, ["--experimental-strip-types", file], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /const ENGINE_REV = (3[7-9]|[4-9]\d)/);
  assert.match(engine, /error: "signals_propose_only"/);
  assert.match(engine, /e\.mode === "advisory"/);
  assert.match(engine, /autoCanSend\(eng\.mode, eng\.killed\)/);

  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");
  assert.match(autoPage, /data-signals-tape/);
  assert.match(autoPage, /data-last-scan/);
  assert.match(autoPage, /Last scan/);
  assert.match(autoPage, /wouldActionLabel/);
  assert.match(autoPage, /signalsCanApprove/);
  assert.match(autoPage, /lastTick/);
  assert.doesNotMatch(autoPage, /showApprove = actionable && \(mode === "advisory" \|\| mode === "paper"\)/);

  const watches = readFileSync(join(root, "../src/lib/meridian/paper-watch.ts"), "utf8");
  assert.match(watches, /mode === "auto" && !killed/);
});
