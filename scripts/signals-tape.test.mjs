/** IMP-11: a Signals tick produces scan rows and zero new opens. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));

test("IMP-11 Signals tick: scan rows, zero opens, Auto-send stays separate", () => {
  const copyPath = join(root, "../src/lib/meridian/operator-copy.ts");
  const kelly = pathToFileURL(join(root, "../src/lib/meridian/kelly.ts")).href;
  const watch = readFileSync(join(root, "../src/lib/meridian/paper-watch.ts"), "utf8");
  const gate = watch.match(/export function autoCanSend\(mode: string, killed: boolean\) \{([\s\S]*?)\n\}/);
  assert.ok(gate, "autoCanSend missing");
  const copyBody = readFileSync(copyPath, "utf8")
    .replace('from "./kelly"', `from ${JSON.stringify(kelly)}`)
    .replace(/export \{ explainReason \} from "\.\/reasons";\s*/, "");
  const src = copyBody + `
    function autoCanSend(mode, killed) { ${gate[1]} }
    const intents = [
      { symbol: "BTC", action: "BUY" },
      { symbol: "ETH", action: "SELL" },
    ];
    const mode = "advisory";
    const killed = false;
    const execute = autoCanSend(mode, killed);
    const scan = intents.map((row) => ({ symbol: row.symbol, label: wouldActionLabel(row.action, mode) }));
    const opens = [];
    if (execute) {
      for (const row of intents) {
        if (row.action === "BUY" || row.action === "SELL") opens.push(row.symbol);
      }
    }
    if (scan.length !== 2) throw new Error("scan rows " + scan.length);
    if (scan[0].label !== "Would BUY" || scan[1].label !== "Would SELL") throw new Error(JSON.stringify(scan));
    if (opens.length !== 0) throw new Error("Signals tick opened " + opens.join(","));
    if (autoCanSend("auto", false) !== true) throw new Error("Auto-send must stay a separate mode");
    if (autoCanSend("advisory", false) !== false) throw new Error("Signals inherited auto-send");
    if (autoCanSend("paper", false) !== false) throw new Error("Paper must not auto-send");
    if (signalsCanApprove("advisory")) throw new Error("Signals must not Approve");
    const blurb = actionCenterBlurb("advisory", false);
    if (/\\bArm\\b/.test(blurb)) throw new Error("copy says Arm");
    if (!/not sent/i.test(blurb) || !/Last scan still refreshes/i.test(blurb)) throw new Error(blurb);
  `;
  const dir = mkdtempSync(join(tmpdir(), "imp11-tick-"));
  const file = join(dir, "signals-tick.ts");
  writeFileSync(file, src);
  const r = spawnSync(process.execPath, ["--experimental-strip-types", file], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  const scanAt = engine.indexOf("scan.push(");
  const stopAt = engine.indexOf("if (!execute) return;");
  assert.ok(scanAt > 0 && stopAt > scanAt, "scan rows are built before Signals refuses the open");
  assert.match(engine, /const execute = autoCanSend\(eng\.mode, eng\.killed\)/);
  assert.match(engine, /error: "signals_propose_only"/);
});
