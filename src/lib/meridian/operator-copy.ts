import { PROMOTE_MIN_AUC, PROMOTE_MIN_HIT, PROMOTE_MIN_N } from "./kelly";
export { explainReason } from "./reasons";

export const MODE_CHIPS = [
  { id: "advisory" as const, label: "Signals", hint: "Propose. Do not send." },
  { id: "paper" as const, label: "Paper", hint: "Mock capital. Kite off." },
  { id: "auto" as const, label: "Paper loop", hint: "Same book, still not live." },
];

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
