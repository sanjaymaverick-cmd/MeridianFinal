import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const fo = pathToFileURL(join(root, "../src/lib/meridian/fo-contracts.ts")).href;

test("isNseFo gates NSE names and leaves Binance 24/7", () => {
  const src = `
    import { isNseFo, isCryptoFo } from ${JSON.stringify(fo)};
    const cases = [
      ["BANKNIFTY 25AUG26 57800 PE", true, false],
      ["NIFTYFUT", true, false],
      ["BANKNIFTYFUT", true, false],
      ["TCSFUT", true, false],
      ["GOLDFUT", true, false],
      ["NIFTY 25AUG26 24250 CE", true, false],
      ["RELIANCE 25AUG26 1320 PE", true, false],
      ["BTCPERP", false, true],
      ["BTC 25AUG26 77000 PE", false, true],
      ["ETHPERP", false, true],
      ["BTCPE", false, false],
    ];
    for (const [sym, nse, crypto] of cases) {
      if (isNseFo(sym) !== nse) throw new Error(sym + " isNseFo want " + nse + " got " + isNseFo(sym));
      if (isCryptoFo(sym) !== crypto) throw new Error(sym + " isCryptoFo want " + crypto + " got " + isCryptoFo(sym));
    }
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("IMP-14 NSE session gate: no new cash/F&O entries outside cash session", () => {
  const src = `
    import { openSkipReason, isNseHoursOnly, isCryptoHoursName } from ${JSON.stringify(fo)};

    const empty = [];
    function skip(symbol, feed, openSession) {
      return openSkipReason({ symbol, sleeve: "farm", feed, delayed: false, openSession, positions: empty });
    }

    // Cost class must still treat cash as cash, not nse_fo.
    if (isNseHoursOnly("HDFCBANK", "yahoo")) throw new Error("HDFCBANK must not be nse_fo cost class");
    if (isNseHoursOnly("TCS")) throw new Error("TCS must not be nse_fo cost class");
    if (isNseHoursOnly("TATAMOTORS")) throw new Error("TATAMOTORS must not be nse_fo cost class");
    if (!isNseHoursOnly("NIFTYFUT")) throw new Error("NIFTYFUT is nse hours");
    if (!isNseHoursOnly("NIFTY 25AUG26 24250 CE", "nse-opt-model")) throw new Error("index opt is nse hours");
    if (isNseHoursOnly("BTC", "binance")) throw new Error("BTC binance is 24/7");
    if (isCryptoHoursName("RELIANCE", "yahoo")) throw new Error("RELIANCE is not crypto hours");
    if (!isCryptoHoursName("DOGE", "binance")) throw new Error("DOGE binance is crypto hours");

    const cashClosed = [
      ["RELIANCE", "yahoo"],
      ["HDFCBANK", "yahoo"],
      ["TCS", "yahoo"],
      ["TATAMOTORS", ""],
      ["POLYCAB", "yahoo"],
      ["NIFTYFUT", "nse-opt-model"],
      ["BANKNIFTYFUT", "nse-opt-model"],
      ["GOLDFUT", "nse-opt-model"],
      ["NIFTY 25AUG26 24250 CE", "nse-opt-model"],
      ["BANKNIFTY 25AUG26 57800 PE", "nse-opt-model"],
      ["RELIANCE 25AUG26 1320 PE", "nse-opt-model"],
    ];
    for (const [sym, feed] of cashClosed) {
      const night = skip(sym, feed, false);
      if (night !== "nse_session_closed") throw new Error("closed " + sym + " want nse_session_closed got " + night);
      const day = skip(sym, feed, true);
      if (day === "nse_session_closed") throw new Error("open session still blocked " + sym);
    }

    const cryptoNight = [
      ["BTC", "binance"],
      ["ETH", "binance"],
      ["SOL", "binance"],
      ["DOGE", "binance"],
      ["XRP", "binance"],
      ["BNB", "binance"],
    ];
    for (const [sym, feed] of cryptoNight) {
      const night = skip(sym, feed, false);
      if (night === "nse_session_closed") throw new Error("crypto blocked overnight: " + sym);
    }
    if (skip("BTCPERP", "binance", false) === "nse_session_closed") throw new Error("perp session");
    if (skip("BTC 25AUG26 77000 PE", "binance-opt", false) === "nse_session_closed") throw new Error("crypto opt session");

    // Same IST cash window as sessionClock (09:15–15:30 weekdays).
    function cashOpen(ms) {
      const ist = new Date(ms + 5.5 * 3600 * 1000);
      const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30 && ist.getUTCDay() >= 1 && ist.getUTCDay() <= 5;
    }
    function paperBlocked(symbol, feed, now) {
      if (cashOpen(now)) return null;
      if (isCryptoHoursName(symbol, feed)) return null;
      return "nse_session_closed";
    }
    const cashOpenTs = Date.UTC(2026, 8, 14, 5, 30, 0);
    const afterHoursTs = Date.UTC(2026, 8, 14, 12, 30, 0);
    const weekendTs = Date.UTC(2026, 8, 13, 6, 30, 0);
    if (!cashOpen(cashOpenTs)) throw new Error("expected cash open Mon 11:00 IST");
    if (cashOpen(afterHoursTs)) throw new Error("expected closed Mon 18:00 IST");
    if (cashOpen(weekendTs)) throw new Error("expected closed Sunday");
    if (paperBlocked("RELIANCE", "yahoo", cashOpenTs)) throw new Error("cash open should allow RELIANCE");
    if (paperBlocked("NIFTYFUT", "nse-opt-model", cashOpenTs)) throw new Error("cash open should allow NIFTYFUT");
    if (paperBlocked("RELIANCE", "yahoo", afterHoursTs) !== "nse_session_closed") throw new Error("after hours RELIANCE");
    if (paperBlocked("TATAMOTORS", undefined, weekendTs) !== "nse_session_closed") throw new Error("weekend TATAMOTORS");
    if (paperBlocked("NIFTY 25AUG26 24250 CE", "nse-opt-model", weekendTs) !== "nse_session_closed") throw new Error("weekend NSE opt");
    if (paperBlocked("BTC", "binance", weekendTs)) throw new Error("weekend BTC should paper");
    if (paperBlocked("DOGE", "binance", afterHoursTs)) throw new Error("after hours DOGE should paper");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const skipSrc = readFileSync(join(root, "../src/lib/meridian/fo-contracts.ts"), "utf8");
  assert.match(skipSrc, /!isCryptoHoursName\(args\.symbol, feed\)/);
  assert.match(skipSrc, /nse_session_closed/);
  const clock = readFileSync(join(root, "../src/lib/meridian/decision.ts"), "utf8");
  assert.match(clock, /minutes >= open && minutes <= close && ist\.getUTCDay\(\) >= 1 && ist\.getUTCDay\(\) <= 5/);
  const lock = readFileSync(join(root, "../src/lib/meridian/session-lock.ts"), "utf8");
  assert.match(lock, /isCryptoHoursName/);
  assert.match(lock, /nse_session_closed/);
  assert.match(lock, /function paperBlockedReason/);
  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /function openNow\(/);
  assert.match(engine, /openSkipReason\(/);
  const deskOps = readFileSync(join(root, "../src/lib/desk-ops.ts"), "utf8");
  assert.match(deskOps, /paperBlockedReason\(opts\.symbol, opts\.feed\)/);
});

test("IMP-15 weekend/night: crypto last only; stale NSE tiles are correct", () => {
  const fresh = pathToFileURL(join(root, "../src/lib/meridian/quote-freshness.ts")).href;
  const src = `
    import { applyOffSessionDelayed, isCryptoLastSource } from ${JSON.stringify(fresh)};

    if (!isCryptoLastSource("Binance")) throw new Error("Binance is crypto last");
    if (!isCryptoLastSource("Binance USDT-M perp")) throw new Error("perp last");
    if (!isCryptoLastSource("Binance option BTC-240927-70000-C")) throw new Error("opt last");
    if (isCryptoLastSource("Yahoo NSE")) throw new Error("Yahoo NSE is not crypto last");
    if (isCryptoLastSource("delayed last (NIFTY) + 7bp carry - NSE closed")) throw new Error("delayed NSE fut not crypto last");
    if (isCryptoLastSource("snapshot")) throw new Error("snapshot not crypto last");

    const quotes = {
      BTC: { source: "Binance", delayed: undefined },
      ETH: { source: "Binance", delayed: true },
      BTCPERP: { source: "Binance USDT-M perp", delayed: false },
      NIFTY: { source: "Yahoo NSE", delayed: undefined },
      BANKNIFTY: { source: "Yahoo NSE", delayed: false },
      RELIANCE: { source: "Yahoo NSE", delayed: undefined },
      NIFTYFUT: { source: "delayed last (NIFTY) + 7bp carry - NSE closed", delayed: true },
      "NIFTY 25AUG26 24250 CE": { source: "delayed ATM model NIFTY … - not an exchange print", delayed: true },
      "BTC ATM": { source: "crypto ATM model BTC … - not an exchange print", delayed: false },
    };

    applyOffSessionDelayed(quotes, true);
    if (quotes.NIFTY.delayed) throw new Error("cash session must not force NIFTY delayed");
    if (quotes.BTC.delayed) throw new Error("cash session must not touch BTC delayed flag");

    applyOffSessionDelayed(quotes, false);
    if (quotes.BTC.delayed !== false) throw new Error("weekend BTC must stay undelayed last");
    if (quotes.ETH.delayed !== false) throw new Error("weekend ETH must clear delayed → last");
    if (quotes.BTCPERP.delayed !== false) throw new Error("weekend perp last");
    if (quotes.NIFTY.delayed !== true) throw new Error("weekend NIFTY tile must be stale/delayed");
    if (quotes.BANKNIFTY.delayed !== true) throw new Error("weekend BANKNIFTY stale");
    if (quotes.RELIANCE.delayed !== true) throw new Error("weekend RELIANCE stale");
    if (quotes.NIFTYFUT.delayed !== true) throw new Error("weekend NIFTYFUT delayed");
    if (quotes["NIFTY 25AUG26 24250 CE"].delayed !== true) throw new Error("weekend NSE opt delayed");
    if (quotes["BTC ATM"].delayed !== false) throw new Error("crypto ATM model keeps own flag");

    function cashOpen(ms) {
      const ist = new Date(ms + 5.5 * 3600 * 1000);
      const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30 && ist.getUTCDay() >= 1 && ist.getUTCDay() <= 5;
    }
    const weekendTs = Date.UTC(2026, 8, 13, 12, 0, 0);
    if (cashOpen(weekendTs)) throw new Error("Sunday must be NSE closed");
    const cashOpenTs = Date.UTC(2026, 8, 14, 5, 30, 0);
    if (!cashOpen(cashOpenTs)) throw new Error("Mon 11:00 IST must be open");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const quotesSrc = readFileSync(join(root, "../src/lib/server/quotes.ts"), "utf8");
  assert.match(quotesSrc, /applyOffSessionDelayed\(quotes,\s*sessionClock\(\)\.openSession\)/);
  assert.match(quotesSrc, /quote-freshness/);
  const lockSrc = readFileSync(join(root, "../src/lib/meridian/session-lock.ts"), "utf8");
  assert.match(lockSrc, /quote-freshness/);
  const freshSrc = readFileSync(join(root, "../src/lib/meridian/quote-freshness.ts"), "utf8");
  assert.match(freshSrc, /isCryptoLastSource/);
  assert.match(freshSrc, /applyOffSessionDelayed/);
  const index = readFileSync(join(root, "../src/routes/index.tsx"), "utf8");
  assert.match(index, /STALE/);
  assert.match(index, /data-tile-stale/);
  assert.match(index, /stale=\{closed\}/);
  const shell = readFileSync(join(root, "../src/components/desk-shell.tsx"), "utf8");
  assert.match(shell, /NSE CASH CLOSED · CRYPTO ONLY/);
  assert.match(shell, /cryptoTape/);
  assert.match(shell, /NIFTY.*STALE/);
  const markets = readFileSync(join(root, "../src/routes/markets.tsx"), "utf8");
  assert.match(markets, /STALE/);
  assert.match(markets, /DELAYED · MODEL/);
});

test("IMP-16 quote path: crypto quote:binance; fills still :paper; QuoteLabel live untouched", () => {
  const pathMod = pathToFileURL(join(root, "../src/lib/meridian/quote-path.ts")).href;
  const src = `
    import { quotePathOf } from ${JSON.stringify(pathMod)};

    if (quotePathOf("binance") !== "quote:binance") throw new Error("spot " + quotePathOf("binance"));
    if (quotePathOf("binance-fut") !== "quote:binance") throw new Error("fut");
    if (quotePathOf("binance-opt") !== "quote:binance") throw new Error("opt");
    if (quotePathOf("binance-spot-mark") !== "quote:binance") throw new Error("spot-mark");
    if (quotePathOf("polymarket") !== "quote:polymarket") throw new Error("pred");
    if (quotePathOf("nse-opt-model") !== "quote:model") throw new Error("model");
    if (quotePathOf("yahoo") !== "quote:yahoo") throw new Error("yahoo");
    if (quotePathOf(undefined) !== "quote:last") throw new Error("empty");
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const engine = readFileSync(join(root, "../src/lib/server/paper-engine.ts"), "utf8");
  assert.match(engine, /quotePathOf/);
  assert.match(engine, /quoteBits/);
  assert.match(engine, /quotePath:/);
  assert.match(engine, /const ENGINE_REV = (?:3[6-9]|[4-9]\d)/);
  assert.match(engine, /\$\{sleeve\}:\$\{pos\.reasonOpen\}:paper/);
  assert.match(engine, /\$\{intent\.reason\}:\$\{pos\.side\}:paper/);
  assert.match(engine, /flatten_operator:\$\{pos\.side\}:paper/);
  assert.doesNotMatch(engine, /:live`/);
  assert.match(engine, /type QuoteLabel = "live" \| "delayed" \| "model"/);
  assert.doesNotMatch(engine, /type QuoteLabel = "[^"]*binance/);

  const store = readFileSync(join(root, "../src/lib/desk-store.ts"), "utf8");
  assert.match(store, /quoteLabel\?: "live" \| "delayed" \| "model"/);
  assert.match(store, /quotePath\?: string/);

  const autoPage = readFileSync(join(root, "../src/routes/auto.tsx"), "utf8");
  assert.match(autoPage, /data-quote-path/);
  assert.match(autoPage, /f\.quotePath/);
  const cmd = readFileSync(join(root, "../src/routes/index.tsx"), "utf8");
  assert.match(cmd, /data-quote-path/);
  assert.match(cmd, /f\.quotePath/);

  const qp = readFileSync(join(root, "../src/lib/meridian/quote-path.ts"), "utf8");
  assert.match(qp, /quote:binance/);
  assert.match(qp, /export function quotePathOf/);
});
