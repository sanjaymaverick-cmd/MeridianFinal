import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DeskShell } from "@/components/desk-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resetDeskPaper, setDeskKilled, setDeskMode } from "@/components/auto-engine";
import { useDesk } from "@/lib/desk-store";
import { inr, formatIstStamp } from "@/lib/utils";
import { PAPER_BUDGET, MIN_HOLD_SEC, MIN_META_PROB, TIME_STOP_SEC, MAX_POS_PAPER } from "@/lib/meridian/decision";
import { getPaperBook, getPaperSamples } from "@/lib/server/desk";

export const Route = createFileRoute("/auto")({ component: AutoPage });

function AutoPage() {
  const mode = useDesk((s) => s.mode);
  const killed = useDesk((s) => s.killed);
  const positions = useDesk((s) => s.positions);
  const fills = useDesk((s) => s.fills);
  const ticks = useDesk((s) => s.ticks);
  const dailyPnl = useDesk((s) => s.dailyPnl);
  const scan = useDesk((s) => s.scan);
  const paper = useQuery({ queryKey: ["paper"], queryFn: () => getPaperBook(), refetchInterval: 2500 });

  const mtm = positions.reduce((a, p) => {
    const px = ticks[p.symbol] ?? p.entryPrice;
    const dir = p.side === "short" ? -1 : 1;
    return a + (px - p.entryPrice) * p.qty * dir;
  }, 0);

  async function downloadSamples() {
    const rows = await getPaperSamples();
    const cols = [
      "id", "symbol", "side", "qty", "entry", "exit", "pnl",
      "opened_ist", "closed_ist", "hold_sec", "fwd_ret",
      "reason_open", "reason_close", "meta_prob", "score", "ts_open", "ts_close",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meridian-paper-samples-${Date.now()}.csv`;
    a.click();
  }

  return (
    <DeskShell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Auto trade</p>
          <h1 className="mt-1 font-display text-4xl">Overnight paper loop</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            PnL profile: paper target ₹10k → ₹100k in ~30 days (aggressive, not a promise). Live marks only.
            Budget {inr(PAPER_BUDGET)}, max {MAX_POS_PAPER} clips, hold up to {TIME_STOP_SEC}s,
            meta ≥ {MIN_META_PROB}. Longs + fade-shorts. Paper only — Kite stays off.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["advisory", "paper", "auto"] as const).map((m) => (
            <Button key={m} variant={mode === m ? "default" : "outline"} onClick={() => void setDeskMode(m)}>
              {m}
            </Button>
          ))}
          <Button variant={killed ? "outline" : "danger"} onClick={() => void setDeskKilled(!killed)}>
            {killed ? "Clear kill" : "Kill switch"}
          </Button>
          <Button variant="ghost" onClick={() => void resetDeskPaper()}>
            Reset paper
          </Button>
          <Button variant="outline" onClick={() => void downloadSamples()}>
            Download samples
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-[24px] border border-border bg-surface p-5">
            <p className="text-[11px] uppercase tracking-wider text-subtle">Budget</p>
            <p className="mt-2 font-mono text-2xl">{inr(PAPER_BUDGET)}</p>
          </div>
          <div className="rounded-[24px] border border-border bg-surface p-5">
            <p className="text-[11px] uppercase tracking-wider text-subtle">Open MTM</p>
            <p className={`mt-2 font-mono text-2xl ${mtm >= 0 ? "text-up" : "text-down"}`}>{inr(mtm)}</p>
          </div>
          <div className="rounded-[24px] border border-border bg-surface p-5">
            <p className="text-[11px] uppercase tracking-wider text-subtle">Realised</p>
            <p className={`mt-2 font-mono text-2xl ${dailyPnl >= 0 ? "text-up" : "text-down"}`}>{inr(dailyPnl)}</p>
          </div>
          <div className="rounded-[24px] border border-border bg-surface p-5">
            <p className="text-[11px] uppercase tracking-wider text-subtle">Training samples</p>
            <p className="mt-2 font-mono text-2xl">{paper.data?.samples ?? 0}</p>
            <p className="mt-1 text-[11px] text-subtle">
              {paper.data?.ticksRun ?? 0} ticks · meta ≥ {MIN_META_PROB}
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Open clips</h2>
          {positions.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Waiting on the server loop — Auto must stay on, kill off.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-subtle">
                  <tr>
                    <th className="py-2 font-medium">Symbol</th>
                    <th className="font-medium">Side</th>
                    <th className="font-medium">Qty</th>
                    <th className="font-medium">Entry</th>
                    <th className="font-medium">Opened IST</th>
                    <th className="font-medium">Last</th>
                    <th className="font-medium">Stop</th>
                    <th className="font-medium">Meta</th>
                    <th className="font-medium">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const px = ticks[p.symbol] ?? p.entryPrice;
                    const dir = p.side === "short" ? -1 : 1;
                    const pnl = (px - p.entryPrice) * p.qty * dir;
                    return (
                      <tr key={p.symbol + p.entryTs} className="border-t border-border">
                        <td className="py-2 font-mono text-xs">
                          {p.symbol}
                          {(p.expiry || p.strike) && (
                            <div className="text-[10px] text-subtle">
                              {[p.expiry, p.strike, p.right].filter(Boolean).join(" ")}
                            </div>
                          )}
                        </td>
                        <td>
                          <Badge tone={p.side === "short" ? "down" : "up"}>{p.side ?? "long"}</Badge>
                        </td>
                        <td>{p.qty}</td>
                        <td className="font-mono">{p.entryPrice.toFixed(2)}</td>
                        <td className="font-mono text-[11px] text-muted">{formatIstStamp(p.entryTs)}</td>
                        <td className="font-mono">{px.toFixed(2)}</td>
                        <td className="font-mono">{(p.stopPct * 100).toFixed(2)}%</td>
                        <td>{(p.metaProb * 100).toFixed(0)}%</td>
                        <td className={pnl >= 0 ? "text-up" : "text-down"}>{inr(pnl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Fill tape</h2>
          <ul className="mt-3 space-y-2">
            {fills.slice(0, 24).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 text-sm">
                <Badge tone={f.side === "BUY" ? "up" : "down"}>{f.side}</Badge>
                <span className="font-mono text-xs">{f.symbol}</span>
                <span className="text-muted">
                  {f.qty} @ {f.price.toFixed(2)} <span className="font-mono text-[11px]">{formatIstStamp(f.ts)}</span>
                </span>
                {(f.expiry || f.strike) && (
                  <span className="text-[11px] text-subtle">{[f.expiry, f.strike, f.right].filter(Boolean).join(" ")}</span>
                )}
                {f.quoteLabel && f.quoteLabel !== "live" && <Badge tone="neutral">{f.quoteLabel}</Badge>}
                <span className="text-subtle">{f.reason}</span>
              </li>
            ))}
            {fills.length === 0 && <li className="text-sm text-muted">Engine starting…</li>}
          </ul>
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Last scan</h2>
          {scan.length === 0 ? (
            <p className="mt-3 text-sm text-muted">First scan in a few seconds.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {scan.slice(0, 24).map((r) => (
                <li key={r.symbol} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono text-xs">{r.symbol}</span>
                  <Badge tone={r.action === "BUY" ? "up" : "neutral"}>{r.action}</Badge>
                  <span className="text-muted">{(r.metaProb * 100).toFixed(0)}% meta</span>
                  <span className="text-subtle">{r.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DeskShell>
  );
}
