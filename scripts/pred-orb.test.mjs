import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pred = pathToFileURL(join(root, "src/lib/meridian/pred-orb.ts")).href;

test("fixture YES+NO ~1; paper YES is :paper pred; retrain skips pred; Auto skips BTC5M_YES", () => {
  const src = `
    import {
      pricesSumOk, wouldBuy, predOpenReason, predFillPx, isPredSample, PRED_YES, PRED_SLEEVE, parseGammaEvent, tokenIdsForYesNo, quoteHealth,
    } from ${JSON.stringify(pred)};

    if (!pricesSumOk(0.56, 0.45)) throw new Error("sum ~1");
    if (pricesSumOk(0.9, 0.9)) throw new Error("2.0 is not a book");
    if (wouldBuy(0.62, 0.39) !== "YES") throw new Error("would YES");
    if (wouldBuy(0.51, 0.49) !== "FLAT") throw new Error("would FLAT");
    const reason = predOpenReason("yes");
    if (reason !== "pred:btc5m:yes:paper") throw new Error(reason);
    if (!reason.endsWith(":paper")) throw new Error("need :paper");
    const px = predFillPx(0.50, "buy", 75);
    if (!(px > 0.50 && px < 0.52)) throw new Error("fill band " + px);
    if (!isPredSample({ sleeve: "pred", symbol: "BTC" })) throw new Error("sleeve pred");
    if (!isPredSample({ symbol: "BTC5M_YES" })) throw new Error("symbol pred");
    if (isPredSample({ sleeve: "farm", symbol: "BTC" })) throw new Error("farm leaked");
    const ev = parseGammaEvent({
      slug: "btc-updown-5m-1",
      title: "Bitcoin Up or Down - test",
      markets: [{
        question: "Bitcoin Up or Down - test",
        outcomes: '["Up","Down"]',
        outcomePrices: '["0.58","0.42"]',
        volumeNum: 12000,
        endDate: "2026-09-13T12:05:00Z",
      }],
    }, Date.parse("2026-09-13T12:02:00Z"));
    if (!ev || !ev.ok) throw new Error("parse");
    if (Math.abs((ev.yes ?? 0) + (ev.no ?? 0) - 1) > 0.05) throw new Error("yes+no");
    if (ev.would !== "YES") throw new Error("would " + ev.would);
    if (!isPredSample({ sleeve: PRED_SLEEVE, symbol: PRED_YES })) throw new Error("skip");
    const toks = tokenIdsForYesNo(["Down", "Up"], ["tok-down", "tok-up"]);
    if (toks.yes !== "tok-up" || toks.no !== "tok-down") throw new Error("token map " + JSON.stringify(toks));
    if (quoteHealth(0.50, 0.50) !== "ok") throw new Error("health ok");
    if (quoteHealth(0.45, 0.45) !== "bundle_gap") throw new Error("health gap");
    if (quoteHealth(null, null) !== "unavailable") throw new Error("health empty");
    if (quoteHealth(0.50, 0.50, 16_000) !== "delayed") throw new Error("health delayed");
    if (ev.quoteHealth !== "ok") throw new Error("parse health " + ev.quoteHealth);
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const watch = readFileSync(join(root, "src/lib/meridian/paper-watch.ts"), "utf8");
  assert.match(watch, /BTC5M_YES/);
  assert.match(watch, /universe_filter/);
});

test("paper YES fill tags sleeve pred; guest cannot open; retrain ignores pred rows", () => {
  const engine = readFileSync(join(root, "src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /pred:btc5m:\$\{side\}:paper|predOpenReason/);
  assert.match(engine, /sleeve: PRED_SLEEVE/);
  assert.match(engine, /quote_unavailable/);
  assert.match(engine, /pred_paused/);
  assert.match(engine, /settlePredWindows/);
  assert.match(engine, /PRED_FILL_BP/);
  assert.match(engine, /pred_no_reverse/);
  assert.match(engine, /fetchBtc5mQuoteAt/);
  assert.match(engine, /flatten_operator:pred:paper/);
  assert.doesNotMatch(engine.slice(engine.indexOf("await openSleeve(\"farm\""), engine.indexOf("if (execute &&")), /BTC5M_YES/);
  assert.match(engine, /if \(r\.sleeve === PRED_SLEEVE \|\| isPredSymbol/);

  const desk = readFileSync(join(root, "src/lib/server/desk.ts"), "utf8");
  const op = desk.slice(desk.indexOf("export const runPaperOp"), desk.indexOf("export const listResearchHistory"));
  assert.match(op, /authMiddleware/);
  assert.match(op, /pred/);

  const retrainSrc = readFileSync(join(root, "src/lib/server/retrain.ts"), "utf8");
  assert.match(retrainSrc, /isPredSample/);
  assert.match(retrainSrc, /if \(isPredSample\(row\)\) continue/);

  const orb = readFileSync(join(root, "src/components/paper-orb.tsx"), "utf8");
  assert.match(orb, /PRED_COPY/);
  assert.match(orb, /guest/);
  assert.match(orb, /quote unavailable/);
  assert.match(orb, /paper · polymarket/);
  assert.match(orb, /predOpen/);
  assert.match(orb, /if \(compact\)/);
  assert.doesNotMatch(orb, /Oracle|insider/);
  assert.doesNotMatch(orb, /\blive\b/i);
  assert.match(orb, /quoteHealth/);
  const cmd = readFileSync(join(root, "src/routes/index.tsx"), "utf8");
  assert.match(cmd, /PaperOrb compact/);
  assert.doesNotMatch(cmd, /<PaperOrb \/>/);
  const copy = readFileSync(join(root, "src/lib/meridian/pred-orb.ts"), "utf8");
  assert.match(copy, /Not a Polymarket order/);
  assert.match(copy, /farm fit set/);
  const poly = readFileSync(join(root, "src/lib/server/polymarket.ts"), "utf8");
  assert.match(poly, /tokenIdsForYesNo/);
  assert.match(poly, /fetchBtc5mQuoteAt/);

  const chips = readFileSync(join(root, "src/lib/meridian/operator-copy.ts"), "utf8");
  assert.doesNotMatch(chips, /id: "pred"/);
  assert.doesNotMatch(chips, /Polymarket mode/);
});
