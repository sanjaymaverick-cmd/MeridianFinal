/** IMP-24 — BUILD_PLAN / README match code gates and Resume paper (never Arm). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("IMP-24: README gates + Resume paper match kelly.ts / desk-shell", () => {
  const readme = read("README.md");
  const kelly = read("src/lib/meridian/kelly.ts");
  const shell = read("src/components/desk-shell.tsx");

  assert.match(kelly, /PROMOTE_MIN_N\s*=\s*2_000/);
  assert.match(kelly, /PROMOTE_MIN_AUC\s*=\s*0\.55/);
  assert.match(kelly, /PROMOTE_MIN_HIT\s*=\s*0\.52/);
  assert.match(shell, /Resume paper/);
  assert.doesNotMatch(shell, /\bArm\b/);

  assert.match(readme, /n≥2000/);
  assert.match(readme, /AUC≥0\.55/);
  assert.match(readme, /hit>52%/);
  assert.match(readme, /Resume paper/);
  assert.match(readme, /never Arm/);
  // PnL sleeve language must not say "armed" (live Arm confusion)
  assert.doesNotMatch(readme, /\barmed\b/i);
});

test("IMP-24: BUILD_PLAN gates + Resume paper; never lower gates", () => {
  const plan = read("docs/BUILD_PLAN.md");
  assert.match(plan, /n≥2000/);
  assert.match(plan, /AUC≥0\.55/);
  assert.match(plan, /hit>52%/);
  assert.match(plan, /Resume paper/);
  assert.match(plan, /never Arm/);
  assert.match(plan, /Missing `hitRate` defaults to 0/);
  assert.match(plan, /PnL sleeve opens only if n≥2000/);
  // Do not document a lower bar than code
  assert.doesNotMatch(plan, /n\s*[≥>=]\s*(?:500|1000|1500)\b/);
  assert.doesNotMatch(plan, /AUC\s*[≥>=]\s*0\.5[^0-9]/);
  assert.doesNotMatch(plan, /hit\s*[>≥>]\s*5[01]%/);
});
