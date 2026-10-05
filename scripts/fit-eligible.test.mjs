/** Default fit: crypto spot only. Gross 13 Sep, model quotes, and unconverted option/FUT stay out. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const dailyUrl = pathToFileURL(join(root, "../src/lib/meridian/daily-book.ts")).href;
const foUrl = pathToFileURL(join(root, "../src/lib/meridian/fo-contracts.ts")).href;

test("fit drops 13 Sep gross, model quotes, and unconverted option/FUT; crypto spot stays", () => {
  const body = readFileSync(join(root, "../src/lib/meridian/fit-eligible.ts"), "utf8")
    .replace('from "./daily-book"', `from ${JSON.stringify(dailyUrl)}`)
    .replace('from "./fo-contracts"', `from ${JSON.stringify(foUrl)}`);
  const dir = mkdtempSync(join(tmpdir(), "fit-elig-"));
  const file = join(dir, "fit-eligible.ts");
  writeFileSync(file, body);
  const href = pathToFileURL(file).href;
  const src = `
    import { fitSkipReason, storedInrConverts, isOptionOrFutSymbol } from ${JSON.stringify(href)};
    const gross = {
      symbol: "BNB",
      closed_ist: "2026-09-13 12:20:14 IST",
      tsClose: 1789282214757,
      label: 1,
      fwdRet: -0.001,
      fwdRetGross: 0.00014,
      quoteLabel: "live",
    };
    if (fitSkipReason(gross) !== "sep13_gross_label") throw new Error("13 Sep gross stayed in");
    const netOnThatDay = { ...gross, label: 0, fwdRetGross: 0.00014, fwdRet: -0.001 };
    if (fitSkipReason(netOnThatDay)) throw new Error("a net label on 13 Sep must stay");

    const model = { symbol: "NIFTY 06OCT26 24500 CE", quoteLabel: "model", closed_ist: "2026-09-15 15:20:00 IST", label: 0, fwdRet: -0.02, fwdRetGross: -0.01 };
    if (fitSkipReason(model) !== "model_quote") throw new Error("model quote stayed " + fitSkipReason(model));
    if (fitSkipReason(model, { includeModelQuotes: true }) !== "option_or_fut") throw new Error("include model still holds the option out");

    const opt = { symbol: "HDFCBANK 06OCT26 720 CE", quoteLabel: "live", closed_ist: "2026-09-15 11:00:00 IST", pnl: 1000, pnl_usd: 1000, label: 1, fwdRet: 0.01, fwdRetGross: 0.02 };
    if (fitSkipReason(opt) !== "option_or_fut") throw new Error("option stayed");
    if (storedInrConverts(opt)) throw new Error("equal pnl_usd invented a conversion");
    if (fitSkipReason(opt, { includeInrWithFx: true }) !== "inr_pnl_no_fx") throw new Error("missing FX was invented");
    const converted = { ...opt, pnl_usd: 1000 / 95.7, usd_inr: 95.7 };
    if (!storedInrConverts(converted)) throw new Error("stored FX should count");
    if (fitSkipReason(converted) !== "option_or_fut") throw new Error("default fit must still hold the option out");
    if (fitSkipReason(converted, { includeInrWithFx: true })) throw new Error("explicit FX include dropped a converted row");
    const invented = { ...opt, pnl_usd: 1000 / 95.7 };
    if (storedInrConverts(invented)) throw new Error("conversion without a stored USDINR");

    if (fitSkipReason({ symbol: "NIFTYFUT", quoteLabel: "live", closed_ist: "2026-09-20 10:00:00 IST" }) !== "option_or_fut") {
      throw new Error("fut stayed");
    }
    if (isOptionOrFutSymbol("BTC") || isOptionOrFutSymbol("PEPE") || isOptionOrFutSymbol("APE")) throw new Error("spot classed as FO");
    const spot = { symbol: "BTC", quoteLabel: "live", closed_ist: "2026-10-05 16:00:00 IST", label: 0, fwdRet: -0.01, fwdRetGross: -0.008, pnl: -12, pnl_usd: -12 };
    if (fitSkipReason(spot)) throw new Error("crypto spot dropped " + fitSkipReason(spot));
    if (JSON.stringify(spot).includes(":live")) throw new Error("test fixture must not use a live fill reason");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const retrain = readFileSync(join(root, "../src/lib/server/retrain.ts"), "utf8");
  assert.match(retrain, /fitSkipReason\(row, opts\)/);
  assert.match(retrain, /fitSkipReason\(row, \{\}\)/);
  assert.match(retrain, /isExcludedSample\(row, excludeIds\)/);
  assert.match(retrain, /artefactFromFit/);
  assert.doesNotMatch(retrain, /promoted:\s*true/);
  assert.doesNotMatch(retrain, /PROMOTE_MIN_(N|AUC|HIT)\s*=/);
  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /fitSkipReason\(r, \{\}\)/);
  assert.match(engine, /type QuoteLabel = "live" \| "delayed" \| "model"/);
});
