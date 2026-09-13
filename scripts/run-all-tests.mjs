import { globSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = globSync("scripts/*.test.mjs");
const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
