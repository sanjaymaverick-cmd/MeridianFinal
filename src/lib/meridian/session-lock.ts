import { sessionClock } from "./decision";
import { isCryptoHoursName } from "./fo-contracts";
import { nseCashFoOpen } from "./nse-holidays";

export { isCryptoHoursName, nseCashFoOpen };

export function nseCashOpen(now = Date.now()) {
  return nseCashFoOpen(now);
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
