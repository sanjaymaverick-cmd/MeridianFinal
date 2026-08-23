import assert from "node:assert/strict";
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
