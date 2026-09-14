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

test("IMP-12 Fill tape: one timestamp; sleeve; quote source English not live", () => {
  const copyPath = join(root, "../src/lib/meridian/operator-copy.ts");
  const copyBody = readFileSync(copyPath, "utf8")
    .replace('from "./kelly"', `from ${JSON.stringify(kelly)}`)
    .replace(/export \{ explainReason \} from "\.\/reasons";\s*/, "");
  const reasonsBody = readFileSync(join(root, "../src/lib/meridian/reasons.ts"), "utf8");
  const src = reasonsBody + "\n" + copyBody + `
    if (quoteSourceEnglish("live") !== "not delayed last") throw new Error("live→ " + quoteSourceEnglish("live"));
    if (/\\blive\\b/i.test(quoteSourceEnglish("live"))) throw new Error("must not say live");
    if (quoteSourceEnglish("delayed") !== "delayed quote") throw new Error(quoteSourceEnglish("delayed"));
    if (quoteSourceEnglish("model") !== "model quote") throw new Error(quoteSourceEnglish("model"));
    if (quoteSourceEnglish(undefined) !== "not delayed last") throw new Error("missing");
    if (sleeveEnglish("farm") !== "Farm") throw new Error(sleeveEnglish("farm"));
    if (sleeveEnglish("pnl") !== "PnL") throw new Error(sleeveEnglish("pnl"));
    if (sleeveEnglish("pred") !== "Pred") throw new Error(sleeveEnglish("pred"));
    if (sleeveEnglish(undefined) !== "Farm") throw new Error("default sleeve");

    const reason = explainReason("farm:fade_short:paper");
    if (/\\blive\\b/i.test(reason)) throw new Error("reason paints live: " + reason);
    if (!/fade/i.test(reason)) throw new Error(reason);
  `;
  const dir = mkdtempSync(join(tmpdir(), "imp12-"));
  const file = join(dir, "fill-tape.ts");
  writeFileSync(file, src);
  const r = spawnSync(process.execPath, ["--experimental-strip-types", file], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const store = readFileSync(join(root, "../src/lib/desk-store.ts"), "utf8");
  assert.match(store, /quoteLabel\?: "live" \| "delayed" \| "model"/);
  assert.match(store, /sleeve\?: "farm" \| "pnl" \| "pred"/);

  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");
  assert.match(autoPage, /data-fill-tape/);
  assert.match(autoPage, /data-fill-ts/);
  assert.match(autoPage, /data-fill-sleeve/);
  assert.match(autoPage, /data-quote-source/);
  assert.match(autoPage, /quoteSourceEnglish\(f\.quoteLabel\)/);
  assert.match(autoPage, /sleeveEnglish\(f\.sleeve\)/);
  const tape = autoPage.slice(autoPage.indexOf("data-fill-tape"), autoPage.indexOf("Other scan rows"));
  const stamps = tape.match(/formatIstStamp\(f\.ts\)/g) || [];
  assert.equal(stamps.length, 1, "one timestamp on fill tape row, got " + stamps.length);
  assert.doesNotMatch(tape, /@ \{f\.price\.toFixed\(2\)\} <span[^>]*>\{formatIstStamp/);

  const cmd = readFileSync(join(root, "../src/routes/index.tsx"), "utf8");
  assert.match(cmd, /data-fill-ts/);
  assert.match(cmd, /data-fill-sleeve/);
  assert.match(cmd, /data-quote-source/);
  assert.match(cmd, /quoteSourceEnglish\(f\.quoteLabel\)/);
  const cmdFills = cmd.slice(cmd.indexOf("Latest paper fills"), cmd.indexOf("function Stat"));
  const cmdStamps = cmdFills.match(/formatIstStamp\(f\.ts\)/g) || [];
  assert.equal(cmdStamps.length, 1, "Command fills one timestamp");

  const copy = readFileSync(copyPath, "utf8");
  assert.match(copy, /not delayed last/);
  assert.doesNotMatch(copy, /QuoteLabelUi = "last"/);
});


test("IMP-13 Advice + Greeks: (not an order); hedge row is a review", () => {
  const copyPath = join(root, "../src/lib/meridian/operator-copy.ts");
  const copyBody = readFileSync(copyPath, "utf8")
    .replace('from "./kelly"', `from ${JSON.stringify(kelly)}`)
    .replace(/export \{ explainReason \} from "\.\/reasons";\s*/, "");
  const reasonsBody = readFileSync(join(root, "../src/lib/meridian/reasons.ts"), "utf8");
  const adviceHref = pathToFileURL(join(root, "../src/lib/meridian/advice.ts")).href;
  const greeksHref = pathToFileURL(join(root, "../src/lib/meridian/greeks.ts")).href;
  const scoringHref = pathToFileURL(join(root, "../src/lib/meridian/scoring.ts")).href;

  // Helpers alone (no deep advice import graph)
  const helperSrc = reasonsBody + "\n" + copyBody + `
    if (NOT_AN_ORDER !== "(not an order)") throw new Error("const " + NOT_AN_ORDER);
    if (endWithNotAnOrder("Cut beta.") !== "Cut beta. (not an order)") throw new Error(endWithNotAnOrder("Cut beta."));
    if (endWithNotAnOrder("Cut beta. Not an order.") !== "Cut beta. (not an order)") throw new Error("idempotent Not");
    if (endWithNotAnOrder("Cut beta. (not an order)") !== "Cut beta. (not an order)") throw new Error("idempotent paren");
    if (hedgeReviewLots(-1) !== "review hedge -1.0") throw new Error(hedgeReviewLots(-1));
    if (hedgeReviewLots(0) !== "review hedge 0.0") throw new Error(hedgeReviewLots(0));
    if (!/^review hedge /.test(hedgeReviewLots(1.5))) throw new Error("prefix");
  `;
  const dir = mkdtempSync(join(tmpdir(), "imp13-"));
  const helperFile = join(dir, "helpers.ts");
  writeFileSync(helperFile, helperSrc);
  const hr = spawnSync(process.execPath, ["--experimental-strip-types", helperFile], { encoding: "utf8" });
  assert.equal(hr.status, 0, hr.stderr || hr.stdout);

  // buildAdvice + greeks via rewritten local copies that point at absolute hrefs
  const adviceBody = readFileSync(join(root, "../src/lib/meridian/advice.ts"), "utf8")
    .replace('from "./scoring"', `from ${JSON.stringify(scoringHref)}`)
    .replace('from "./operator-copy"', `from ${JSON.stringify(pathToFileURL(helperFile).href)}`);
  // helperFile already has reasons+copy exports at top level — but advice imports named exports.
  // Write a proper module wrapper instead:
  const copyMod = join(dir, "operator-copy.ts");
  writeFileSync(
    copyMod,
    readFileSync(copyPath, "utf8")
      .replace('from "./kelly"', `from ${JSON.stringify(kelly)}`)
      .replace('from "./reasons"', `from ${JSON.stringify(reasons)}`),
  );
  const adviceMod = join(dir, "advice.ts");
  writeFileSync(
    adviceMod,
    readFileSync(join(root, "../src/lib/meridian/advice.ts"), "utf8")
      .replace('from "./scoring"', `from ${JSON.stringify(scoringHref)}`)
      .replace('from "./operator-copy"', `from ${JSON.stringify(pathToFileURL(copyMod).href)}`),
  );
  const greeksBody = readFileSync(join(root, "../src/lib/meridian/greeks.ts"), "utf8");
  const greeksMod = join(dir, "greeks.ts");
  writeFileSync(greeksMod, greeksBody);

  const runtime = `
    import { NOT_AN_ORDER, endWithNotAnOrder, hedgeReviewLots } from ${JSON.stringify(pathToFileURL(copyMod).href)};
    import { buildAdvice } from ${JSON.stringify(pathToFileURL(adviceMod).href)};
    import { DEMO_NIFTY_LEGS, snapshotFromLegs, explainScalp } from ${JSON.stringify(pathToFileURL(greeksMod).href)};

    if (NOT_AN_ORDER !== "(not an order)") throw new Error(NOT_AN_ORDER);
    const cards = buildAdvice({
      nifty: 24000, niftyChg: 0, bankNifty: 50000, bankChg: 0, indiaVix: 12, pcr: 1,
      btc: 70000, btcChg: 0, gold: 70000, goldChg: 0, usdinr: 84, usdinrChg: 0,
      crude: 70, crudeChg: 0, regime: "Calm", session: "weekend", asOf: Date.now(), source: "test",
    }, { promoted: false });
    if (!cards.length) throw new Error("no cards");
    for (const c of cards) {
      if (!c.body.endsWith("(not an order)")) throw new Error(c.id + ": " + c.body);
    }
    const snap = snapshotFromLegs("NIFTY", DEMO_NIFTY_LEGS.map((l) => ({ ...l, markInr: 24252 })), 0.01);
    const report = explainScalp(snap, { rehedgeBandLots: 0.5, startHedged: true });
    for (const st of report.steps) {
      if (!hedgeReviewLots(st.hedgeLots).startsWith("review hedge ")) throw new Error("row");
    }
    if (report.needsRehedge && !/review/i.test(report.suggestion)) throw new Error(report.suggestion);
    if (!/\\(not an order\\)/.test(report.suggestion) && report.posture === "short") throw new Error("short: " + report.suggestion);
  `;
  const runtimeFile = join(dir, "runtime.mjs");
  // Use strip-types on a .ts file
  const runtimeTs = join(dir, "runtime.ts");
  writeFileSync(runtimeTs, runtime);
  const rr = spawnSync(process.execPath, ["--experimental-strip-types", runtimeTs], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(rr.status, 0, rr.stderr || rr.stdout);

  const adviceSrc = readFileSync(join(root, "../src/lib/meridian/advice.ts"), "utf8");
  assert.match(adviceSrc, /endWithNotAnOrder/);
  assert.doesNotMatch(adviceSrc, /Not an order\./);

  const cmd = readFileSync(join(root, "../src/routes/index.tsx"), "utf8");
  assert.match(cmd, /data-advice-panel/);
  assert.match(cmd, /data-advice-card/);
  assert.match(cmd, /data-not-an-order/);
  assert.match(cmd, /NOT_AN_ORDER/);
  const advicePanel = cmd.slice(cmd.indexOf("data-advice-panel"), cmd.indexOf("Imported book"));
  assert.match(advicePanel, /\{NOT_AN_ORDER\}/);

  const greeksPage = readFileSync(join(root, "../src/routes/greeks.tsx"), "utf8");
  assert.match(greeksPage, /data-hedge-review/);
  assert.match(greeksPage, /hedgeReviewLots\(st\.hedgeLots\)/);
  assert.match(greeksPage, /Hedge review \{NOT_AN_ORDER\}/);
  assert.doesNotMatch(greeksPage, /· hedge \{st\.hedgeLots/);

  const greeksLib = readFileSync(join(root, "../src/lib/meridian/greeks.ts"), "utf8");
  assert.match(greeksLib, /\(not an order\)/);
  assert.doesNotMatch(greeksLib, /Not an order\./);

  const copy = readFileSync(copyPath, "utf8");
  assert.match(copy, /export const NOT_AN_ORDER = "\(not an order\)"/);
  assert.match(copy, /export function hedgeReviewLots/);
  assert.match(copy, /export function endWithNotAnOrder/);
});


test("IMP-20 Book vs paper: CSV = Holdings; score may show; meta n/a until promote; ledgers stay separate", () => {
  const book = readFileSync(join(root, "../src/routes/portfolio.tsx"), "utf8");
  assert.match(book, /Paper clips/);
  assert.match(book, /\bHoldings\b/);
  assert.match(book, /Imported Zerodha CSV is a second tab/);
  assert.match(book, /Import CSV = Holdings/);
  assert.match(book, /Holdings invested/);
  assert.match(book, /Holdings unrealised/);
  assert.match(book, /does not feed Paper P&L/);
  assert.match(book, /Score/);
  assert.match(book, /r\.score\?\.toFixed\(2\)/);
  assert.match(book, /n\/a — not promoted/);
  assert.match(book, /promoted \? `\$\{\(r\.metaProb \* 100\)\.toFixed\(0\)\}%` : "n\/a — not promoted"/);
  assert.match(book, /Factor \$\{r\.action\}/);
  assert.match(book, /five-factor only/);
  // tabs: clips default; holdings separate — no single merged table of clips+CSV
  assert.match(book, /useState<"clips" \| "imported">\("clips"\)/);
  assert.match(book, /\{tab === "clips" &&/);
  assert.match(book, /\{tab === "imported" &&/);
  // paper realised only on clips pane; holdings KPIs only on imported pane
  const clipsStart = book.indexOf("{tab === \"clips\" &&");
  const importedStart = book.indexOf("{tab === \"imported\" &&");
  assert.ok(clipsStart > 0 && importedStart > clipsStart, "clip/imported panes ordered");
  const clips = book.slice(clipsStart, importedStart);
  const imported = book.slice(importedStart);
  assert.match(clips, /Realised \{inr\(dailyPnl\)\}/);
  assert.doesNotMatch(clips, /Holdings invested/);
  assert.match(imported, /Holdings invested/);
  assert.match(imported, /n\/a — not promoted/);
  assert.doesNotMatch(imported, /Realised \{inr\(dailyPnl\)\}/);

  const cmd = readFileSync(join(root, "../src/routes/index.tsx"), "utf8");
  assert.match(cmd, />Holdings</);
  assert.match(cmd, /Imported CSV — not paper clips/);
  assert.match(cmd, /PnL here is not the desk book/);
  assert.match(cmd, /holdingsValue/);
  assert.match(cmd, /holdingsPnl/);
  assert.match(cmd, /label="Paper P&L"/);
  assert.match(cmd, /value=\{inr\(dailyPnl\)\}/);
  assert.match(cmd, /Factor \$\{r\.action\}/);
  assert.match(cmd, /meta n\/a/);
  assert.match(cmd, /Open Book · Paper clips \+ Holdings/);
  assert.doesNotMatch(cmd, /Imported book/);
  // must not sum holdings PnL into paper dailyPnl display
  assert.doesNotMatch(cmd, /dailyPnl\s*\+/);
  assert.doesNotMatch(cmd, /\bbookPnl\b|\bbookValue\b/);

  const shell = readFileSync(join(root, "../src/components/desk-shell.tsx"), "utf8");
  assert.match(shell, /Paper P&L \{inr\(dailyPnl\)\}/);
  assert.match(shell, /Paper MTM \{inr\(mtm\)\}/);
  // MTM from paper positions only
  assert.match(shell, /positions\.reduce/);
  assert.doesNotMatch(shell, /holdings\.reduce/);

  const store = readFileSync(join(root, "../src/lib/desk-store.ts"), "utf8");
  const resetStart = store.indexOf("resetPaper: () =>\n    set({");
  assert.ok(resetStart > 0, "resetPaper impl");
  const reset = store.slice(resetStart, resetStart + 220);
  assert.match(reset, /positions:\s*\[\]/);
  assert.match(reset, /dailyPnl:\s*0/);
  assert.doesNotMatch(reset, /holdings/);
  const hydrateStart = store.indexOf("hydratePaper: (book) =>");
  assert.ok(hydrateStart > 0, "hydratePaper impl");
  const hydrate = store.slice(hydrateStart, hydrateStart + 1200);
  assert.doesNotMatch(hydrate, /holdings\s*:/);
  assert.match(hydrate, /dailyPnl:\s*book\.dailyPnl/);
});


test("IMP-21 sample download: fit vs contaminated labelled; counts match AUC artefact or mismatch labelled", () => {
  const fitHref = pathToFileURL(join(root, "../src/lib/meridian/fit-samples.ts")).href;
  const src = `
    import {
      isContaminatedSample,
      labelFitSampleRow,
      summarizeFitDownload,
      fitDownloadCsvPreamble,
    } from ${JSON.stringify(fitHref)};

    if (!isContaminatedSample("time_stop:short:paper", 90)) throw new Error("time_stop must contaminate");
    if (!isContaminatedSample("hard_stop", 60)) throw new Error("short hold must contaminate");
    if (isContaminatedSample("trail_stop", 400)) throw new Error("quality hold must stay clean");

    const clean = labelFitSampleRow({
      symbol: "BTC",
      side: "long",
      hold_sec: 400,
      reason_close: "trail_stop",
      fwd_ret: 0.01,
      pnl: 10,
      source: "fit-jsonl",
    });
    if (clean.set !== "fit" || clean.contaminated || !clean.quality_hold) throw new Error("clean fit " + JSON.stringify(clean));

    const dirty = labelFitSampleRow({
      symbol: "ETH",
      side: "short",
      hold_sec: 90,
      reason_close: "time_stop:short:paper",
      source: "fit-jsonl",
    });
    if (dirty.set !== "contaminated" || !dirty.contaminated || dirty.quality_hold) throw new Error("contaminated " + JSON.stringify(dirty));

    const live = labelFitSampleRow({
      symbol: "SOL",
      side: "long",
      hold_sec: 400,
      reason_close: "trail_stop",
      source: "live-db",
    });
    if (live.set !== "live-db") throw new Error("live-db set " + live.set);

    const match = summarizeFitDownload({
      rows: [clean, dirty],
      artefactN: 2,
      source: "fit-jsonl",
      jsonlTotalN: 2,
    });
    if (!match.countsMatchArtefact || match.mismatchLabel) throw new Error("expected match " + JSON.stringify(match));
    if (match.fitN !== 1 || match.contaminatedN !== 1) throw new Error("split " + JSON.stringify(match));

    const trunc = summarizeFitDownload({
      rows: [clean, dirty],
      artefactN: 8629,
      source: "fit-jsonl",
      jsonlTotalN: 8629,
    });
    if (trunc.countsMatchArtefact || !/truncated|mismatch/i.test(String(trunc.mismatchLabel))) {
      throw new Error("truncated mismatch " + JSON.stringify(trunc));
    }

    const liveSum = summarizeFitDownload({
      rows: [live],
      artefactN: 8629,
      source: "live-db",
      jsonlTotalN: 0,
    });
    if (liveSum.countsMatchArtefact || !/live DB/i.test(String(liveSum.mismatchLabel))) {
      throw new Error("live mismatch " + JSON.stringify(liveSum));
    }

    const pre = fitDownloadCsvPreamble(match);
    if (!/fit set vs contaminated/i.test(pre)) throw new Error("preamble legend");
    if (!/counts_match_auc_artefact=yes/.test(pre)) throw new Error("preamble match bit");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /exportFitSamplesDownload/);
  assert.match(engine, /summarizeFitDownload/);
  assert.match(engine, /labelFitSampleRow/);
  const rev = engine.match(/const ENGINE_REV = (\d+)/);
  assert.ok(rev && Number(rev[1]) >= 36, "ENGINE_REV " + rev?.[1]);

  const desk = readFileSync(join(root, "../src/lib/server/desk.ts"), "utf8");
  assert.match(desk, /exportFitSamplesDownload\(100_000\)/);

  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");
  assert.match(autoPage, /fit set vs contaminated/i);
  assert.match(autoPage, /counts_match_auc_artefact/);
  assert.match(autoPage, /mismatchLabel/);
  assert.match(autoPage, /Download fit samples/);
});


test("IMP-01 identity honesty on main: Signals/Paper/Auto, Kite off, Resume paper, no Arm", () => {
  // Full MOCK ₹ strip lives on fix/imp-01; main still must not look armable.
  const chips = readFileSync(join(root, "../src/lib/meridian/operator-copy.ts"), "utf8");
  assert.match(chips, /id: "advisory" as const, label: "Signals"/);
  assert.match(chips, /id: "paper" as const, label: "Paper"/);
  assert.match(chips, /id: "auto" as const, label: "Auto"/);
  assert.match(chips, /Kite off/);
  assert.doesNotMatch(chips, /label: "Live"/);
  const shell = readFileSync(join(root, "../src/components/desk-shell.tsx"), "utf8");
  assert.match(shell, /Resume paper/);
  assert.doesNotMatch(shell, /\bArm\b/);
  const login = readFileSync(join(root, "../src/routes/login.tsx"), "utf8");
  assert.match(login, /Kite off/);
});

test("IMP-02 fill tagging: scan/flatten/open money-path ends :paper; no :live`", () => {
  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /flatten_operator:\$\{pos\.side\}:paper/);
  assert.match(engine, /\$\{sleeve\}:\$\{reason\}:paper/);
  assert.match(engine, /\$\{intent\.reason\}:\$\{pos\.side\}:paper/);
  assert.match(engine, /\$\{sleeve\}:\$\{pos\.reasonOpen\}:paper/);
  assert.doesNotMatch(engine, /:live`/);
  assert.doesNotMatch(engine, /flatten_operator:[^`\n]*:live/);
  // explainReason maps :live quote enum to "paper quote" English (not broker live)
  const reasons = readFileSync(join(root, "../src/lib/meridian/reasons.ts"), "utf8");
  assert.match(reasons, /paper quote/i);
});

test("IMP-03 boot contract: emptyEngine advisory+killed; ENGINE_REV >= 21", () => {
  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  const rev = engine.match(/const ENGINE_REV = (\d+)/);
  assert.ok(rev && Number(rev[1]) >= 21, "ENGINE_REV " + rev?.[1]);
  const empty = engine.slice(engine.indexOf("function emptyEngine"), engine.indexOf("function emptyEngine") + 500);
  assert.match(empty, /mode:\s*"advisory"/);
  assert.match(empty, /killed:\s*true/);
});

test("IMP-04 kill split on main: Pause does not flatten; exits still run; Reset confirms", () => {
  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  const shell = readFileSync(join(root, "../src/components/desk-shell.tsx"), "utf8");
  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");

  const flags = engine.slice(engine.indexOf("export function setEngineFlags"), engine.indexOf("export function resetEngine"));
  assert.match(flags, /if \(patch\.killed != null\) e\.killed = patch\.killed/);
  assert.doesNotMatch(flags, /flatten/i);
  assert.doesNotMatch(flags, /positions\s*=\s*\[\]/);

  assert.match(engine, /intent = manage\(/);
  assert.match(engine, /autoCanSend\(eng\.mode, eng\.killed\)/);
  const manageIdx = engine.indexOf("intent = manage(");
  const killedGateBeforeManage = engine.lastIndexOf("if (eng.killed", manageIdx);
  assert.ok(
    killedGateBeforeManage < 0 || manageIdx - killedGateBeforeManage > 800,
    "manage/exits must not sit behind eng.killed",
  );

  // Flatten confirm UI is open PR IMP-04; main still has one-click Flatten all — do not require flattenAsk.
  assert.match(shell, /flatten_all/);
  assert.match(autoPage, /resetAsk/);
  assert.match(autoPage, /Confirm reset/);
  assert.match(autoPage, /setResetAsk\(true\)/);
});

test("IMP-05 guest + origin: OMS auth; localhost and 127.0.0.1; guest banner honest", () => {
  const desk = readFileSync(join(root, "../src/lib/server/desk.ts"), "utf8");
  const flags = desk.slice(desk.indexOf("export const setPaperFlags"), desk.indexOf("export const resetPaperBook"));
  const reset = desk.slice(desk.indexOf("export const resetPaperBook"), desk.indexOf("export const getPaperSamples"));
  assert.match(flags, /authMiddleware/);
  assert.match(reset, /authMiddleware/);
  assert.match(desk, /runPaperOp[\s\S]{0,80}authMiddleware/);

  const auth = readFileSync(join(root, "../src/lib/auth/server.ts"), "utf8");
  assert.match(auth, /http:\/\/localhost:8080/);
  assert.match(auth, /http:\/\/127\.0\.0\.1:8080/);
  assert.match(auth, /http:\/\/localhost:3000/);
  assert.match(auth, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(auth, /allowedHosts: \[[\s\S]*"localhost"[\s\S]*"127\.0\.0\.1"/);

  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");
  assert.match(autoPage, /Sign in to Halt, change mode, or reset the shared book/);
  const shell = readFileSync(join(root, "../src/components/desk-shell.tsx"), "utf8");
  assert.match(shell, /Sign in to halt/);
  assert.match(shell, /disabled=\{guest/);
});

test("IMP-07 META copy on main: n/a not 0%; Factor Buy; two ledgers named", () => {
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
  // Calm arm is promoted-gated on main; Elevated 0.55 fix is open IMP-07 PR — assert Calm only.
  const calm = advice.slice(advice.lastIndexOf("} else {"));
  assert.match(
    calm,
    /promoted\s*\?\s*"Calm regime\.[\s\S]*0\.55[\s\S]*:\s*"Calm tape, but the paper model is not promoted/,
  );

  const copy = readFileSync(join(root, "../src/lib/meridian/operator-copy.ts"), "utf8");
  assert.match(copy, /treat Book Buy as model-backed/);
  assert.match(copy, /Ignore Command cash advice that assumes a 0\.55 meta gate/);

  const adviceUrl = pathToFileURL(join(root, "../src/lib/meridian/advice.ts")).href;
  const src = `
    import { buildAdvice } from ${JSON.stringify(adviceUrl)};
    const base = {
      nifty: 25000, niftyChg: 0, bankNifty: 52000, bankChg: 0, indiaVix: 12, pcr: 1,
      btc: 100000, btcChg: 0, gold: 70000, goldChg: 0, usdinr: 84, usdinrChg: 0,
      crude: 70, crudeChg: 0, regime: "Calm", session: "open", asOf: Date.now(), source: "test",
    };
    const off = buildAdvice(base, { promoted: false }).find((c) => c.id === "spot-1");
    if (!off || /0\\.55/.test(off.body) || !/model-backed/i.test(off.body)) throw new Error("Calm unpromoted: " + off?.body);
    const on = buildAdvice(base, { promoted: true }).find((c) => c.id === "spot-1");
    if (!on || !/0\\.55/.test(on.body)) throw new Error("Calm promoted: " + on?.body);
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("IMP-08 secret hygiene on main: .env not tracked; no private-key PEM in source", () => {
  // Full secret-scan.mjs is open IMP-08 PR; gate what main can already enforce.
  const tracked = spawnSync("git", ["ls-files"], { cwd: join(root, ".."), encoding: "utf8" });
  assert.equal(tracked.status, 0, tracked.stderr);
  const files = tracked.stdout.split("\n").filter(Boolean);
  const banned = files.filter((p) => {
    if (/\.env\.example$/.test(p)) return false;
    if (/(^|\/)\.env($|\.)/.test(p)) return true;
    if (/(^|\/)id_rsa$|\.pem$|credentials\.json$/i.test(p)) return true;
    if (/^data\/(paper-samples\.jsonl|paper-heartbeat\.json)$/.test(p)) return true;
    return false;
  });
  assert.deepEqual(banned, [], "tracked banned paths: " + banned.join(", "));

  const pemRe = /BEGIN [A-Z0-9 ]*PRIVATE KEY/;
  const scanExt = /\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|sh|bat|env)$/i;
  const leaks = [];
  for (const p of files) {
    if (!scanExt.test(p)) continue;
    if (p.startsWith("data/")) continue;
    const text = readFileSync(join(root, "..", p), "utf8");
    if (pemRe.test(text)) leaks.push(p);
  }
  assert.deepEqual(leaks, [], "PEM private key in tree: " + leaks.join(", "));
});
