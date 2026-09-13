import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Windows setup is an NSIS installer wrapping the paper desk", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.main, "desktop/main.cjs");
  assert.match(pkg.scripts["dist:win"], /pack-win/);
  assert.ok(pkg.devDependencies.electron);
  assert.ok(pkg.devDependencies["electron-builder"]);
  const shell = JSON.parse(readFileSync(join(root, "desktop", "package.json"), "utf8"));
  assert.equal(shell.main, "main.cjs");
  assert.equal(shell.productName, "Meridian Final");

  const yml = readFileSync(join(root, "desktop", "electron-builder.yml"), "utf8");
  assert.match(yml, /\bnsis\b/);
  assert.match(yml, /MeridianFinal-Setup/);
  assert.match(yml, /deleteAppDataOnUninstall: false/);
  assert.match(yml, /oneClick: false/);

  const main = readFileSync(join(root, "desktop", "main.cjs"), "utf8");
  assert.match(main, /127\.0\.0\.1/);
  assert.match(main, /MERIDIAN_DATA_DIR/);
  assert.match(main, /PGLITE_DATA_DIR/);
  assert.match(main, /\/api\/desk\/ready/);
  assert.match(main, /Not Kite/);

  const paths = readFileSync(join(root, "src", "lib", "server", "paths.ts"), "utf8");
  assert.match(paths, /MERIDIAN_DATA_DIR/);
  assert.ok(existsSync(join(root, "scripts", "pack-win.mjs")));
  assert.ok(existsSync(join(root, "desktop", "eula.txt")));
});
