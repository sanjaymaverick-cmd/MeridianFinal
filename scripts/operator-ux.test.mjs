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
  assert.match(chips, /id: "auto" as const, label: "Auto"/);
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
  assert.doesNotMatch(engine, /:live`/);
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
    function autoCanSend(mode, killed) { return (mode === "auto" || mode === "paper") && !killed; }
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
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /autoCanSend\(eng\.mode, eng\.killed\)/);
  assert.doesNotMatch(engine, /if \(halted && !staleCrypto/);
  const watches = readFileSync(join(root, "../src/lib/meridian/paper-watch.ts"), "utf8");
  assert.match(watches, /CASH_WATCH = \["HDFCBANK", "ICICIBANK", "RELIANCE", "TCS", "INFY", "LT", "POLYCAB"\]/);
  assert.match(watches, /COMMODITY_WATCH = \["GOLD"/);
  assert.match(watches, /"TRX"/);
  assert.match(watches, /"HBAR"/);
  assert.match(watches, /"TON"/);
  assert.match(watches, /"POL"/);
  assert.match(watches, /"SHIB"/);
  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");
  assert.match(autoPage, /crypto spot only/i);
  const chips = readFileSync(join(root, "../src/lib/meridian/operator-copy.ts"), "utf8");
  assert.match(chips, /Crypto spot farm/);
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

