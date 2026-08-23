import { PROMOTE_MIN_AUC, PROMOTE_MIN_HIT, PROMOTE_MIN_N } from "@/lib/meridian/kelly";
import { FARM_PROFILE, PNL_PROFILE } from "@/lib/meridian/decision";

export const MODE_LABEL: Record<"advisory" | "paper" | "auto", string> = {
  advisory: "Signals",
  paper: "Paper",
  auto: "Paper auto-send",
};

export const PENDING_MS = 15_000;

export function quoteSource(label?: string, feed?: string) {
  if (label === "delayed") return "quote:delayed";
  if (label === "model") return "quote:model";
  if (feed?.toLowerCase().includes("binance")) return "quote:binance";
  if (feed?.toLowerCase().includes("nse") || feed?.toLowerCase().includes("yahoo")) return "quote:nse";
  if (label === "live") return "quote:print";
  return "quote:print";
}

export function englishReason(raw: string, opts?: { sleeve?: string; side?: string; quote?: string }) {
  const q = opts?.quote ?? "";
  const map: Record<string, string> = {
    time_stop: "Farm time-stop — 90s barrier",
    fade_short: "Farm fade on the short side",
    passed_gates: "Farm passed gates",
    not_promoted: "PnL sleeve waiting on hit rate / AUC gates",
    cooldown: "Cooldown — same name too soon",
    nse_session_closed: "NSE session closed — flattened",
    night_crypto_only: "Cash session closed — crypto only",
    stop: "Stop hit",
    take_profit: "Take-profit",
    flatten: "Flattened by operator",
    skipped_timeout: "Skipped — pending timed out",
    skipped_operator: "Skipped by operator",
  };
  const parts = raw.split(":");
  const key = parts.find((p) => map[p]) ?? parts[0] ?? raw;
  const head = map[key] ?? raw.replace(/:live\b/g, "").replace(/_/g, " ");
  const sleeve =
    opts?.sleeve === "pnl" ? "PnL sleeve. " : opts?.sleeve === "farm" ? "Farm sleeve. " : "";
  return `${sleeve}${head}${q ? ` (${q})` : ""}`.trim();
}

export function promotionLines(meta?: {
  n?: number;
  auc?: number;
  hitRate?: number;
  promoted?: boolean;
  source?: string;
}) {
  const n = meta?.n ?? 0;
  const auc = meta?.auc ?? 0;
  const hit = meta?.hitRate ?? 0;
  const promoted = Boolean(meta?.promoted);
  const nOk = n >= PROMOTE_MIN_N;
  const aucOk = auc >= PROMOTE_MIN_AUC;
  const hitOk = hit > PROMOTE_MIN_HIT;
  if (promoted) {
    return {
      headline: "Ready to promote the PnL sleeve.",
      body: `n ${n.toLocaleString("en-IN")} · AUC ${auc.toFixed(3)} · hit ${(hit * 100).toFixed(0)}%. Size real paper P&L only if heat is clear.`,
      nOk,
      aucOk,
      hitOk,
      promoted: true,
    };
  }
  const blockers = [
    !nOk ? `n ${n.toLocaleString("en-IN")} (need ${PROMOTE_MIN_N.toLocaleString("en-IN")})` : null,
    !aucOk ? `AUC ${auc.toFixed(3)} (need ${PROMOTE_MIN_AUC})` : null,
    !hitOk ? `hit ${(hit * 100).toFixed(0)}% (need ${Math.round(PROMOTE_MIN_HIT * 100)}%)` : null,
  ].filter(Boolean);
  return {
    headline: "Not ready to promote.",
    body: `${blockers.join(". ")}. PnL sleeve stays flat. Keep paper farming. Do not treat Book Buy as model-backed.`,
    nOk,
    aucOk,
    hitOk,
    promoted: false,
  };
}

export function heatLine(farm: number, pnl: number) {
  return `Farm heat ${(farm * 100).toFixed(0)}% of ${(FARM_PROFILE.MAX_HEAT * 100).toFixed(0)}%. PnL heat ${(pnl * 100).toFixed(0)}% of ${(PNL_PROFILE.MAX_HEAT * 100).toFixed(0)}%.`;
}

export function englishAuthError(msg: string, origin?: string) {
  if (/invalid origin/i.test(msg)) {
    const here = origin || (typeof window !== "undefined" ? window.location.origin : "");
    return `This page's host is not trusted for sign-in. Use http://localhost:3000 or http://127.0.0.1:3000 — same app, either loopback is fine. You are on ${here || "an unknown host"}.`;
  }
  return msg;
}
