/** IMP-18 — Farm / PnL sleeve position caps (Part 0 Lane 3). */
export const FARM_MAX_POS = 16;
export const PNL_MAX_POS = 4;
export const LIVE_MAX_POS = 2;

/**
 * Why a new clip on this sleeve must stay flat.
 * PnL (kelly) stays flat until promote; both sleeves respect max open clips.
 */
export function sleeveOpenSkip(args: {
  kelly: boolean;
  maxPos: number;
  nOpen: number;
  promoted?: boolean;
  live?: boolean;
  liveMaxPos?: number;
}): string | null {
  if (args.kelly && !args.promoted) return "not_promoted";
  const cap = args.live ? (args.liveMaxPos ?? LIVE_MAX_POS) : args.maxPos;
  if (args.nOpen >= cap) return "max_positions";
  return null;
}
