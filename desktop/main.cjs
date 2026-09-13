/**
 * Meridian Final — Windows shell.
 * Spawns the paper desk (Vite + PGLite) on 127.0.0.1 and loads it in a window.
 * Paper only. Not Kite. Not an order.
 */
const { app, BrowserWindow, Menu, Tray, nativeImage, dialog, shell } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const DESK_HOST = "127.0.0.1";
const DESK_PORT_START = 3000;
const DESK_PORT_END = 3010;
const READY_PATH = "/api/desk/ready";
const BOOT_MS = 180_000;

let mainWindow = null;
let tray = null;
let deskChild = null;
let allowQuit = false;
let balloonShown = false;
let deskPort = DESK_PORT_START;
const logLines = [];

function deskRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, "desk");
  return app.getAppPath();
}

function iconPath() {
  const ico = path.join(__dirname, "icon.ico");
  if (fs.existsSync(ico)) return ico;
  const png = path.join(__dirname, "icon.png");
  if (fs.existsSync(png)) return png;
  return undefined;
}

function bundledNode() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "node", "node.exe");
  }
  return process.env.npm_node_execpath || "node";
}

function userData() {
  return app.getPath("userData");
}

function logPath() {
  return path.join(userData(), "desk.log");
}

function appendLog(line) {
  const text = String(line).replace(/\s+$/g, "");
  if (!text) return;
  logLines.push(text);
  if (logLines.length > 400) logLines.splice(0, logLines.length - 400);
  try {
    fs.mkdirSync(userData(), { recursive: true });
    fs.appendFileSync(logPath(), `${new Date().toISOString()} ${text}\n`);
  } catch {
    /* ignore */
  }
}

function deskEnv(port) {
  const dataDir = path.join(userData(), "data");
  const pgliteDir = path.join(userData(), "pglite");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(pgliteDir, { recursive: true });
  const env = {
    ...process.env,
    MERIDIAN_DATA_DIR: dataDir,
    PGLITE_DATA_DIR: pgliteDir,
    BETTER_AUTH_URL: `http://${DESK_HOST}:${port}`,
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET || "meridian-desktop-paper-secret-change-me-32",
    HOST: DESK_HOST,
    PORT: String(port),
    BROWSER: "none",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  return env;
}

function findPort(start) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > DESK_PORT_END) {
        reject(new Error(`No free port in ${DESK_PORT_START}–${DESK_PORT_END}`));
        return;
      }
      const server = net.createServer();
      server.once("error", () => tryPort(port + 1));
      server.listen(port, DESK_HOST, () => {
        server.close(() => resolve(port));
      });
    };
    tryPort(start);
  });
}

function httpOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 15_000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitUntilReady(port, signal) {
  const deadline = Date.now() + BOOT_MS;
  const url = `http://${DESK_HOST}:${port}${READY_PATH}`;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error("cancelled");
    if (deskChild && deskChild.exitCode !== null) {
      throw new Error(`desk process exited ${deskChild.exitCode}`);
    }
    if (await httpOk(url)) return;
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(`desk did not become ready at ${url}`);
}

function killTree(child) {
  if (!child || child.killed) return;
  const pid = child.pid;
  if (!pid) return;
  try {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } catch {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
}

function startDesk(port) {
  const root = deskRoot();
  const nodeExe = bundledNode();
  const viteJs = path.join(root, "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(viteJs)) {
    throw new Error(`Vite missing at ${viteJs}`);
  }
  if (app.isPackaged && !fs.existsSync(nodeExe)) {
    throw new Error(`Bundled Node missing at ${nodeExe}`);
  }
  appendLog(`spawn ${nodeExe} vite --host ${DESK_HOST} --port ${port}`);
  const child = spawn(
    nodeExe,
    [viteJs, "dev", "--host", DESK_HOST, "--port", String(port), "--strictPort"],
    {
      cwd: root,
      env: deskEnv(port),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.stdout.on("data", (buf) => appendLog(buf.toString("utf8")));
  child.stderr.on("data", (buf) => appendLog(buf.toString("utf8")));
  child.on("error", (err) => appendLog(`spawn error ${err instanceof Error ? err.stack : err}`));
  child.on("exit", (code, signal) => {
    appendLog(`desk exit code=${code} signal=${signal}`);
    if (!allowQuit && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(errorPage(`Paper desk stopped (code ${code ?? signal ?? "?"}).`));
    }
  });
  deskChild = child;
  return child;
}

function errorPage(message) {
  const log = logLines.slice(-24).map((l) => escapeHtml(l)).join("\n");
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Meridian Final</title>
<style>
  html,body{margin:0;height:100%;background:#0a0b0c;color:#c8ccd4;font:15px/1.45 Segoe UI,sans-serif}
  main{max-width:640px;margin:12vh auto;padding:0 24px}
  h1{font-weight:600;font-size:20px;letter-spacing:.04em}
  p{color:#8b9098}
  pre{background:#121417;border:1px solid #1c2026;padding:12px;overflow:auto;font-size:11px;color:#9aa1ab}
</style></head><body><main>
  <h1>MERIDIAN FINAL</h1>
  <p>${escapeHtml(message)}</p>
  <p>Paper only. Not an order. Log: ${escapeHtml(logPath())}</p>
  <pre>${log}</pre>
</main></body></html>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createWindow() {
  const ico = iconPath();
  appendLog("createWindow");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0a0b0c",
    autoHideMenuBar: true,
    show: false,
    icon: ico,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, "splash.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", (e) => {
    if (allowQuit) return;
    e.preventDefault();
    mainWindow.hide();
    if (!balloonShown && tray && !tray.isDestroyed()) {
      balloonShown = true;
      try {
        tray.displayBalloon({
          icon: ico,
          title: "Meridian Final",
          content: "Paper loop still running. Quit from the tray to stop.",
        });
      } catch {
        /* ignore */
      }
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function createTray() {
  const ico = iconPath();
  const image = ico ? nativeImage.createFromPath(ico) : nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip("Meridian Final — paper desk");
  const menu = Menu.buildFromTemplate([
    {
      label: "Open desk",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit (stops paper)",
      click: () => {
        allowQuit = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

async function boot() {
  appendLog(`boot packaged=${app.isPackaged} desk=${deskRoot()} node=${bundledNode()}`);
  try {
    createWindow();
    createTray();
  } catch (err) {
    appendLog(`window failed: ${err instanceof Error ? err.stack : err}`);
  }
  try {
    deskPort = await findPort(DESK_PORT_START);
    startDesk(deskPort);
    await waitUntilReady(deskPort, { aborted: false });
    const url = `http://${DESK_HOST}:${deskPort}/`;
    appendLog(`ready ${url}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(url);
    } else {
      await shell.openExternal(url);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog(`boot failed: ${msg}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(errorPage(msg));
    } else {
      dialog.showErrorBox("Meridian Final", msg);
    }
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.setName("Meridian Final");
  if (process.platform === "win32") {
    app.setAppUserModelId("in.meridian.final");
  }
  app.whenReady().then(boot);
}

app.on("before-quit", () => {
  allowQuit = true;
  killTree(deskChild);
  deskChild = null;
});

app.on("window-all-closed", () => {
  // Tray keeps the paper loop alive until Quit.
});
