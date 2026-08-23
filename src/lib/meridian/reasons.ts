export function explainReason(raw: string): string {
  if (!raw) return "—";
  const parts = raw.split(":").filter(Boolean);
  const mapped = parts.map((p) => REASON_PART[p] ?? p.replace(/_/g, " "));
  const uniq: string[] = [];
  for (const m of mapped) if (!uniq.includes(m)) uniq.push(m);
  return uniq.join(" · ");
}

const REASON_PART: Record<string, string> = {
  farm: "Farm",
  pnl: "PnL sleeve",
  live: "paper quote",
  delayed: "delayed quote",
  model: "model quote",
  passed_gates: "passed gates",
  fade_short: "fade short",
  time_stop: "time stop (farm label)",
  not_promoted: "waiting — model not promoted",
  cooldown: "cooldown",
  kill_switch: "halted",
  flatten_operator: "flattened by you",
  skip_operator: "skipped by you",
  block_operator: "blocked by you",
  family_net: "closed overlapping name",
  family_open: "same coin already open",
  stale_model: "stale model quote — flattened",
  nse_session_closed: "NSE session closed",
  night_crypto_only: "night: crypto only",
  take_profit: "take profit",
  hard_stop: "hard stop",
  trail_stop: "trail stop",
  heat_limit: "heat cap",
  daily_loss: "daily loss gate",
  max_positions: "position cap",
  low_meta_prob: "meta too low",
  zero_size: "size rounded to zero",
  too_close_to_eod: "too close to cash close",
  queue_hedge: "queued gamma hedge",
  open_operator: "opened by you",
  blocked: "blocked symbol",
  long: "was long",
  short: "was short",
};
