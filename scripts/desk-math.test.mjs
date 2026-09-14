import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    import { tripleBarrier, barrierFromExit } from ${JSON.stringify(files.tbm)};
    import { cryptoFamily } from ${JSON.stringify(files.fo)};
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
    const fromTp = barrierFromExit("take_profit", 0.01);
    if (!fromTp || fromTp.barrier !== "upper" || fromTp.label !== 1) throw new Error("tp reason");
    const fromSl = barrierFromExit("hard_stop", -0.02);
    if (!fromSl || fromSl.barrier !== "lower" || fromSl.label !== 0) throw new Error("sl reason");
    if (cryptoFamily("BTCPERP") !== "BTC" || cryptoFamily("BTCUSDPERP") !== "BTC") throw new Error("perp family");
    if (cryptoFamily("BTC 24AUG26 76250 CE") !== "BTC") throw new Error("opt family");
    if (cryptoFamily("ETHPERP") !== "ETH" || cryptoFamily("DOGE") !== null) throw new Error("family miss");

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

test("paper close samples: net label, fee-adjusted fwdRet, :paper reasons, no promote at n=568", () => {
  const sampleSrc = readFileSync(join(root, "../src/lib/meridian/paper-sample.ts"), "utf8");
  assert.match(sampleSrc, /label: y/);
  assert.match(sampleSrc, /label_barrier: tb\.label/);
  assert.match(sampleSrc, /economicLabel\(fwdRet\)/);
  assert.match(sampleSrc, /netFwdRet\(args\.entryFill, args\.exitFill, args\.side\)/);
  assert.match(sampleSrc, /netPnlUsd/);
  assert.match(sampleSrc, /paperReason\(\[args\.sleeve, args\.reasonClose, args\.side\]\)/);

  const src = `
    import { fillFromMid, netFwdRet, netPnlUsd, economicLabel, roundTripBps } from ${JSON.stringify(files.costs)};
    import { shouldPromote } from ${JSON.stringify(files.kelly)};
    import { barrierFromExit } from ${JSON.stringify(files.tbm)};

    function paperReason(parts) {
      const body = parts.map((p) => String(p ?? "").trim()).filter(Boolean).join(":");
      const tagged = body.replace(/:live\\b/g, ":paper");
      if (!tagged) return "paper";
      return tagged.endsWith(":paper") ? tagged : tagged + ":paper";
    }

    const cls = "crypto";
    const costBps = roundTripBps(cls);
    const entryMid = 100;
    const exitMid = 100.05;
    const entryFill = fillFromMid(entryMid, "buy", cls);
    const exitFill = fillFromMid(exitMid, "sell", cls);
    const fwdRet = netFwdRet(entryFill, exitFill, "long");
    const fwdRetGross = exitMid / entryMid - 1;
    const pnl = netPnlUsd(entryFill, exitFill, 1, "long");
    const tb = barrierFromExit("trail", fwdRetGross);
    const trail = {
      fwdRet,
      fwdRetGross,
      pnl,
      pnl_usd: pnl,
      label: economicLabel(fwdRet),
      y: economicLabel(fwdRet),
      label_barrier: tb.label,
      reasonClose: "trail",
      reasonCloseFull: paperReason(["farm", "trail", "long"]),
      reasonOpenFull: paperReason(["farm", "passed_gates", "long"]),
      costBps,
    };
    if (trail.fwdRetGross <= 0) throw new Error("trail gross should be + " + trail.fwdRetGross);
    if (!(trail.fwdRet < 0)) throw new Error("trail net fwd should be <= 0 after fees " + trail.fwdRet);
    const bpsTaken = (trail.fwdRetGross - trail.fwdRet) * 1e4;
    if (Math.abs(bpsTaken - costBps) > 0.5) throw new Error("fwdRet not net of roundTripBps " + bpsTaken + " vs " + costBps);
    if (trail.label !== 0 || trail.y !== 0) throw new Error("losing trail must label 0 got " + trail.label);
    if (trail.label_barrier !== 1) throw new Error("barrier path for trail stays 1 " + trail.label_barrier);
    if (!(trail.pnl < 0) || trail.pnl !== trail.pnl_usd) throw new Error("pnl must be net usd " + trail.pnl);

    const flatExit = fillFromMid(entryMid, "sell", cls);
    const timeFwd = netFwdRet(entryFill, flatExit, "long");
    const timeStop = {
      label: economicLabel(timeFwd),
      fwdRet: timeFwd,
      reasonClose: "time_stop",
      reasonCloseFull: paperReason(["farm", "time_stop", "long"]),
      reasonOpenFull: paperReason(["farm", "passed_gates", "long"]),
      pnl: netPnlUsd(entryFill, flatExit, 2, "long"),
      costBps,
    };
    if (timeStop.label !== 0) throw new Error("losing time_stop label " + timeStop.label);
    if (!(timeStop.fwdRet < 0)) throw new Error("time_stop fwdRet should be net negative " + timeStop.fwdRet);
    if (timeStop.reasonClose !== "time_stop") throw new Error("short reasonClose " + timeStop.reasonClose);
    if (!timeStop.reasonCloseFull.includes(":paper") || timeStop.reasonCloseFull.includes(":live")) {
      throw new Error("reasonCloseFull " + timeStop.reasonCloseFull);
    }
    if (!timeStop.reasonOpenFull.includes(":paper") || timeStop.reasonOpenFull.includes(":live")) {
      throw new Error("reasonOpenFull " + timeStop.reasonOpenFull);
    }

    const open = paperReason(["farm", "passed_gates", "long"]);
    const flat = paperReason(["flatten_operator", "long"]);
    if (!open.endsWith(":paper") || open.includes(":live")) throw new Error("open reason " + open);
    if (!flat.includes("flatten_operator") || !flat.endsWith(":paper") || flat.includes(":live")) {
      throw new Error("flatten reason " + flat);
    }

    if (shouldPromote(568, 0.9, "paper", 0.368)) throw new Error("n=568 hit=0.368 must not promote");
    if (shouldPromote(568, 0.9, "paper")) throw new Error("n=568 missing hitRate must not promote");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("IMP-18 sleeve caps: farm 16, PnL 4, quarter-Kelly only after promote", () => {
  const src = `
    import { FARM_MAX_POS, PNL_MAX_POS, LIVE_MAX_POS, sleeveOpenSkip } from ${JSON.stringify(files.sleeves)};
    import { kellySizePct, KELLY_FRACTION, shouldPromote, PROMOTE_MIN_N, PROMOTE_MIN_AUC, PROMOTE_MIN_HIT } from ${JSON.stringify(files.kelly)};

    if (FARM_MAX_POS !== 16) throw new Error("farm max " + FARM_MAX_POS);
    if (PNL_MAX_POS !== 4) throw new Error("pnl max " + PNL_MAX_POS);
    if (LIVE_MAX_POS !== 2) throw new Error("live max " + LIVE_MAX_POS);
    if (KELLY_FRACTION !== 0.25) throw new Error("quarter-Kelly " + KELLY_FRACTION);

    if (PROMOTE_MIN_N !== 2000 || PROMOTE_MIN_AUC !== 0.55 || PROMOTE_MIN_HIT !== 0.52) {
      throw new Error("gates lowered");
    }
    if (shouldPromote(PROMOTE_MIN_N - 1, 0.99, "paper", 0.99)) throw new Error("n gate");
    if (shouldPromote(PROMOTE_MIN_N, 0.99, "synth", 0.99)) throw new Error("synth");

    if (sleeveOpenSkip({ kelly: true, maxPos: PNL_MAX_POS, nOpen: 0, promoted: false }) !== "not_promoted") {
      throw new Error("pnl flat until promote");
    }
    if (sleeveOpenSkip({ kelly: true, maxPos: PNL_MAX_POS, nOpen: 0, promoted: true }) !== null) {
      throw new Error("pnl open when promoted");
    }
    if (sleeveOpenSkip({ kelly: true, maxPos: PNL_MAX_POS, nOpen: 4, promoted: true }) !== "max_positions") {
      throw new Error("pnl max 4");
    }
    if (sleeveOpenSkip({ kelly: true, maxPos: PNL_MAX_POS, nOpen: 3, promoted: true }) !== null) {
      throw new Error("pnl 3 ok");
    }
    if (sleeveOpenSkip({ kelly: false, maxPos: FARM_MAX_POS, nOpen: 16, promoted: false }) !== "max_positions") {
      throw new Error("farm max 16");
    }
    if (sleeveOpenSkip({ kelly: false, maxPos: FARM_MAX_POS, nOpen: 15, promoted: false }) !== null) {
      throw new Error("farm 15 ok");
    }
    if (sleeveOpenSkip({ kelly: false, maxPos: FARM_MAX_POS, nOpen: 0, promoted: false }) !== null) {
      throw new Error("farm without promote ok");
    }

    const qk = kellySizePct(0.7, 0.02, 0.08);
    if (!(qk > 0) || qk > 0.08) throw new Error("quarter-Kelly size " + qk);
    if (Math.abs(qk - 0.08) > 1e-9) throw new Error("expected clamp to max " + qk);
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const decision = readFileSync(files.decisionSrc, "utf8");
  assert.match(decision, /MAX_POS: FARM_MAX_POS/);
  assert.match(decision, /MAX_POS: PNL_MAX_POS/);
  assert.match(decision, /kelly: false/);
  assert.match(decision, /kelly: true/);
  assert.match(decision, /TP_R: 2\.2/);
  assert.match(decision, /sleeveOpenSkip\(\{/);
  assert.match(decision, /kelly: profile\.kelly/);
  assert.doesNotMatch(decision, /MAX_POS: 16/);
  assert.doesNotMatch(decision, /MAX_POS: 4/);

  const engine = readFileSync(files.engine, "utf8");
  assert.match(engine, /sleeveOpenSkip/);
  assert.match(engine, /kelly: profile\.kelly/);
  assert.match(engine, /maxPos: profile\.MAX_POS/);
  assert.match(engine, /ENGINE_REV = 36/);
  assert.match(engine, /nOpen >= profile\.MAX_POS/);
});
