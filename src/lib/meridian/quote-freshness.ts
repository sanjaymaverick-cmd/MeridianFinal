/** Binance public prints — the only undelayed "last" quotes overnight / weekend. */
export function isCryptoLastSource(source: string) {
  return source.startsWith("Binance");
}

/**
 * Off cash-session: mark every non-Binance quote delayed so NSE tiles read stale.
 * Binance USDT / perps / options stay undelayed (crypto last). Crypto ATM model keeps its flag.
 */
export function applyOffSessionDelayed<T extends { source: string; delayed?: boolean }>(
  quotes: Record<string, T>,
  openSession: boolean,
) {
  if (openSession) return;
  for (const q of Object.values(quotes)) {
    if (isCryptoLastSource(q.source)) {
      q.delayed = false;
      continue;
    }
    if (q.source.startsWith("crypto ATM")) continue;
    q.delayed = true;
  }
}
