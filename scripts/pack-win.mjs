/**
 * Build MeridianFinal-Setup-<version>.exe (NSIS).
 * Downloads portable Node 22, rasterizes the icon, then electron-builder.
 */
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import https from "node:https";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = join(root, "desktop", "vendor");
const nodeExe = join(vendorDir, "node.exe");
const NODE_VERSION = "22.19.0";
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u, hops = 0) => {
      if (hops > 8) {
        reject(new Error(`too many redirects: ${u}`));
        return;
      }
      https
        .get(u, { headers: { "user-agent": "meridian-final-pack" } }, (res) => {
          const loc = res.headers.location;
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc) {
            const next = loc.startsWith("http") ? loc : new URL(loc, u).href;
            res.resume();
            follow(next, hops + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`download ${u} → ${res.statusCode}`));
            return;
          }
          const file = createWriteStream(dest);
          res.pipe(file);
          file.on("finish", () => file.close(resolve));
          file.on("error", reject);
        })
        .on("error", reject);
    };
    follow(url);
  });
}

async function ensureNode() {
  mkdirSync(vendorDir, { recursive: true });
  if (existsSync(nodeExe) && statSync(nodeExe).size > 40_000_000) {
    console.log("using existing desktop/vendor/node.exe");
    return;
  }
  console.log(`downloading Node ${NODE_VERSION} win-x64…`);
  await download(NODE_URL, nodeExe);
  const n = statSync(nodeExe).size;
  if (n < 40_000_000) {
    throw new Error(`node.exe too small (${n} bytes)`);
  }
  console.log(`node.exe ${Math.round(n / 1_048_576)} MB`);
}

async function ensureIcon() {
  const ico = join(root, "desktop", "icon.ico");
  if (existsSync(ico) && statSync(ico).size > 1000) {
    console.log("using existing desktop/icon.ico");
    return;
  }
  const iconMod = pathToFileURL(join(root, "scripts", "make-desktop-icon.mjs")).href;
  await import(iconMod);
}

function runBuilder() {
  const cli = join(root, "node_modules", "electron-builder", "cli.js");
  if (!existsSync(cli)) {
    throw new Error("electron-builder is not installed. Run npm install.");
  }
  const args = [cli, "--win", "nsis", "--x64", "--config", "desktop/electron-builder.yml"];
  console.log("electron-builder", args.slice(1).join(" "));
  const env = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  };
  const r = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error(`electron-builder exited ${r.status}`);
  }
}

const iconMod = join(root, "scripts", "make-desktop-icon.mjs");
await ensureIcon();
if (!existsSync(join(root, "desktop", "icon.ico"))) {
  await import(pathToFileURL(iconMod).href);
}
await ensureNode();
const outDir = join(root, "release");
if (existsSync(outDir)) {
  console.log("clearing release/");
  rmSync(outDir, { recursive: true, force: true });
}
runBuilder();

const out = join(root, "release");
console.log(`\nSetup exe is under ${out}`);
console.log("Paper only. Not an order.");
