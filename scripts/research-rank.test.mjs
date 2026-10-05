/** IMP-19: rank the query or return empty. No canned six-pack. Heuristic is not "model". */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const core = pathToFileURL(join(root, "../src/lib/meridian/research-rank-core.ts")).href;

test("IMP-19 research ranks the query or returns empty; heuristic is not model", () => {
  const src = `
    import { rankFromUniverse, researchAnswer, researchSourceLabel } from ${JSON.stringify(core)};
    const book = [
      { symbol: "POLYCAB", name: "Polycab", sector: "Cables", quality: 100, sentiment: 7, themes: ["cables", "ai-data-center", "power"], thesis: "cables", assetClass: "equity" },
      { symbol: "KEI", name: "KEI", sector: "Cables", quality: 100, sentiment: 7, themes: ["cables", "ai-data-center"], thesis: "cables", assetClass: "equity" },
      { symbol: "SBIN", name: "SBI", sector: "Banks", quality: 100, sentiment: 6, themes: ["banks"], thesis: "bank", assetClass: "equity" },
      { symbol: "TCS", name: "TCS", sector: "IT", quality: 100, sentiment: 5, themes: ["it-services"], thesis: "it", assetClass: "equity" },
      { symbol: "RELIANCE", name: "Reliance", sector: "Energy", quality: 100, sentiment: 5, themes: ["energy"], thesis: "energy", assetClass: "equity" },
      { symbol: "INFY", name: "Infosys", sector: "IT", quality: 100, sentiment: 5, themes: ["it-services"], thesis: "it", assetClass: "equity" },
      { symbol: "BTC", name: "Bitcoin", sector: "Crypto", quality: 100, sentiment: 7, themes: ["crypto", "delta"], thesis: "btc", assetClass: "crypto" },
    ];
    const junk = rankFromUniverse("zzzzqwerty not a real sleeve", book);
    if (junk.names.length) throw new Error("canned six-pack " + junk.names.map((n) => n.symbol).join(","));
    if (!junk.emptyNote) throw new Error("empty needs a reason");

    const qualityOnly = rankFromUniverse("xqvqv nothing matches this phrase", book);
    if (qualityOnly.names.length) throw new Error("quality minted a six-pack");

    const spares = rankFromUniverse("spares and components for AI data centers", book);
    const syms = spares.names.map((n) => n.symbol);
    if (!syms.includes("POLYCAB") || !syms.includes("KEI")) throw new Error("spares " + syms.join(","));
    if (syms.includes("SBIN")) throw new Error("bank leaked");

    const canned = ["SBIN", "TCS", "RELIANCE", "INFY", "HDFCBANK", "ICICIBANK"];
    const ignored = researchAnswer("zzzzqwerty not a real sleeve", book, canned);
    if (ignored.names.length) throw new Error("grok six-pack returned " + ignored.names.map((n) => n.symbol));
    if (ignored.source !== "heuristic") throw new Error("source " + ignored.source);
    if (!ignored.emptyNote) throw new Error("empty grok still needs a reason");

    const ranked = researchAnswer("crypto bitcoin", book, canned);
    if (!ranked.names.some((n) => n.symbol === "BTC")) throw new Error("crypto rank missing");
    if (ranked.names.some((n) => n.symbol === "SBIN")) throw new Error("canned bank survived");
    if (ranked.source !== "heuristic") throw new Error("unrelated grok must not label the rank as grok");

    const agreed = researchAnswer("crypto bitcoin", book, ["BTC"]);
    if (agreed.source !== "grok") throw new Error("matching grok symbol should stay grok");
    if (!agreed.names.some((n) => n.symbol === "BTC")) throw new Error("agreed rank");

    for (const label of [researchSourceLabel("desk", false), researchSourceLabel("heuristic", true), researchSourceLabel("grok", true)]) {
      if (/\\bmodel\\b/i.test(label)) throw new Error("labelled model: " + label);
    }
    if (researchSourceLabel("desk", false) !== "desk heuristic") throw new Error(researchSourceLabel("desk", false));
    if (researchSourceLabel("grok", true) !== "Grok") throw new Error("grok label");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
