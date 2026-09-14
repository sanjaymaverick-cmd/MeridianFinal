/** IMP-25 — Live chrome locked; nothing armable; do not implement F6 / LIVE_OK. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(root, "..", rel), "utf8");

test("IMP-25 LIVE_CHROME is locked; MODE_CHIPS has no selectable live", () => {
  const copy = read("src/lib/meridian/operator-copy.ts");
  assert.match(copy, /export const LIVE_CHROME/);
  assert.match(copy, /id: "live" as const/);
  assert.match(copy, /label: "Live"/);
  assert.match(copy, /hint: "Locked\. No F6\. Kite off\."/);
  assert.match(copy, /locked: true as const/);
  // Selectable modes stay paper-only
  assert.match(copy, /export const MODE_CHIPS = \[/);
  const chipsBlock = copy.slice(copy.indexOf("export const MODE_CHIPS"), copy.indexOf("export const LIVE_CHROME"));
  assert.doesNotMatch(chipsBlock, /id: "live"/);
  assert.doesNotMatch(chipsBlock, /\bArm\b/);
});

test("IMP-25 Auto + shell render locked Live chrome; no Arm / F6 / LIVE_OK path", () => {
  const auto = read("src/routes/auto.tsx");
  const shell = read("src/components/desk-shell.tsx");
  const engine = read("src/components/auto-engine.tsx");
  const desk = read("src/lib/server/desk.ts");
  const paper = read("src/lib/server/paper-engine.ts");

  assert.match(auto, /LIVE_CHROME/);
  assert.match(auto, /data-live-chrome="locked"/);
  assert.match(auto, /\{LIVE_CHROME\.label\} · locked/);
  // Locked button: disabled, no setDeskMode("live")
  const liveIdx = auto.indexOf("data-live-chrome");
  const liveBtn = auto.slice(Math.max(0, liveIdx - 180), liveIdx + 220);
  assert.match(liveBtn, /\bdisabled\b/);
  assert.doesNotMatch(liveBtn, /setDeskMode/);
  assert.doesNotMatch(auto, /setDeskMode\(\s*["']live["']\s*\)/);

  assert.match(shell, /LIVE_CHROME/);
  assert.match(shell, /data-live-chrome="locked"/);
  assert.match(shell, /\{LIVE_CHROME\.label\} locked/);
  assert.match(shell, /Resume paper/);
  assert.doesNotMatch(shell, /\bArm\b/);
  assert.doesNotMatch(auto, /\bArm\b/);

  // Mode union stays advisory|paper|auto — never live
  assert.match(engine, /setDeskMode\(mode: "advisory" \| "paper" \| "auto"\)/);
  assert.match(desk, /mode\?: "advisory" \| "paper" \| "auto"/);
  assert.match(paper, /mode: "advisory" \| "paper" \| "auto"/);

  // Forbidden: do not implement F6 / LIVE_OK live path
  for (const [name, src] of [
    ["auto", auto],
    ["shell", shell],
    ["engine-client", engine],
    ["desk", desk],
    ["paper-engine", paper],
  ]) {
    assert.doesNotMatch(src, /LIVE_OK/, `${name} must not reference LIVE_OK`);
    assert.doesNotMatch(src, /\bF6\b/, `${name} must not implement F6`);
  }
});
