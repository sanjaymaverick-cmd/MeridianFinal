import { sessionClock } from "./decision";
import { isCryptoFo, cryptoFamily } from "./fo-contracts";

export function nseCashOpen(now = Date.now()) {
  return sessionClock(new Date(now)).openSession;
}

export function nseCashClosed(now = Date.now()) {
  return !nseCashOpen(now);
}

export function paperBlockedReason(symbol: string, feed?: string, now = Date.now()): string | null {
  if (!nseCashClosed(now)) return null;
  if (isCryptoHoursName(symbol, feed)) return null;
  return "nse_session_closed";
}

export function isCryptoHoursName(symbol: string, feed?: string) {
  if ((feed ?? "").startsWith("binance")) return true;
  if (isCryptoFo(symbol)) return true;
  const u = symbol.toUpperCase();
  if (u === "BTC" || u === "ETH" || u === "SOL") return true;
  if (u.startsWith("BTC") || u.startsWith("ETH") || u.startsWith("SOL")) return true;
  return cryptoFamily(symbol) != null;
}
