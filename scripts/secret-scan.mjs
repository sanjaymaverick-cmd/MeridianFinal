/**
 * IMP-08 secret scan — fail the PR/tree if secrets, keys, or .env land in git.
 *
 * Scans:
 *   1) banned paths among git-tracked files (and optional diff paths)
 *   2) high-confidence secret content in text files / diff hunks
 *
 * Does not require gitleaks. Pure Node. Never prints secret values — only paths.
 *
 * Usage:
 *   node scripts/secret-scan.mjs           # tracked tree
 *   node scripts/secret-scan.mjs --ci      # tree + diff vs origin/main (or main)
 *   node scripts/secret-scan.mjs --diff A...B
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Paths that must never be tracked (allow .env.example). */
export function isBannedPath(relPath) {
  const p = String(relPath).replace(/\\/g, "/").replace(/^\.\//, "");
  if (p === ".env.example" || p.endsWith("/.env.example")) return false;
  if (/(^|\/)\.env(\.|$)/.test(p)) return true;
  if (/\.(pem|p12|pfx)$/i.test(p)) return true;
  if (/(^|\/)(id_rsa|id_ed25519|id_ecdsa)$/i.test(p)) return true;
  if (/(^|\/)(credentials|secrets|service-account)\.json$/i.test(p)) return true;
  // Runtime artefacts — gitignored; fail if force-added
  if (/^data\/.*\.(json|jsonl|sqlite3?|db)$/i.test(p)) return true;
  return false;
}

const PLACEHOLDER =
  /^(change-me|changeme|your[_-]?|xxx+|placeholder|example|dummy|test|todo|fixme|none|null|empty|<[^>]+>|\$\{|[.*=-]{0,3})$/i;

/** Lines that assign broker/API secrets to a non-placeholder value. */
const ASSIGN_RE =
  /^\s*(?:export\s+)?(KITE_API_KEY|KITE_API_SECRET|KITE_ACCESS_TOKEN|XAI_API_KEY|OPENAI_API_KEY|BETTER_AUTH_SECRET|DATABASE_URL|AWS_SECRET_ACCESS_KEY|GH_TOKEN|GITHUB_TOKEN)\s*=\s*(.+?)\s*$/;

const CONTENT_RES = [
  { id: "private-key", re: /-----BEGIN[ A-Z0-9]*PRIVATE KEY-----/ },
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "github-token", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
  { id: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];

function stripQuotes(v) {
  const s = String(v).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function isPlaceholderValue(raw) {
  const v = stripQuotes(raw).trim();
  if (!v) return true;
  if (PLACEHOLDER.test(v)) return true;
  if (/change-me/i.test(v)) return true;
  if (/^postgres(ql)?:\/\/user:pass@/i.test(v)) return true; // .env.example style
  if (/^https?:\/\/localhost\b/i.test(v)) return true;
  return false;
}

/**
 * Return finding objects { path, rule, line } — never include secret material.
 */
export function scanText(relPath, text) {
  const findings = [];
  const p = String(relPath).replace(/\\/g, "/");
  // Allow documented placeholders only in .env.example
  const allowPlaceholders = p === ".env.example" || p.endsWith("/.env.example");

  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    for (const { id, re } of CONTENT_RES) {
      if (re.test(line)) {
        findings.push({ path: p, rule: id, line: i + 1 });
      }
    }

    const m = line.match(ASSIGN_RE);
    if (m) {
      const value = m[2];
      if (allowPlaceholders && isPlaceholderValue(value)) continue;
      if (isPlaceholderValue(value)) continue;
      // process.env.FOO = ... in source is not an assignment of a literal secret
      if (/\bprocess\.env\b/.test(line)) continue;
      findings.push({ path: p, rule: `env-assign:${m[1]}`, line: i + 1 });
    }
  }
  return findings;
}

export function scanPathList(paths, { readFile = defaultRead } = {}) {
  const findings = [];
  for (const rel of paths) {
    const p = String(rel).replace(/\\/g, "/");
    if (isBannedPath(p)) {
      findings.push({ path: p, rule: "banned-path", line: 0 });
      continue;
    }
    const text = readFile(p);
    if (text == null) continue;
    findings.push(...scanText(p, text));
  }
  return findings;
}

function defaultRead(rel) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return null;
  try {
    const buf = readFileSync(abs);
    // skip obvious binaries
    if (buf.includes(0)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

function git(args) {
  const r = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) {
    return { ok: false, stdout: r.stdout || "", stderr: r.stderr || "" };
  }
  return { ok: true, stdout: r.stdout || "", stderr: r.stderr || "" };
}

export function listTrackedFiles() {
  const r = git(["ls-files", "-z"]);
  if (!r.ok) throw new Error(`git ls-files failed: ${r.stderr}`);
  return r.stdout.split("\0").filter(Boolean);
}

/** Paths touched in a git diff range (A...B or --cached). */
export function listDiffPaths(range) {
  const args =
    range === "--cached"
      ? ["diff", "--cached", "--name-only", "-z"]
      : ["diff", "--name-only", "-z", range];
  const r = git(args);
  if (!r.ok) throw new Error(`git diff failed: ${r.stderr || r.stdout}`);
  return r.stdout.split("\0").filter(Boolean);
}

/** Added/changed line text from a diff range, keyed by path (for content scan). */
export function diffAddedTexts(range) {
  const args =
    range === "--cached"
      ? ["diff", "--cached", "-U0", "--no-color"]
      : ["diff", "-U0", "--no-color", range];
  const r = git(args);
  if (!r.ok) throw new Error(`git diff failed: ${r.stderr || r.stdout}`);
  const byPath = new Map();
  let current = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      current = line.slice(6);
      if (current === "/dev/null") {
        current = null;
        continue;
      }
      if (!byPath.has(current)) byPath.set(current, []);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      byPath.get(current).push(line.slice(1));
    }
  }
  const out = new Map();
  for (const [p, lines] of byPath) out.set(p, lines.join("\n"));
  return out;
}

export function resolveCiDiffRange() {
  // Prefer merge-base with origin/main, then main, then --cached for local pre-commit feel
  for (const base of ["origin/main", "main"]) {
    const r = git(["rev-parse", "--verify", base]);
    if (!r.ok) continue;
    return `${base}...HEAD`;
  }
  return "--cached";
}

export function runScan({ mode = "tree", diffRange } = {}) {
  const findings = [];

  if (mode === "tree" || mode === "ci") {
    const tracked = listTrackedFiles();
    findings.push(...scanPathList(tracked));
  }

  if (mode === "diff" || mode === "ci") {
    const range = diffRange || resolveCiDiffRange();
    const paths = listDiffPaths(range);
    for (const p of paths) {
      if (isBannedPath(p)) {
        findings.push({ path: p, rule: "banned-path-in-diff", line: 0 });
      }
    }
    const added = diffAddedTexts(range);
    for (const [p, text] of added) {
      if (isBannedPath(p)) continue; // already reported
      for (const f of scanText(p, text)) {
        findings.push({ ...f, rule: `diff:${f.rule}` });
      }
    }
  }

  // de-dupe
  const seen = new Set();
  return findings.filter((f) => {
    const k = `${f.path}|${f.rule}|${f.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function formatFindings(findings) {
  return findings
    .map((f) =>
      f.line
        ? `SECRET SCAN FAIL: ${f.path}:${f.line} [${f.rule}]`
        : `SECRET SCAN FAIL: ${f.path} [${f.rule}]`,
    )
    .join("\n");
}

export function main(argv = process.argv.slice(2)) {
  let mode = "tree";
  let diffRange;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ci") mode = "ci";
    else if (a === "--diff") {
      mode = "diff";
      diffRange = argv[++i];
      if (!diffRange) {
        console.error("secret-scan: --diff requires a git range (e. to main...HEAD)");
        return 2;
      }
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/secret-scan.mjs [--ci | --diff RANGE]
Fails (exit 1) if secrets/keys/.env appear in the tracked tree or PR diff.
Never stages or prints secret values.`);
      return 0;
    } else {
      console.error(`secret-scan: unknown arg ${a}`);
      return 2;
    }
  }

  let findings;
  try {
    findings = runScan({ mode, diffRange });
  } catch (err) {
    console.error(`secret-scan: ${err.message || err}`);
    return 2;
  }

  if (findings.length) {
    console.error(formatFindings(findings));
    console.error(
      `\n${findings.length} finding(s). Remove secrets from the tree/diff. Never commit .env or data/** artefacts.`,
    );
    return 1;
  }
  console.log(
    mode === "ci"
      ? "secret-scan: clean (tree + diff)"
      : mode === "diff"
        ? "secret-scan: clean (diff)"
        : "secret-scan: clean (tree)",
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("secret-scan.mjs")) {
  process.exit(main());
}
