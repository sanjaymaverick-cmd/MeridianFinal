/**
 * Realised paper P&L day book.
 * The IST calendar date owns the roll — not UTC, and not a process restart.
 * Scan recovery and a PGLite reseat must not zero a same-IST-day loss.
 */

export type DailyBook = { ist: string; dailyPnl: number };

/** Asia/Kolkata calendar YYYY-MM-DD. 18:30Z is 00:00 IST the next calendar day. */
export function istCalendarDay(nowMs: number): string {
  const ist = new Date(nowMs + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type DailyReconcile = {
  nowMs: number;
  /** On-disk book. Null if the file is missing (first boot, or never written). */
  file: DailyBook | null;
  memoryPnl: number;
  /**
   * IST day the in-memory figure was booked.
   * Null on a cold process (empty engine is not a same-day observation).
   */
  memoryIst: string | null;
};

/**
 * IMP-37: roll on the IST date.
 * IMP-35: a candidate of 0 does not wipe a same-day loss (the old recovery / reseat bug).
 */
export function reconcileDailyPnl(args: DailyReconcile): { dailyPnl: number; ist: string; rolled: boolean } {
  const today = istCalendarDay(args.nowMs);
  const fileSame =
    args.file && args.file.ist === today && Number.isFinite(args.file.dailyPnl) ? args.file.dailyPnl : null;
  const memSame =
    args.memoryIst === today && Number.isFinite(args.memoryPnl) ? args.memoryPnl : null;

  if (args.memoryIst == null) {
    if (fileSame != null) return { dailyPnl: fileSame, ist: today, rolled: false };
    if (args.file && args.file.ist !== today) return { dailyPnl: 0, ist: today, rolled: true };
    return { dailyPnl: 0, ist: today, rolled: false };
  }

  if (args.memoryIst !== today) {
    return { dailyPnl: 0, ist: today, rolled: true };
  }

  const vals = [memSame, fileSame].filter((v): v is number => v != null);
  if (!vals.length) return { dailyPnl: 0, ist: today, rolled: false };
  // Old bug: recovery / PGLite reseat wrote daily_loss = 0 on the same IST day.
  const nonzero = vals.find((v) => v !== 0);
  if (nonzero != null && vals.some((v) => v === 0)) {
    return { dailyPnl: nonzero, ist: today, rolled: false };
  }
  return { dailyPnl: memSame ?? fileSame ?? 0, ist: today, rolled: false };
}

/** True when the daily book file is not inside the directory a PGLite reseat renames. */
export function dailyFileOutsidePglite(dailyFile: string, pgliteDir: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const file = norm(dailyFile);
  const dir = norm(pgliteDir);
  if (!file || !dir) return false;
  return file !== dir && !file.startsWith(`${dir}/`);
}
