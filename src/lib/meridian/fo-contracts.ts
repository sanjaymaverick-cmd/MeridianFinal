/** Paper F&O labels: expiry + strike. NSE uses last/delayed last; crypto uses Binance when live. */

export type FoRight = "CE" | "PE" | "FUT";

export type FoContract = {
  symbol: string;
  underlier: string;
  expiry: string;
  expiryLabel: string;
  strike: number | null;
  right: FoRight;
  label: string;
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

export function istParts(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(g("year")),
    month: Number(g("month")),
    day: Number(g("day")),
    hour: Number(g("hour")),
    minute: Number(g("minute")),
    weekday: g("weekday"),
  };
}

function ymdUTC(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(dt: Date, n: number) {
  return new Date(dt.getTime() + n * 86400000);
}

export function expiryLabel(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mmm = MONTHS[d.getUTCMonth()]!;
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}${mmm}${yy}`;
}

export function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Next Tuesday on/after IST today (weekly index options). */
export function nextNseWeeklyExpiry(now = Date.now()): Date {
  const p = istParts(now);
  const today = ymdUTC(p.year, p.month, p.day);
  const dow = today.getUTCDay();
  let ahead = (2 - dow + 7) % 7;
  if (ahead === 0 && (p.hour > 15 || (p.hour === 15 && p.minute >= 30))) ahead = 7;
  return addDays(today, ahead);
}

/** Last Thursday of the IST month (index futures). */
export function nextNseMonthlyExpiry(now = Date.now()): Date {
  const p = istParts(now);
  const lastThis = lastThursday(p.year, p.month);
  const today = ymdUTC(p.year, p.month, p.day);
  const expired = lastThis.getTime() < today.getTime() || (lastThis.getTime() === today.getTime() && (p.hour > 15 || (p.hour === 15 && p.minute >= 30)));
  if (!expired) return lastThis;
  const year = p.month === 12 ? p.year + 1 : p.year;
  const month = p.month === 12 ? 1 : p.month + 1;
  return lastThursday(year, month);
}

function lastThursday(year: number, month: number) {
  const last = ymdUTC(year, month + 1, 0);
  const back = (last.getUTCDay() - 4 + 7) % 7;
  return addDays(last, -back);
}

export function nextFridayExpiry(now = Date.now()): Date {
  const p = istParts(now);
  const today = ymdUTC(p.year, p.month, p.day);
  const dow = today.getUTCDay();
  let ahead = (5 - dow + 7) % 7;
  if (ahead === 0 && p.hour >= 20) ahead = 7;
  return addDays(today, ahead);
}

export function strikeStep(underlier: string): number {
  const u = underlier.toUpperCase();
  if (u === "BANKNIFTY" || u === "SENSEX") return 100;
  if (u === "NIFTY" || u === "FINNIFTY") return 50;
  if (u === "BTC") return 250;
  if (u === "ETH") return 25;
  return 20;
}

export function atmStrike(spot: number, underlier: string): number {
  const step = strikeStep(underlier);
  return Math.round(spot / step) * step;
}

export function formatFoOption(underlier: string, expiry: Date, strike: number, right: "CE" | "PE"): FoContract {
  const lab = expiryLabel(expiry);
  const u = underlier.toUpperCase();
  const symbol = `${u} ${lab} ${strike} ${right}`;
  return {
    symbol,
    underlier: u,
    expiry: isoDate(expiry),
    expiryLabel: lab,
    strike,
    right,
    label: symbol,
  };
}

export function formatFoFuture(underlier: string, expiry: Date, symbol = `${underlier.toUpperCase()}FUT`): FoContract {
  const lab = expiryLabel(expiry);
  const u = underlier.toUpperCase();
  return {
    symbol,
    underlier: u,
    expiry: isoDate(expiry),
    expiryLabel: lab,
    strike: null,
    right: "FUT",
    label: `${u} ${lab} FUT`,
  };
}

function parseExpiryLabel(lab: string): Date | null {
  const dd = Number(lab.slice(0, 2));
  const mmm = lab.slice(2, 5) as (typeof MONTHS)[number];
  const yy = Number(lab.slice(5, 7));
  const mo = MONTHS.indexOf(mmm);
  if (mo < 0 || !dd || !yy) return null;
  return ymdUTC(2000 + yy, mo + 1, dd);
}

export function parseFo(symbol: string): FoContract | null {
  const raw = symbol.trim().toUpperCase();
  const bn = raw.match(/^(BTC|ETH)-(\d{6})-(\d+(?:\.\d+)?)-([CP])$/);
  if (bn) {
    const y = 2000 + Number(bn[2]!.slice(0, 2));
    const mo = Number(bn[2]!.slice(2, 4));
    const d = Number(bn[2]!.slice(4, 6));
    const right: "CE" | "PE" = bn[4] === "C" ? "CE" : "PE";
    return formatFoOption(bn[1]!, ymdUTC(y, mo, d), Number(bn[3]), right);
  }
  const m = raw.match(/^([A-Z0-9]+)\s+(\d{2}[A-Z]{3}\d{2})(?:\s+(\d+(?:\.\d+)?))?\s+(CE|PE|FUT|C|P)$/);
  if (m) {
    const rightRaw = m[4]!;
    const right: FoRight = rightRaw === "C" ? "CE" : rightRaw === "P" ? "PE" : (rightRaw as FoRight);
    const lab = m[2]!;
    const expiry = parseExpiryLabel(lab);
    const strike = m[3] ? Number(m[3]) : null;
    const underlier = m[1]!;
    const symbolOut = right === "FUT" ? `${underlier} ${lab} FUT` : `${underlier} ${lab} ${strike} ${right}`;
    return {
      symbol: symbolOut,
      underlier,
      expiry: expiry ? isoDate(expiry) : "",
      expiryLabel: lab,
      strike,
      right,
      label: symbolOut,
    };
  }
  return null;
}

export function daysToExpiry(expiryIso: string, now = Date.now()): number {
  const exp = new Date(`${expiryIso}T15:30:00+05:30`);
  return Math.max(0.02, (exp.getTime() - now) / 86400000);
}

export function atmPremium(spot: number, sigma: number, days: number) {
  return Math.max(0.01, 0.4 * spot * sigma * Math.sqrt(Math.max(days, 0.02) / 365));
}

export function isFoSymbol(sym: string): boolean {
  if (parseFo(sym)) return true;
  const u = sym.toUpperCase();
  return (
    u.endsWith("FUT") ||
    u.endsWith("PERP") ||
    u.endsWith("CE") ||
    u.endsWith("PE") ||
    u === "BTCCM"
  );
}

export function isCryptoFo(sym: string): boolean {
  const u = sym.toUpperCase();
  if (u.endsWith("PERP")) return true;
  const fo = parseFo(sym);
  return fo?.underlier === "BTC" || fo?.underlier === "ETH" || fo?.underlier === "SOL";
}

export const NSE_OPT_UNDERLIERS = ["NIFTY", "BANKNIFTY"] as const;
export const NSE_FUT_CORE = ["NIFTYFUT", "BANKNIFTYFUT"] as const;
export const CRYPTO_PERPS = ["BTCPERP", "ETHPERP", "SOLPERP", "BTCUSDPERP", "ETHUSDPERP"] as const;
export const OPTION_STUBS = new Set([
  "NIFTYCE",
  "NIFTYPE",
  "BANKNIFTYCE",
  "BANKNIFTYPE",
  "RELIANCECE",
  "RELIANCEPE",
  "HDFCBANKCE",
  "HDFCBANKPE",
  "BTCCM",
  "BTCPE",
]);