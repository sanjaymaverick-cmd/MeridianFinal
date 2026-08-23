/** Triple-barrier label: +R, −R, or vertical (time) first-touch. */

export type BarrierHit = "upper" | "lower" | "vertical";

export function tripleBarrier(args: {
  side: "long" | "short";
  entry: number;
  high: number;
  low: number;
  stopPct: number;
  tpR: number;
  timedOut: boolean;
  netRet: number;
}): { label: 0 | 1; barrier: BarrierHit } {
  const entry = args.entry;
  const stop = Math.max(args.stopPct, 1e-6);
  const upMove = args.tpR * stop;
  const dir = args.side === "short" ? -1 : 1;
  const upper = dir === 1 ? entry * (1 + upMove) : entry * (1 - upMove);
  const lower = dir === 1 ? entry * (1 - stop) : entry * (1 + stop);
  const hitUpper = dir === 1 ? args.high >= upper : args.low <= upper;
  const hitLower = dir === 1 ? args.low <= lower : args.high >= lower;
  if (hitUpper && !hitLower) return { label: 1, barrier: "upper" };
  if (hitLower && !hitUpper) return { label: 0, barrier: "lower" };
  if (hitUpper && hitLower) return { label: args.netRet > 0 ? 1 : 0, barrier: args.netRet > 0 ? "upper" : "lower" };
  if (args.timedOut) return { label: args.netRet > 0 ? 1 : 0, barrier: "vertical" };
  return { label: args.netRet > 0 ? 1 : 0, barrier: "vertical" };
}
