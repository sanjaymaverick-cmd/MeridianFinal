import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const fo = pathToFileURL(join(root, "../src/lib/meridian/fo-contracts.ts")).href;

test("isNseFo gates NSE names and leaves Binance 24/7", () => {
  const src = `
    import { isNseFo, isCryptoFo } from ${JSON.stringify(fo)};
    const cases = [
      ["BANKNIFTY 25AUG26 57800 PE", true, false],
      ["NIFTYFUT", true, false],
      ["BANKNIFTYFUT", true, false],
      ["TCSFUT", true, false],
      ["GOLDFUT", true, false],
      ["NIFTY 25AUG26 24250 CE", true, false],
      ["RELIANCE 25AUG26 1320 PE", true, false],
      ["BTCPERP", false, true],
      ["BTC 25AUG26 77000 PE", false, true],
      ["ETHPERP", false, true],
      ["BTCPE", false, false],
    ];
    for (const [sym, nse, crypto] of cases) {
      if (isNseFo(sym) !== nse) throw new Error(sym + " isNseFo want " + nse + " got " + isNseFo(sym));
      if (isCryptoFo(sym) !== crypto) throw new Error(sym + " isCryptoFo want " + crypto + " got " + isCryptoFo(sym));
    }
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("IMP-16 quote path: crypto quote:binance; fills still :paper; QuoteLabel live untouched", () => {
  const pathMod = pathToFileURL(join(root, "../src/lib/meridian/quote-path.ts")).href;
  const src = `
    import { quotePathOf } from ${JSON.stringify(pathMod)};

    if (quotePathOf("binance") !== "quote:binance") throw new Error("spot " + quotePathOf("binance"));
    if (quotePathOf("binance-fut") !== "quote:binance") throw new Error("fut");
    if (quotePathOf("binance-opt") !== "quote:binance") throw new Error("opt");
    if (quotePathOf("binance-spot-mark") !== "quote:binance") throw new Error("spot-mark");
    if (quotePathOf("polymarket") !== "quote:polymarket") throw new Error("pred");
    if (quotePathOf("nse-opt-model") !== "quote:model") throw new Error("model");
    if (quotePathOf("yahoo") !== "quote:yahoo") throw new Error("yahoo");
    if (quotePathOf(undefined) !== "quote:last") throw new Error("empty");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /quotePathOf/);
  assert.match(engine, /quoteBits/);
  assert.match(engine, /quotePath:/);
  assert.match(engine, /const ENGINE_REV = (?:3[6-9]|[4-9]\d)/);
  assert.match(engine, /\$\{sleeve\}:\$\{pos\.reasonOpen\}:paper/);
  assert.match(engine, /\$\{intent\.reason\}:\$\{pos\.side\}:paper/);
  assert.match(engine, /flatten_operator:\$\{pos\.side\}:paper/);
  assert.doesNotMatch(engine, /:live`/);
  assert.match(engine, /type QuoteLabel = "live" \| "delayed" \| "model"/);
  assert.doesNotMatch(engine, /type QuoteLabel = "[^"]*binance/);

  const store = readFileSync(join(root, "../src/lib/desk-store.ts"), "utf8");
  assert.match(store, /quoteLabel\?: "live" \| "delayed" \| "model"/);
  assert.match(store, /quotePath\?: string/);

  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");
  assert.match(autoPage, /data-quote-path/);
  assert.match(autoPage, /f\.quotePath/);
  const cmd = readFileSync(join(root, "../src/routes/index.tsx"), "utf8");
  assert.match(cmd, /data-quote-path/);
  assert.match(cmd, /f\.quotePath/);

  const qp = readFileSync(join(root, "../src/lib/meridian/quote-path.ts"), "utf8");
  assert.match(qp, /quote:binance/);
  assert.match(qp, /export function quotePathOf/);
});
