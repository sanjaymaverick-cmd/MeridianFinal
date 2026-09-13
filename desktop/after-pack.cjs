const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/** electron-builder afterPack — package.json + icon, no Authenticode. */
exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const appDir = path.join(appOutDir, "resources", "app");
  const dest = path.join(appDir, "package.json");
  const src = path.join(__dirname, "package.json");
  if (!fs.existsSync(dest) && fs.existsSync(src)) {
    fs.mkdirSync(appDir, { recursive: true });
    fs.copyFileSync(src, dest);
    console.log("afterPack: wrote", dest);
  }

  const exe = path.join(appOutDir, "Meridian Final.exe");
  const ico = path.join(__dirname, "icon.ico");
  const rcedit = path.join(
    context.packager.projectDir,
    "node_modules",
    "electron-winstaller",
    "vendor",
    "rcedit.exe",
  );
  if (fs.existsSync(exe) && fs.existsSync(ico) && fs.existsSync(rcedit)) {
    const r = spawnSync(rcedit, [exe, "--set-icon", ico], { stdio: "inherit" });
    if (r.status !== 0) {
      console.warn("afterPack: rcedit failed", r.status);
    }
  }
};
