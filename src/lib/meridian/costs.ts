/** Paper fill costs so the model trains on net edge, not mid. */

export type CostClass = "crypto" | "nse_cash" | "nse_fo" | "other";

export type CostBps = {
  spread: number;
  fee: number;
};

const TABLE: Record<CostClass, CostBps> = {
  crypto: { spread: 0.0004, fee: 0.0004 },
  nse_cash: { spread: 0.0005, fee: 0.0003 },
  nse_fo: { spread: 0.001, fee: 0.0005 },
  other: { spread: 0.0006, fee: 0.0004 },
};

export function costClassOf(args: {
  assetClass?: string;
  nseFo?: boolean;
  crypto?: boolean;
}): CostClass {
  if (args.nseFo || args.assetClass === "futures" || args.assetClass === "options") {
    if (args.crypto) return "crypto";
    return "nse_fo";
  }
  if (args.crypto || args.assetClass === "crypto") return "crypto";
  if (args.assetClass === "equity") return "nse_cash";
  return "other";
}

export function slipOf(cls: CostClass): number {
  const c = TABLE[cls];
  return c.spread / 2 + c.fee;
}

export function roundTripBps(cls: CostClass): number {
  return Math.round(slipOf(cls) * 2 * 1e4);
}

export function fillFromMid(mid: number, side: "buy" | "sell", cls: CostClass): number {
  if (!(mid > 0)) return mid;
  const s = slipOf(cls);
  return side === "buy" ? mid * (1 + s) : mid * (1 - s);
}

export function netFwdRet(entryFill: number, exitFill: number, side: "long" | "short"): number {
  if (!(entryFill > 0) || !(exitFill > 0)) return 0;
  return side === "short" ? entryFill / exitFill - 1 : exitFill / entryFill - 1;
}
