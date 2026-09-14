/**
 * Snapshot for the Grok paper operator. Read-only. Not an order.
 * Usage: node scripts/grok-bot-desk-snapshot.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const appData = process.env.APPDATA || "";
const installed = join(appData, "Meridian Final");
const hbCandidates = [
  join(installed, "data", "paper-heartbeat.json"),
  join(process.cwd(), "data", "paper-heartbeat.json"),
];
const sampleCandidates = [
  join(installed, "data", "paper-samples.jsonl"),
  join(process.cwd(), "data", "paper-samples.jsonl"),
];
const logCandidates = [join(installed, "desk.log"), join(process.cwd(), "data", "desk.log")];

function firstExisting(paths) {
  return paths.find((p) => existsSync(p)) ?? null;
}

function httpReady() {
  const r = spawnSync("curl.exe", ["-sS", "-m", "8", "http://127.0.0.1:3000/api/desk/ready"], {
    encoding: "utf8",
  });
  if (r.status === 0 && r.stdout) return r.stdout.trim();
  return null;
}

function processes() {
  const r = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'Meridian|electron' } | Select-Object -ExpandProperty ProcessName",
    ],
    { encoding: "utf8" },
  );
  const names = (r.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(names)];
}

function loadJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function loadSamples(p) {
  if (!p || !existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .trim()
    .split(/\n/)
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const shown = (n) => Math.round(n);
const samePx = (a, b) => a > 0 && b > 0 && (Math.abs(a - b) / a < 0.0005 || Math.abs(a - b) < 1e-10);

const hbPath = firstExisting(hbCandidates);
const samplePath = firstExisting(sampleCandidates);
const logPath = firstExisting(logCandidates);
const hb = hbPath ? loadJson(hbPath) : null;
const rows = loadSamples(samplePath);
const tiny = rows.filter((r) => [0, 1, -1].includes(shown(r.pnl)));
const same = rows.filter((r) => samePx(r.entry, r.exit));
const now = Date.now();
const hbAge = hb?.ts ? now - Number(hb.ts) : null;
const ready = httpReady();
const procs = processes();

let logTail = "";
if (logPath) {
  const txt = readFileSync(logPath, "utf8");
  logTail = txt.trim().split(/\n/).slice(-8).join(" | ");
}

const fail = [];
if (!procs.length) fail.push("no Meridian process");
if (!ready) fail.push("ready HTTP down");
if (!hb) fail.push("heartbeat missing");
if (hbAge != null && hbAge > 180_000) fail.push(`heartbeat stale ${hbAge}ms`);
if (hb && hb.mode !== "auto") fail.push(`mode=${hb.mode}`);
if (hb && hb.killed) fail.push("killed/Halt");
if (/desk exit code=|boot failed:/.test(logTail)) fail.push("desk log exit");

const out = {
  ok: fail.length === 0,
  fail,
  procs,
  ready,
  heartbeatPath: hbPath,
  hbAgeMs: hbAge,
  mode: hb?.mode ?? null,
  killed: hb?.killed ?? null,
  open: hb?.open ?? null,
  names: hb?.names ?? [],
  ticksRun: hb?.ticksRun ?? null,
  samplesHb: hb?.samples ?? null,
  samplesFile: rows.length,
  pnlUsdSum: rows.reduce((a, r) => a + Number(r.pnl || 0), 0),
  shown0: tiny.filter((r) => shown(r.pnl) === 0).length,
  shown1: tiny.filter((r) => shown(r.pnl) === 1).length,
  shownM1: tiny.filter((r) => shown(r.pnl) === -1).length,
  samePrintN: same.length,
  lastSample: rows.at(-1)
    ? {
        symbol: rows.at(-1).symbol,
        pnl: rows.at(-1).pnl,
        close: rows.at(-1).reasonClose,
        ist: rows.at(-1).closed_ist,
      }
    : null,
  sampleMtime: samplePath && existsSync(samplePath) ? statSync(samplePath).mtime.toISOString() : null,
  note: "PnL is USD; UI inr() rounds to ₹0/₹1/−₹1. Paper only. Not an order.",
};

console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 2);
