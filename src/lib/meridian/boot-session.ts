/**
 * Cold boot of the paper desk.
 * A fresh book stays paused Signals. A saved auto/paper session is restored.
 * There is no live mode here. Boot never Arms.
 */

export type DeskRunMode = "advisory" | "paper" | "auto";

export type DeskSession = {
  mode: DeskRunMode;
  killed: boolean;
};

/** Empty book: paused Signals. Not Arm. */
export function freshBookBoot(): DeskSession {
  return { mode: "advisory", killed: true };
}

/**
 * Restore a session written by this desk.
 * Unknown modes, including anything that would mean Arm, boot paused.
 * `killed` must be a real boolean; a missing flag stays paused.
 */
export function bootFromSavedSession(saved: { mode?: unknown; killed?: unknown } | null | undefined): DeskSession {
  if (!saved) return freshBookBoot();
  const mode: DeskRunMode | null =
    saved.mode === "auto" || saved.mode === "paper" || saved.mode === "advisory" ? saved.mode : null;
  if (!mode || typeof saved.killed !== "boolean") return freshBookBoot();
  return { mode, killed: saved.killed };
}

/**
 * Heartbeat fallback for a process that died before paper-session.json existed.
 * A stale file must not resume Auto. Pass null when there is no fresh heartbeat.
 */
export function bootFromHeartbeat(
  saved: { mode?: unknown; killed?: unknown; ts?: unknown } | null | undefined,
  nowMs: number,
  maxAgeMs = 6 * 60 * 60 * 1000,
): DeskSession | null {
  if (!saved || typeof saved.ts !== "number" || !Number.isFinite(saved.ts)) return null;
  if (saved.ts > nowMs + 60_000) return null;
  if (nowMs - saved.ts > maxAgeMs) return null;
  return bootFromSavedSession(saved);
}
