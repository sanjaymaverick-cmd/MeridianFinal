/** Fresh book boots paused. A saved auto book is not Halted. Boot never Arms. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const bootUrl = pathToFileURL(join(root, "../src/lib/meridian/boot-session.ts")).href;

test("cold boot: fresh book paused; saved auto stays auto; stale heartbeat does not resume", () => {
  const now = Date.parse("2026-10-05T11:16:00.000Z");
  const src = `
    import { freshBookBoot, bootFromSavedSession, bootFromHeartbeat } from ${JSON.stringify(bootUrl)};
    const fresh = freshBookBoot();
    if (fresh.mode !== "advisory" || fresh.killed !== true) throw new Error("fresh book must boot paused " + JSON.stringify(fresh));
    const none = bootFromSavedSession(null);
    if (none.mode !== "advisory" || none.killed !== true) throw new Error("missing session " + JSON.stringify(none));

    const auto = bootFromSavedSession({ mode: "auto", killed: false });
    if (auto.mode !== "auto" || auto.killed !== false) throw new Error("saved auto was Halted " + JSON.stringify(auto));
    const paused = bootFromSavedSession({ mode: "auto", killed: true });
    if (paused.mode !== "auto" || paused.killed !== true) throw new Error("a paused auto book must stay paused " + JSON.stringify(paused));

    const armed = bootFromSavedSession({ mode: "live", killed: false });
    if (armed.mode !== "advisory" || armed.killed !== true) throw new Error("boot Armed " + JSON.stringify(armed));
    const blank = bootFromSavedSession({ mode: "auto" });
    if (blank.killed !== true) throw new Error("missing killed must not resume");

    const freshHb = bootFromHeartbeat({ mode: "auto", killed: false, ts: ${now} - 60_000 }, ${now});
    if (!freshHb || freshHb.mode !== "auto" || freshHb.killed !== false) throw new Error("fresh heartbeat " + JSON.stringify(freshHb));
    const stale = bootFromHeartbeat({ mode: "auto", killed: false, ts: Date.parse("2026-09-13T10:00:00.000Z") }, ${now});
    if (stale) throw new Error("stale heartbeat resumed auto");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  const empty = engine.slice(engine.indexOf("function emptyEngine"), engine.indexOf("function emptyEngine") + 500);
  assert.match(empty, /mode:\s*"advisory"/);
  assert.match(empty, /killed:\s*true/);
  assert.match(engine, /bootFromSavedSession\(saved\)/);
  assert.match(engine, /bootFromHeartbeat\(readHeartbeatRaw\(\), Date\.now\(\)\)/);
  assert.match(engine, /freshBookBoot\(\)/);
  assert.match(engine, /const ENGINE_REV = 46/);
  assert.match(engine, /intent = manage\(/);
  const flags = engine.slice(engine.indexOf("export function setEngineFlags"), engine.indexOf("export function resetEngine"));
  assert.match(flags, /does not roll dailyPnl/);
  assert.doesNotMatch(flags, /reconcileDailyPnl|persistDaily/);
  const recovery = engine.slice(engine.indexOf("old bug set daily_loss"), engine.indexOf("hung.scanHealth"));
  assert.match(recovery, /Do not roll the IST day/);
  assert.doesNotMatch(recovery, /reconcileDailyPnl|persistDaily|hung\.dailyPnl = 0/);
});
