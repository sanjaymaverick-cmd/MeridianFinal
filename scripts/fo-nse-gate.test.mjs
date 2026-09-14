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

