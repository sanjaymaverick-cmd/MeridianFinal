/** IMP-39: new FO option opens cannot exceed 1% of the mock book. Crypto sizing unchanged. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const foUrl = pathToFileURL(join(root, "../src/lib/meridian/fo-contracts.ts")).href;

test("IMP-39 oversized FO qty is skipped :paper; crypto spot is not; existing clips stay", () => {
  const body = readFileSync(join(root, "../src/lib/meridian/fo-size.ts"), "utf8").replace(
    'from "./fo-contracts"',
    `from ${JSON.stringify(foUrl)}`,
  );
  const dir = mkdtempSync(join(tmpdir(), "imp39-size-"));
  const sizeFile = join(dir, "fo-size.ts");
  writeFileSync(sizeFile, body);
  const sizeHref = pathToFileURL(sizeFile).href;
  const src = `
    import { foOptionQtySkip, FO_CAP_FLATTENS_EXISTING, FO_OPTION_BOOK_FRAC } from ${JSON.stringify(sizeHref)};
    const over = foOptionQtySkip({
      symbol: "NIFTY 06OCT26 24500 CE",
      qty: 50,
      premiumInr: 400,
      bookInr: 1_000_000,
    });
    if (!over || !over.endsWith(":paper")) throw new Error("reason " + over);
    if (!/1%/.test(over) || !/mock book/i.test(over)) throw new Error("english " + over);
    const ok = foOptionQtySkip({
      symbol: "NIFTY 06OCT26 24500 CE",
      qty: 20,
      premiumInr: 400,
      bookInr: 1_000_000,
    });
    if (ok) throw new Error("8000 INR is inside 1% " + ok);
    const crypto = foOptionQtySkip({ symbol: "BTC", qty: 5, premiumInr: 100000, bookInr: 1_000_000 });
    if (crypto) throw new Error("crypto spot sizing must be unchanged " + crypto);
    const perp = foOptionQtySkip({ symbol: "BTCPERP", qty: 5, premiumInr: 100000, bookInr: 1_000_000 });
    if (perp) throw new Error("perp is not this gate");
    if (FO_CAP_FLATTENS_EXISTING !== false) throw new Error("must not flatten existing clips");
    if (FO_OPTION_BOOK_FRAC !== 0.01) throw new Error("cap frac");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /foOptionQtySkip/);
  assert.match(engine, /not force-flattened/);
  assert.match(engine, /function qtyFor/);
});
