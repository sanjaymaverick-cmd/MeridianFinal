import { sessionClock } from "./decision";
import { isCryptoHoursName } from "./fo-contracts";

export { isCryptoHoursName };

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

export { isCryptoLastSource, applyOffSessionDelayed } from "./quote-freshness";
