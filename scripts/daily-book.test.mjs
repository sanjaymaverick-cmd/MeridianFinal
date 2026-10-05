/** IMP-37 IST day-roll and IMP-35 recovery must not zero a same-day loss. Fixed clock. No orders. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const book = pathToFileURL(join(root, "../src/lib/meridian/daily-book.ts")).href;

test("IMP-37 dailyPnl rolls on the IST date, not UTC and not restart", () => {
  const src = `
    import { istCalendarDay, reconcileDailyPnl } from ${JSON.stringify(book)};
    const loss = { ist: "2026-10-05", dailyPnl: -40 };
    const sameEvening = Date.parse("2026-10-05T18:00:00.000Z");
    const stillFifth = Date.parse("2026-10-05T18:29:00.000Z");
    const midnightIst = Date.parse("2026-10-05T18:30:00.000Z");
    if (istCalendarDay(sameEvening) !== "2026-10-05") throw new Error("23:30 IST day " + istCalendarDay(sameEvening));
    if (istCalendarDay(stillFifth) !== "2026-10-05") throw new Error("23:59 IST");
    if (istCalendarDay(midnightIst) !== "2026-10-06") throw new Error("00:00 IST must not stay on the UTC date");

    const mid = reconcileDailyPnl({ nowMs: sameEvening, file: loss, memoryPnl: 0, memoryIst: null });
    if (mid.rolled || mid.dailyPnl !== -40) throw new Error("restart mid-session zeroed " + JSON.stringify(mid));

    const before = reconcileDailyPnl({ nowMs: stillFifth, file: loss, memoryPnl: -40, memoryIst: "2026-10-05" });
    if (before.rolled || before.dailyPnl !== -40) throw new Error("23:59 IST rolled " + JSON.stringify(before));

    const rolled = reconcileDailyPnl({ nowMs: midnightIst, file: loss, memoryPnl: 0, memoryIst: null });
    if (!rolled.rolled || rolled.dailyPnl !== 0 || rolled.ist !== "2026-10-06") {
      throw new Error("00:00 IST restart did not roll " + JSON.stringify(rolled));
    }

    const liveRoll = reconcileDailyPnl({ nowMs: midnightIst, file: loss, memoryPnl: -40, memoryIst: "2026-10-05" });
    if (!liveRoll.rolled || liveRoll.dailyPnl !== 0) throw new Error("live midnight " + JSON.stringify(liveRoll));
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("IMP-35 old bug: recovery and PGLite reseat set daily_loss to 0 on the same IST day", () => {
  const src = `
    import { reconcileDailyPnl, dailyFileOutsidePglite } from ${JSON.stringify(book)};
    const now = Date.parse("2026-10-05T08:00:00.000Z");
    const file = { ist: "2026-10-05", dailyPnl: -125.5 };
    const wiped = reconcileDailyPnl({ nowMs: now, file, memoryPnl: 0, memoryIst: "2026-10-05" });
    if (wiped.dailyPnl !== -125.5 || wiped.rolled) {
      throw new Error("old bug still zeroes same-day loss " + JSON.stringify(wiped));
    }
    const outside = dailyFileOutsidePglite("D:/desk/data/paper-daily.json", "D:/desk/data/pglite");
    if (!outside) throw new Error("daily book must sit outside the reseat dir");
    const inside = dailyFileOutsidePglite("D:/desk/data/pglite/paper-daily.json", "D:/desk/data/pglite");
    if (inside) throw new Error("a book inside pglite would be wiped by reseat");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /old bug set daily_loss \/ dailyPnl to 0/);
  assert.match(engine, /Hung recovery does not flatten|Do not flatten/);
  assert.doesNotMatch(engine, /hung\.dailyPnl = 0/);
  const db = readFileSync(join(root, "../src/lib/db.ts"), "utf8");
  assert.match(db, /dailyFileOutsidePglite/);
});
