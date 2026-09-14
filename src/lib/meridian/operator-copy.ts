import { PROMOTE_MIN_AUC, PROMOTE_MIN_HIT, PROMOTE_MIN_N } from "./kelly";
export { explainReason } from "./reasons";

export const MODE_CHIPS = [
  { id: "advisory" as const, label: "Signals", hint: "Propose. Do not send." },
  { id: "paper" as const, label: "Paper", hint: "Approve / Skip / Size. 15s auto-skip. Kite off." },
  { id: "auto" as const, label: "Auto", hint: "Crypto spot farm. Paper only. Kite off." },
];

/** Paper Action Center: proposal expires unless Approve / Skip. */
export const PAPER_AUTO_SKIP_SEC = 15;

export function suggestedQty(px: number, sizePct: number, budget = 1_000_000): number {
  if (!(px > 0) || !(sizePct > 0)) return 0;
  return Math.max(1, Math.floor((budget * sizePct) / px));
}

export function sizeLadder(baseQty: number): { mult: number; label: string; qty: number }[] {
  const base = Math.max(0, Math.floor(baseQty));
  return [
    { mult: 0.5, label: "½", qty: Math.max(1, Math.floor(base * 0.5) || 1) },
    { mult: 1, label: "1×", qty: Math.max(1, base || 1) },
    { mult: 1.5, label: "1½", qty: Math.max(1, Math.floor(base * 1.5) || 1) },
  ];
}

export function autoSkipLabel(secondsLeft: number): string {
  const s = Math.max(0, Math.ceil(secondsLeft));
  return `Auto-skip ${s}s`;
}

export function actionCenterBlurb(mode: "advisory" | "paper" | "auto", killed: boolean): string {
  if (killed) {
    return "No new clips. Open risk still here — hard stop, time stop, trail, and session exits still run. Resume paper from Halt.";
  }
  if (mode === "advisory") {
    return "Approve opens a paper clip. Skip cools the name for 15 minutes. Size picks ½ / 1× / 1½. Stops still run. Cash/F&O/MCX stay propose-only.";
  }
  if (mode === "paper") {
    return "Paper waits for Approve / Skip / Size. 15s auto-skip is labelled on each proposal. Flatten one per open clip. Kite stays off.";
  }
  return "Auto is sending crypto spot only. Skip a name or flatten one open clip. Cash, F&O, MCX do not fill.";
}

export type PromotionMeta = {
  n: number;
  auc: number;
  hitRate: number;
  promoted: boolean;
  source: "synth" | "paper" | string;
  timeStopN?: number;
  qualityHoldN?: number;
};

export function promotionVerdict(meta: PromotionMeta | null | undefined): {
  ready: boolean;
  title: string;
  body: string;
  next: string;
  gates: { label: string; pass: boolean; detail: string }[];
} {
  const n = meta?.n ?? 0;
  const auc = meta?.auc ?? 0;
  const hit = meta?.hitRate ?? 0;
  const source = meta?.source ?? "synth";
  const timeStop = meta?.timeStopN;
  const quality = meta?.qualityHoldN;
  const nPass = n >= PROMOTE_MIN_N;
  const aucPass = auc >= PROMOTE_MIN_AUC;
  const hitPass = hit > PROMOTE_MIN_HIT;
  const srcPass = source === "paper";
  const ready = !!(meta?.promoted && nPass && aucPass && hitPass && srcPass);
  const gates = [
    {
      label: "Sample count",
      pass: nPass,
      detail: `${n.toLocaleString("en-IN")} (need ${PROMOTE_MIN_N.toLocaleString("en-IN")})`,
    },
    {
      label: "AUC",
      pass: aucPass,
      detail: `${auc.toFixed(3)} (need ${PROMOTE_MIN_AUC.toFixed(2)})`,
    },
    {
      label: "Hit rate",
      pass: hitPass,
      detail: `${(hit * 100).toFixed(0)}% (need ${(PROMOTE_MIN_HIT * 100).toFixed(0)}%+)`,
    },
    { label: "Source", pass: srcPass, detail: source === "paper" ? "paper fills" : "synth — do not promote" },
  ];
  if (ready) {
    return {
      ready: true,
      title: "Ready to promote the PnL sleeve",
      body: `Paper fit clears the gates. n ${n.toLocaleString("en-IN")} · AUC ${auc.toFixed(3)} · hit ${(hit * 100).toFixed(0)}%.`,
      next: "PnL sleeve may size BTC/ETH/SOL. Farm still labels clips. Kite stays off.",
      gates,
    };
  }
  const failed = gates.filter((g) => !g.pass).map((g) => g.label.toLowerCase());
  const holdBit =
    timeStop != null && n > 0
      ? ` ${timeStop.toLocaleString("en-IN")} of ${n.toLocaleString("en-IN")} labels are 90s time-stops; ${quality ?? 0} quality holds (≥5 min).`
      : "";
  return {
    ready: false,
    title: "Not ready to promote",
    body: `Do not size the PnL sleeve or treat Book Buy as model-backed. Blocker: ${failed.join(", ") || "gates"}.${holdBit} Hit ${(hit * 100).toFixed(0)}% is ${hit < 0.5 ? "worse than a coin flip" : "short of 52%"}.`,
    next: "Keep the farm sleeve on paper. Ignore Command cash advice that assumes a 0.55 meta gate.",
    gates,
  };
}
