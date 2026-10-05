/** IMP-38: short-root option aliases (NIFTYCE, HDFCBANKPE…) never open / twin / sample; FO pnl_usd INR→USD. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const url = (p) => pathToFileURL(join(root, "..", p)).href;
const files = {
  fo: url("src/lib/meridian/fo-contracts.ts"),
  watch: url("src/lib/meridian/paper-watch.ts"),
  sample: url("src/lib/meridian/paper-sample.ts"),
  exclude: url("src/lib/meridian/sample-exclude.ts"),
  engine: join(root, "../src/lib/server/paper-engine.ts"),
  retrain: join(root, "../src/lib/server/retrain.ts"),
};

// Extensionless relative TS imports ("./costs") need a tiny resolve hook under --experimental-strip-types.
const hookDir = mkdtempSync(join(tmpdir(), "imp38-"));
const hook = join(hookDir, "hook.mjs");
writeFileSync(
  hook,
  `export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); } catch (e) {
    if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.[cm]?[jt]s$/.test(spec)) return next(spec + ".ts", ctx);
    throw e;
  }
}`,
);
const reg = join(hookDir, "reg.mjs");
writeFileSync(reg, `import { register } from "node:module"; register(${JSON.stringify(pathToFileURL(hook).href)});`);

function run(src) {
  const r = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--import", pathToFileURL(reg).href, "--input-type=module", "-e", src],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
}

test("IMP-38 short-root option symbols are malformed; canonical contracts and spot are not", () => {
  run(`
    import { isShortRootOption, isMalformedOption, isCanonicalOption } from ${JSON.stringify(files.fo)};
    const shortRoots = ["NIFTYCE","NIFTYPE","BANKNIFTYCE","BANKNIFTYPE","RELIANCECE","RELIANCEPE","HDFCBANKCE","HDFCBANKPE","BTCPE","BTCCM","TCSCE","INFYPE"];
    for (const s of shortRoots) {
      if (!isShortRootOption(s)) throw new Error("short root not detected " + s);
      if (!isMalformedOption(s)) throw new Error("short root not malformed " + s);
      if (isCanonicalOption(s)) throw new Error("short root canonical " + s);
    }
    const ok = ["HDFCBANK 06OCT26 720 CE","RELIANCE 06OCT26 1180 CE","NIFTY 06OCT26 22550 PE","BANKNIFTY 06OCT26 55000 CE","BTC-261009-62000-C"];
    for (const s of ok) {
      if (isMalformedOption(s)) throw new Error("canonical flagged " + s);
      if (!isCanonicalOption(s)) throw new Error("canonical not recognised " + s);
    }
    // strike-less option label is malformed too
    if (!isMalformedOption("NIFTY 06OCT26 CE")) throw new Error("strike-less CE must be malformed");
    // spot / futures / perps / crypto names ending in PE are not options
    for (const s of ["APE","PEPE","RELIANCE","HDFCBANK","NIFTY","NIFTYFUT","RELIANCEFUT","BTCPERP","BTC","ETH"]) {
      if (isMalformedOption(s)) throw new Error("false positive " + s);
    }
  `);
});

test("IMP-38 open gates reject short roots even in session; canonical still opens", () => {
  run(`
    import { openSkipReason } from ${JSON.stringify(files.fo)};
    import { autoOpenSkip } from ${JSON.stringify(files.watch)};
    for (const s of ["HDFCBANKCE","HDFCBANKPE","RELIANCECE","BANKNIFTYPE","NIFTYCE"]) {
      const a = openSkipReason({ symbol: s, sleeve: "farm", feed: "nse-opt-last", openSession: true, positions: [] });
      if (a !== "malformed_option") throw new Error(s + " openSkipReason " + a);
      const b = autoOpenSkip({ symbol: s, sleeve: "farm", feed: "nse-opt-last", openSession: true, positions: [], farmTail: true });
      if (b !== "malformed_option") throw new Error(s + " autoOpenSkip " + b);
      const c = openSkipReason({ symbol: s, sleeve: "pnl", feed: "derived", openSession: false, positions: [] });
      if (c !== "malformed_option") throw new Error(s + " closed-session " + c);
    }
    const ok = autoOpenSkip({ symbol: "HDFCBANK 06OCT26 720 CE", sleeve: "farm", feed: "nse-opt-last", openSession: true, positions: [], farmTail: true });
    if (ok !== null) throw new Error("canonical blocked " + ok);
    // existing no_leverage contract untouched
    if (openSkipReason({ symbol: "BTCPERP", sleeve: "farm", feed: "binance-fut", openSession: true, positions: [] }) !== "no_leverage") throw new Error("perp");
  `);
});

test("IMP-38 one fill per contract: short-root alias keys to its canonical contract", () => {
  run(`
    import { contractKeyOf } from ${JSON.stringify(files.fo)};
    const twin = contractKeyOf("HDFCBANKCE", { contract: "HDFCBANK 06OCT26 720 CE" });
    if (twin !== "HDFCBANK 06OCT26 720 CE") throw new Error("twin key " + twin);
    if (contractKeyOf("hdfcbank 06oct26 720 ce") !== "HDFCBANK 06OCT26 720 CE") throw new Error("canonical key normalise");
    if (contractKeyOf("RELIANCE") !== "RELIANCE") throw new Error("spot key");
  `);
});

test("IMP-38 pnl_usd converts INR premium x qty by USDINR; USD rows unchanged", () => {
  run(`
    import { closeClipFields, pnlUsdOf, USDINR_FALLBACK } from ${JSON.stringify(files.sample)};
    const base = { side: "long", qty: 2451.57, entryFill: 12.24, exitFill: 14.67, entryMid: 12.24, exitMid: 14.67, costBps: 30, sleeve: "farm", reasonOpen: "passed_gates", reasonClose: "take_profit" };
    const inr = closeClipFields({ ...base, quoteCcy: "INR", usdInr: 95.7 });
    const native = (14.67 - 12.24) * 2451.57;
    if (Math.abs(inr.pnl - native) > 1e-6) throw new Error("native pnl " + inr.pnl);
    if (Math.abs(inr.pnl_usd - native / 95.7) > 1e-6) throw new Error("pnl_usd " + inr.pnl_usd);
    if (inr.pnl_ccy !== "INR" || inr.usd_inr !== 95.7) throw new Error("ccy tags " + inr.pnl_ccy + " " + inr.usd_inr);
    const usd = closeClipFields({ ...base });
    if (usd.pnl_usd !== usd.pnl || usd.pnl_ccy !== "USD") throw new Error("usd passthrough");
    const fb = closeClipFields({ ...base, quoteCcy: "INR", usdInr: 0 });
    if (Math.abs(fb.pnl_usd - native / USDINR_FALLBACK) > 1e-6) throw new Error("fallback fx");
    if (pnlUsdOf(957, "INR", 95.7) !== 10) throw new Error("pnlUsdOf");
    if (pnlUsdOf(5, "FX", 95.7) !== 5) throw new Error("FX passthrough");
  `);
});

test("IMP-38 fit exclusion: short-root rows + exclude-list ids skipped; others kept", () => {
  run(`
    import { parseExcludeList, isExcludedSample, sampleExcludeReason } from ${JSON.stringify(files.exclude)};
    const ids = parseExcludeList('{"id":"a1","line":12}\\n# comment\\nb2\\n\\n{"id":"c3","exclude":false}\\nnot-json{');
    if (!ids.has("a1") || !ids.has("b2") || ids.has("c3")) throw new Error("parse " + [...ids]);
    if (sampleExcludeReason({ id: "x", symbol: "HDFCBANKCE" }) !== "short_root_option") throw new Error("short root");
    if (sampleExcludeReason({ id: "a1", symbol: "BTC" }, ids) !== "exclude_list") throw new Error("id list");
    for (const s of ["HDFCBANK 06OCT26 720 CE","APE","PEPE","RELIANCE"]) if (isExcludedSample({ id: "z", symbol: s }, ids)) throw new Error("kept " + s);
  `);
});

test("IMP-38 engine wiring: aliases off tape, malformed drop w/o sample, contract dedupe, rev bump", () => {
  const engine = readFileSync(files.engine, "utf8");
  assert.match(engine, /if \(isShortRootOption\(sym\)\) continue;/);
  assert.match(engine, /lev === "no_leverage" \|\| lev === "malformed_option"/);
  assert.match(engine, /dropWhy === "malformed_option" \? pos\.entryPrice/);
  assert.match(engine, /contractKeyOf\(row\.sym, eng\.foMeta\[row\.sym\]\)/);
  assert.match(engine, /const openKey = contractKeyOf\(symbol/);
  assert.match(engine, /foFieldsForPos\(pos, eng\.foMeta\[pos\.symbol\]\)/);
  assert.doesNotMatch(engine, /const extra = foFields\(pos\.symbol/);
  assert.match(engine, /quoteCcy: quoteCcyOf\(pos\.symbol, mid\)/);
  const rev = engine.match(/const ENGINE_REV = (\d+)/);
  assert.ok(rev && Number(rev[1]) >= 43, "ENGINE_REV " + rev?.[1]);
  const retrain = readFileSync(files.retrain, "utf8");
  assert.match(retrain, /isExcludedSample\(row, excludeIds\)/);
  assert.match(retrain, /MERIDIAN_SAMPLE_EXCLUDE/);
  // promote gates untouched
  assert.doesNotMatch(retrain, /PROMOTE_MIN_(N|AUC|HIT)\s*=/);
});
