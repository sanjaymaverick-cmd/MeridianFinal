/** IMP-40: an open contract keeps its strike when ATM moves. Model is not painted as last. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const foUrl = pathToFileURL(join(root, "../src/lib/meridian/fo-contracts.ts")).href;
const pathUrl = pathToFileURL(join(root, "../src/lib/meridian/quote-path.ts")).href;

test("IMP-40 ATM move does not rewrite an open contract strike; model stays model", () => {
  const src = `
    import { markCanonicalFo, bsPremium, isShortRootOption } from ${JSON.stringify(foUrl)};
    import { quoteLabelForFeed, nseFoMarkFeed, quotePathOf } from ${JSON.stringify(pathUrl)};

    const spot = 24680;
    const openStrike = 24250;
    const atmNow = 24700;
    const mark = markCanonicalFo({
      spot,
      contractStrike: openStrike,
      atmStrike: atmNow,
      sigma: 0.12,
      days: 6,
      right: "CE",
    });
    if (mark.strike !== openStrike) throw new Error("strike rewritten to " + mark.strike);
    const own = bsPremium(spot, openStrike, 0.12, 6, "CE", 0.065);
    const atmPrem = bsPremium(spot, atmNow, 0.12, 6, "CE", 0.065);
    if (Math.abs(mark.premium - own) > 1e-9) throw new Error("premium not from own strike");
    if (Math.abs(mark.premium - atmPrem) < 1e-6) throw new Error("premium followed ATM");
    if (mark.quoteLabel !== "model" || mark.feed !== "nse-opt-model") throw new Error("painted as last " + mark.feed);
    if (quoteLabelForFeed("nse-opt-model", true) !== "model") throw new Error("delayed model painted wrong");
    if (quoteLabelForFeed("nse-opt-last", false) !== "live") throw new Error("last label");
    if (quotePathOf("nse-opt-last") !== "quote:last") throw new Error("quote path");
    if (nseFoMarkFeed(true) !== "nse-opt-last") throw new Error("session open must still prefer last");
    if (nseFoMarkFeed(false) !== "nse-opt-model") throw new Error("session closed model feed");
    if (!isShortRootOption("NIFTYCE") || !isShortRootOption("HDFCBANKPE")) throw new Error("short roots unblocked");
    if (isShortRootOption("NIFTY 06OCT26 24250 CE")) throw new Error("canonical blocked");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /markCanonicalFo\(/);
  assert.match(engine, /contractStrike: strike/);
  assert.match(engine, /if \(isShortRootOption\(sym\)\) continue;/);
  assert.match(engine, /do not clobber non-model last while session open/);
});
