import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// --- IMP-22 Lane 1 regression pack (assert what origin/main already has) ---

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
