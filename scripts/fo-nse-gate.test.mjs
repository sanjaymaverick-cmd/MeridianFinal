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

test("IMP-17 scan health: hung/NaN/blank/stuck surfaced; recover does not flatten", () => {
  const health = pathToFileURL(join(root, "../src/lib/meridian/scan-health.ts")).href;
  const src = `
    import { assessScanHealth, recoverHungLock, finitePx, SCAN_HUNG_MS, CLOCK_STUCK_MS } from ${JSON.stringify(health)};

    const now = 1_000_000;
    const ok = assessScanHealth({ now, lastTick: now, ticksRun: 3, tickLockSince: now - 1000, scan: [{ px: 100, metaProb: 0.6 }], liveCount: 4 });
    if (ok.status !== "ok") throw new Error("ok " + ok.status);
    if (ok.flatten !== false) throw new Error("ok flatten");

    const hung = assessScanHealth({ now, lastTick: now - 1000, ticksRun: 4, tickLockSince: now - SCAN_HUNG_MS - 1, scan: [{ px: 1, metaProb: 0.5 }], liveCount: 2 });
    if (!hung.hungScan || hung.status !== "hung_scan") throw new Error("hung " + hung.status);
    if (!hung.recover) throw new Error("hung should recover");
    if (hung.flatten !== false) throw new Error("hung flatten");
    if (!/not flattened/i.test(hung.label)) throw new Error("hung label " + hung.label);

    const nan = assessScanHealth({ now, lastTick: now, ticksRun: 2, tickLockSince: null, scan: [{ px: Number.NaN, metaProb: 0.4 }], liveCount: 1, dailyPnl: 0 });
    if (!nan.nan || nan.status !== "nan") throw new Error("nan " + nan.status);
    if (nan.flatten !== false) throw new Error("nan flatten");

    const blank = assessScanHealth({ now, lastTick: now, ticksRun: 5, tickLockSince: null, scan: [], liveCount: 0, tapeRows: 0 });
    if (!blank.blankTape || blank.status !== "blank_tape") throw new Error("blank " + blank.status);
    if (blank.flatten !== false) throw new Error("blank flatten");

    const stuck = assessScanHealth({ now, lastTick: now - CLOCK_STUCK_MS - 50, ticksRun: 8, tickLockSince: null, scan: [{ px: 2, metaProb: 0.5 }], liveCount: 3 });
    if (!stuck.stuckClock || stuck.status !== "stuck_clock") throw new Error("stuck " + stuck.status);

    if (finitePx(Number.NaN) || finitePx(0) || finitePx(-1) || finitePx(Infinity)) throw new Error("finitePx rejects");
    if (!finitePx(1.5)) throw new Error("finitePx 1.5");

    const rec = recoverHungLock({ lockHeld: true, lockSince: now - SCAN_HUNG_MS, now, openCount: 3 });
    if (!rec.recover) throw new Error("recover true");
    if (rec.flatten !== false) throw new Error("recover flatten");
    if (rec.keepOpen !== 3) throw new Error("keepOpen " + rec.keepOpen);

    const wait = recoverHungLock({ lockHeld: true, lockSince: now - 100, now, openCount: 3 });
    if (wait.recover) throw new Error("short lock should wait");
    if (wait.flatten !== false || wait.keepOpen !== 3) throw new Error("short lock flatten");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /assessScanHealth/);
  assert.match(engine, /recoverHungLock/);
  assert.match(engine, /finitePx\(mid\)/);
  assert.match(engine, /const ENGINE_REV = 36/);
  assert.match(engine, /__paperTickGen__/);
  assert.doesNotMatch(engine, /eng\\.positions = \\[\\]/);
  assert.match(engine, /:paper/);
  assert.doesNotMatch(engine, /:live`/);

  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");
  assert.match(autoPage, /data-scan-health/);
  assert.match(autoPage, /data-last-scan/);
  const markets = readFileSync(join(root, "../src/routes/markets.tsx"), "utf8");
  assert.match(markets, /data-blank-tape/);
  assert.match(markets, /BLANK TAPE/);
  const cmd = readFileSync(join(root, "../src/routes/index.tsx"), "utf8");
  assert.match(cmd, /data-stuck-clock/);
  assert.match(cmd, /data-scan-health/);
});
