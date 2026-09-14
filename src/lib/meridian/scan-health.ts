/**
 * IMP-17 scan health: hung scan / NaN / blank tape / stuck clock.
 * Recover clears the tick lock and keeps open clips. Never silent-flatten.
 */

export const SCAN_HUNG_MS = 15_000;
export const CLOCK_STUCK_MS = 15_000;

export type ScanHealthStatus = "ok" | "hung_scan" | "nan" | "blank_tape" | "stuck_clock";

export type ScanHealth = {
  status: ScanHealthStatus;
  flags: ScanHealthStatus[];
  hungScan: boolean;
  nan: boolean;
  blankTape: boolean;
  stuckClock: boolean;
  recover: boolean;
  flatten: false;
  label: string;
};

export type ScanHealthInput = {
  now: number;
  lastTick: number;
  ticksRun: number;
  tickLockSince: number | null;
  scan: Array<{ px?: number; metaProb?: number }>;
  liveCount: number;
  dailyPnl?: number;
  tapeRows?: number;
};

export function finitePx(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function hasNanBits(input: {
  scan?: Array<{ px?: number; metaProb?: number }>;
  dailyPnl?: number;
  ticks?: Record<string, number>;
}): boolean {
  if (input.dailyPnl != null && !Number.isFinite(input.dailyPnl)) return true;
  for (const row of input.scan ?? []) {
    if (row.px != null && !Number.isFinite(row.px)) return true;
    if (row.metaProb != null && !Number.isFinite(row.metaProb)) return true;
  }
  for (const v of Object.values(input.ticks ?? {})) {
    if (typeof v === "number" && !Number.isFinite(v)) return true;
  }
  return false;
}

export function recoverHungLock(args: {
  lockHeld: boolean;
  lockSince: number | null;
  now: number;
  openCount: number;
}): { recover: boolean; flatten: false; keepOpen: number } {
  const heldMs = args.lockHeld && args.lockSince ? args.now - args.lockSince : 0;
  const recover = args.lockHeld && heldMs >= SCAN_HUNG_MS;
  return { recover, flatten: false, keepOpen: args.openCount };
}

const LABELS: Record<ScanHealthStatus, string> = {
  ok: "SCAN OK",
  hung_scan: "HUNG SCAN — recovered; clips held (not flattened)",
  nan: "NaN on tape — last good clips held (not flattened)",
  blank_tape: "BLANK TAPE — no live quotes; clips held",
  stuck_clock: "STUCK CLOCK — last scan stale",
};

export function assessScanHealth(input: ScanHealthInput): ScanHealth {
  const hungScan =
    input.tickLockSince != null && input.now - input.tickLockSince >= SCAN_HUNG_MS;
  const nan = hasNanBits({ scan: input.scan, dailyPnl: input.dailyPnl });
  const stuckClock =
    input.ticksRun > 0 && (input.lastTick <= 0 || input.now - input.lastTick >= CLOCK_STUCK_MS);
  const tapeEmpty = (input.tapeRows ?? input.liveCount) <= 0;
  const blankTape = input.ticksRun > 0 && input.scan.length === 0 && input.liveCount <= 0 && tapeEmpty;
  const flags: ScanHealthStatus[] = [];
  if (hungScan) flags.push("hung_scan");
  if (nan) flags.push("nan");
  if (stuckClock) flags.push("stuck_clock");
  if (blankTape) flags.push("blank_tape");
  const status: ScanHealthStatus = flags[0] ?? "ok";
  return {
    status,
    flags,
    hungScan,
    nan,
    blankTape,
    stuckClock,
    recover: hungScan,
    flatten: false,
    label: LABELS[status],
  };
}
