import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const files = {
  costs: pathToFileURL(join(root, "../src/lib/meridian/costs.ts")).href,
  kelly: pathToFileURL(join(root, "../src/lib/meridian/kelly.ts")).href,
  tbm: pathToFileURL(join(root, "../src/lib/meridian/triple-barrier.ts")).href,
  logistic: pathToFileURL(join(root, "../src/lib/meridian/logistic.ts")).href,
  fo: pathToFileURL(join(root, "../src/lib/meridian/fo-contracts.ts")).href,
};

test("costs, kelly, TBM, logistic, BS premiums", () => {
  const src = `
    import { fillFromMid, netFwdRet, roundTripBps } from ${JSON.stringify(files.costs)};
    import { kellySizePct, shouldPromote, PROMOTE_MIN_N } from ${JSON.stringify(files.kelly)};
    import { tripleBarrier } from ${JSON.stringify(files.tbm)};
    import { fitLogistic, predictRow, rocAuc } from ${JSON.stringify(files.logistic)};
    import { bsPremium } from ${JSON.stringify(files.fo)};

    const buy = fillFromMid(100, "buy", "crypto");
    const sell = fillFromMid(100, "sell", "crypto");
    if (!(buy > 100) || !(sell < 100)) throw new Error("fill must pay the spread");
    if (!(netFwdRet(buy, sell, "long") < 0)) throw new Error("round trip long must lose costs");
    if (roundTripBps("nse_fo") <= roundTripBps("crypto")) throw new Error("FO should be wider than crypto");

    const k = kellySizePct(0.6, 0.02, 0.08);
    if (!(k > 0) || k > 0.08) throw new Error("kelly size " + k);
    if (kellySizePct(0.5, 0.02, 0.08) !== 0) throw new Error("no size at p0");
    if (shouldPromote(100, 0.9, "paper")) throw new Error("n gate");
    if (shouldPromote(PROMOTE_MIN_N, 0.51, "synth")) throw new Error("synth must not promote");
    if (shouldPromote(PROMOTE_MIN_N, 0.51, "paper", 0.56)) throw new Error("auc 0.51 must not promote");
    if (shouldPromote(PROMOTE_MIN_N, 0.56, "paper", 0.44)) throw new Error("hit rate 44% must not promote");
    if (!shouldPromote(PROMOTE_MIN_N, 0.56, "paper", 0.56)) throw new Error("paper should promote");

    const up = tripleBarrier({ side: "long", entry: 100, high: 103, low: 99.5, stopPct: 0.01, tpR: 2, timedOut: false, netRet: 0.02 });
    if (up.label !== 1 || up.barrier !== "upper") throw new Error("upper " + JSON.stringify(up));
    const dn = tripleBarrier({ side: "long", entry: 100, high: 100.2, low: 98.9, stopPct: 0.01, tpR: 2, timedOut: false, netRet: -0.01 });
    if (dn.label !== 0 || dn.barrier !== "lower") throw new Error("lower " + JSON.stringify(dn));
    const vert = tripleBarrier({ side: "long", entry: 100, high: 100.2, low: 99.8, stopPct: 0.01, tpR: 2, timedOut: true, netRet: 0.001 });
    if (vert.barrier !== "vertical" || vert.label !== 1) throw new Error("vertical " + JSON.stringify(vert));

    const X = [[0], [0.2], [0.8], [1], [0.1], [0.9]];
    const y = [0, 0, 1, 1, 0, 1];
    const fit = fitLogistic(X, y, { epochs: 400 });
    const p = X.map((r) => predictRow(r, fit));
    if (rocAuc(y, p) < 0.8) throw new Error("auc " + rocAuc(y, p));

    const call = bsPremium(57800, 57800, 0.12, 2, "CE", 0.065);
    const put = bsPremium(57800, 57800, 0.12, 2, "PE", 0.065);
    const otmPut = bsPremium(57800, 57000, 0.12, 2, "PE", 0.065);
    const otmCall = bsPremium(57800, 57000, 0.12, 2, "CE", 0.065);
    if (!(call > 50 && put > 50)) throw new Error("atm prem " + call + " " + put);
    if (!(otmCall > otmPut)) throw new Error("ITM call should beat OTM put " + otmCall + " " + otmPut);
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
