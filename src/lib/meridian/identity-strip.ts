/** Compact honesty strip for every DeskShell page. Never shows Live as armed. */

export type DeskModeId = "advisory" | "paper" | "auto";

const MODE_LABEL: Record<DeskModeId, string> = {
  advisory: "Signals",
  paper: "Paper",
  auto: "Auto-send",
};

export function deskIdentityStrip(opts: { mode: DeskModeId | string; killed: boolean }): {
  mock: string;
  mode: string;
  engine: string;
  kite: string;
} {
  const raw = String(opts.mode);
  // Never show Live as armed — fall back to Signals for unknown/live modes.
  const modeLabel =
    raw === "advisory" || raw === "paper" || raw === "auto"
      ? MODE_LABEL[raw]
      : /live/i.test(raw)
        ? "Signals"
        : "Signals";
  return {
    mock: "MOCK ₹",
    mode: modeLabel,
    engine: opts.killed ? "ENGINE PAUSED" : "ENGINE ON",
    kite: "KITE DISARMED",
  };
}

export function deskIdentityStripText(opts: { mode: DeskModeId | string; killed: boolean }): string {
  const s = deskIdentityStrip(opts);
  return `${s.mock} · ${s.mode} · ${s.engine} · ${s.kite}`;
}
