import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isBannedPath,
  scanText,
  scanPathList,
  runScan,
} from "./secret-scan.mjs";

test("IMP-08 banned paths: .env and key material blocked; .env.example allowed", () => {
  assert.equal(isBannedPath(".env"), true);
  assert.equal(isBannedPath(".env.local"), true);
  assert.equal(isBannedPath("nested/.env.production"), true);
  assert.equal(isBannedPath(".env.example"), false);
  assert.equal(isBannedPath("secrets/id_rsa"), true);
  assert.equal(isBannedPath("certs/server.pem"), true);
  assert.equal(isBannedPath("credentials.json"), true);
  assert.equal(isBannedPath("data/paper-samples.jsonl"), true);
  assert.equal(isBannedPath("data/paper-heartbeat.json"), true);
  assert.equal(isBannedPath("data/.gitkeep"), false);
  assert.equal(isBannedPath("data/agent-motion-3d/REPORT.md"), false);
  assert.equal(isBannedPath("src/lib/server/desk.ts"), false);
});

test("IMP-08 content: private keys and live env assigns fail; placeholders and process.env pass", () => {
  // Build markers at runtime so this test file does not itself trip the tree scan.
  const pemHeader = ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ");
  const pk = scanText("leak.txt", pemHeader + "\nMIIE\n");
  assert.equal(pk.length, 1);
  assert.equal(pk[0].rule, "private-key");

  const kite = "KITE_API_" + "SECRET";
  const xai = "XAI_API_" + "KEY";
  const live = scanText(
    "bad.env",
    kite + "=liveSecretValue99\n" + xai + '="sk-abcdefghijklmnopqrstuvwxyz"\n',
  );
  assert.ok(live.some((f) => f.rule === "env-assign:" + kite));
  assert.ok(live.some((f) => f.rule === "env-assign:" + xai));

  const placeholder = scanText(
    ".env.example",
    ["BETTER_AUTH_SECRET=meridian-local-dev-secret-change-me-32", "# XAI_API_" + "KEY=", "KITE_API_" + "KEY="].join("\n") + "\n",
  );
  assert.deepEqual(placeholder, []);

  const code = scanText(
    "src/lib/server/desk.ts",
    'const apiKey = process.env.XAI_API_KEY;\nif (!apiKey) return;\n',
  );
  assert.deepEqual(code, []);

  const commented = scanText("notes.txt", "# " + "KITE_API_SECRET" + "=should-not-matter\n");
  assert.deepEqual(commented, []);
});

test("IMP-08 scanPathList reports banned path without reading content", () => {
  const findings = scanPathList([".env", "ok.txt"], {
    readFile: (p) => (p === "ok.txt" ? "hello\n" : "SECRET=should-not-be-read"),
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "banned-path");
  assert.equal(findings[0].path, ".env");
});

test("IMP-08 repo tree is currently clean", () => {
  const findings = runScan({ mode: "tree" });
  assert.deepEqual(
    findings,
    [],
    findings.map((f) => `${f.path}:${f.line}:${f.rule}`).join("; "),
  );
});
