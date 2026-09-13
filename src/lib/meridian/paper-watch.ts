import { openSkipReason, type OpenSkipPos } from "./fo-contracts";

/** Auto-send default. Tail scans; opens only if farmTail is on. */
export const FARM_CORE = ["BTC", "ETH", "SOL", "BNB"] as const;

export const FARM_TAIL = [
  "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT", "LTC", "BCH", "NEAR", "SUI", "AAVE", "UNI",
  "ATOM", "FIL", "APT", "ARB", "OP", "INJ", "TIA", "SEI", "PEPE", "WIF", "BONK", "RENDER", "FET", "TAO", "PAXG",
] as const;

export const FARM_CRYPTO = [...FARM_CORE, ...FARM_TAIL] as const;

/** NSE cash only. Scan / propose. Never Auto-send. */
export const CASH_WATCH = ["HDFCBANK", "ICICIBANK", "RELIANCE", "TCS", "INFY", "LT", "POLYCAB"] as const;

/** COMEX→MCX estimates. Scan only. Never Auto-send. */
export const COMMODITY_WATCH = ["GOLD", "SILVER", "CRUDE", "COPPER", "NATGAS"] as const;

export function farmBucket(sym: string): "core" | "tail" | "other" {
  const u = sym.toUpperCase();
  if ((FARM_CORE as readonly string[]).includes(u)) return "core";
  if ((FARM_TAIL as readonly string[]).includes(u)) return "tail";
  return "other";
}

export function autoCanSend(mode: string, killed: boolean) {
  return (mode === "auto" || mode === "paper") && !killed;
}

/** Structural skip plus core/tail. Keep no_leverage on PERP/FUT/options. */
export function autoOpenSkip(args: {
  symbol: string;
  sleeve?: "farm" | "pnl";
  feed?: string;
  delayed?: boolean;
  openSession: boolean;
  positions: OpenSkipPos[];
  farmTail?: boolean;
}): string | null {
  const skip = openSkipReason(args);
  if (skip) return skip;
  if (args.sleeve === "pnl") return null;
  const bucket = farmBucket(args.symbol);
  if (bucket === "other") return "universe_filter";
  if (bucket === "tail" && !args.farmTail) return "tail_off";
  return null;
}
