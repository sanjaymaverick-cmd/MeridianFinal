/** Close-clip fields so jsonl / CSV / blotter share net economics. */

import { economicLabel, netFwdRet, netPnlUsd } from "./costs";
import { barrierFromExit, tripleBarrier, type BarrierHit } from "./triple-barrier";

export function paperReason(parts: Array<string | undefined | null>): string {
  const body = parts.map((p) => String(p ?? "").trim()).filter(Boolean).join(":");
  const tagged = body.replace(/:live\b/g, ":paper");
  if (!tagged) return "paper";
  return tagged.endsWith(":paper") ? tagged : `${tagged}:paper`;
}

/** Desk-wide USDINR fallback (paper-engine qtyFor / predQty / segment caps). */
export const USDINR_FALLBACK = 95.7;

/** IMP-38: INR-quoted PnL → USD. USD / FX-quoted rows pass through unchanged. */
export function pnlUsdOf(pnlNative: number, quoteCcy: string | undefined, usdInr: number): number {
  if (!Number.isFinite(pnlNative)) return 0;
  if (quoteCcy !== "INR") return pnlNative;
  const fx = Number(usdInr) > 0 ? Number(usdInr) : USDINR_FALLBACK;
  return pnlNative / fx;
}

export type CloseClipArgs = {
  side: "long" | "short";
  qty: number;
  entryFill: number;
  exitFill: number;
  entryMid: number;
  exitMid: number;
  costBps: number;
  sleeve?: string;
  reasonOpen: string;
  reasonClose: string;
  highSinceEntry?: number;
  lowSinceEntry?: number;
  stopPct?: number;
  tpR?: number;
  timedOut?: boolean;
  /** IMP-38: quote currency of entry/exit. INR names convert to USD for pnl_usd. */
  quoteCcy?: "INR" | "USD" | "FX" | string;
  /** IMP-38: USDINR used for INR→USD (desk fallback 95.7, same as qtyFor/predQty). */
  usdInr?: number;
};

export type CloseClipFields = {
  /** Native quote-currency PnL (INR for NSE/MCX names, USD for crypto). */
  pnl: number;
  /** USD PnL: pnl / USDINR for INR-quoted names; pnl otherwise. */
  pnl_usd: number;
  pnl_ccy: string;
  usd_inr?: number;
  fwdRet: number;
  fwd_ret: number;
  fwdRetGross: number;
  costBps: number;
  label: 0 | 1;
  y: 0 | 1;
  label_barrier: 0 | 1;
  barrier: BarrierHit;
  reasonClose: string;
  reasonCloseFull: string;
  reasonOpen: string;
  reasonOpenFull: string;
};

export function closeClipFields(args: CloseClipArgs): CloseClipFields {
  const entryMid = args.entryMid > 0 ? args.entryMid : args.entryFill;
  const exitMid = args.exitMid > 0 ? args.exitMid : args.exitFill;
  const fwdRet = netFwdRet(args.entryFill, args.exitFill, args.side);
  const fwdRetGross = args.side === "short" ? entryMid / exitMid - 1 : exitMid / entryMid - 1;
  const pnl = netPnlUsd(args.entryFill, args.exitFill, args.qty, args.side);
  const ccy = args.quoteCcy ?? "USD";
  const fx = Number(args.usdInr) > 0 ? Number(args.usdInr) : USDINR_FALLBACK;
  const pnlUsd = pnlUsdOf(pnl, ccy, fx);
  const y = economicLabel(fwdRet);
  const tb =
    barrierFromExit(args.reasonClose, fwdRetGross) ??
    tripleBarrier({
      side: args.side,
      entry: entryMid,
      high: args.highSinceEntry ?? Math.max(entryMid, exitMid),
      low: args.lowSinceEntry ?? Math.min(entryMid, exitMid),
      stopPct: args.stopPct ?? 0.01,
      tpR: args.tpR ?? 1,
      timedOut: !!args.timedOut,
      netRet: fwdRetGross,
    });
  return {
    pnl,
    pnl_usd: pnlUsd,
    pnl_ccy: ccy === "INR" ? "INR" : "USD",
    ...(ccy === "INR" ? { usd_inr: fx } : {}),
    fwdRet,
    fwd_ret: fwdRet,
    fwdRetGross,
    costBps: args.costBps,
    label: y,
    y,
    label_barrier: tb.label,
    barrier: tb.barrier,
    reasonClose: args.reasonClose,
    reasonCloseFull: paperReason([args.sleeve, args.reasonClose, args.side]),
    reasonOpen: args.reasonOpen,
    reasonOpenFull: paperReason([args.sleeve, args.reasonOpen, args.side]),
  };
}
