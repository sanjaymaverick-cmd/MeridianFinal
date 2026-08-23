import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DeskShell } from "@/components/desk-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/confirm";
import { PromotionStrip } from "@/components/promotion-strip";
import {
  resetDeskPaper,
  setDeskMode,
  flattenDeskClip,
  approveDeskPending,
  skipDeskPending,
  dismissDeskHedge,
} from "@/components/auto-engine";
import { useDesk } from "@/lib/desk-store";
import { inr, formatIstStamp } from "@/lib/utils";
import { PAPER_BUDGET, FARM_PROFILE, PNL_PROFILE } from "@/lib/meridian/decision";
import { getPaperBook, getPaperSamples } from "@/lib/server/desk";
import { MODE_LABEL, quoteSource, heatLine, PENDING_MS } from "@/lib/ux-copy";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/auto")({ component: AutoPage });

function AutoPage() {
  const { user, isPending } = useCurrentUserState();
  const operator = Boolean(user);
  const mode = useDesk((s) => s.mode);
  const killed = useDesk((s) => s.killed);
  const positions = useDesk((s) => s.positions);
  const fills = useDesk((s) => s.fills);
  const ticks = useDesk((s) => s.ticks);
  const dailyPnl = useDesk((s) => s.dailyPnl);
  const scan = useDesk((s) => s.scan);
  const pausedAt = useDesk((s) => s.pausedAt);
  const paper = useQuery({ queryKey: ["paper"], queryFn: () => getPaperBook(), refetchInterval: 2500 });
  const [askReset, setAskReset] = useState(false);
  const [sizeEdits, setSizeEdits] = useState<Record<string, number>>({});

  const mtm = positions.reduce((a, p) => {
    const px = ticks[p.symbol] ?? p.entryPrice;
    const dir = p.side === "short" ? -1 : 1;
    return a + (px - p.entryPrice) * p.qty * dir;
  }, 0);

  const pending = paper.data?.pending ?? [];
  const heat = paper.data?.heat ?? { farm: 0, pnl: 0 };
  const lastDecision = paper.data?.lastDecision ?? "Waiting on the first scan.";
  const closeStats = paper.data?.closeStats;
  const queued = paper.data?.queuedHedge;

  async function downloadSamples() {
    const rows = await getPaperSamples();
    const cols = [
      "id",
      "symbol",
      "side",
      "qty",
      "entry",
      "exit",
      "pnl",
      "opened_ist",
      "closed_ist",
      "hold_sec",
      "hold_class",
      "fwd_ret",
      "reason_open",
      "reason_close",
      "meta_prob",
      "score",
      "ts_open",
      "ts_close",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = `# Fit set from paper_samples (closed clips). Not live quotes. Filter quality vs time-stop via hold_class. On-screen n ${paper.data?.samples ?? rows.length}; artefact n ${paper.data?.meta?.n ?? 0}.`;
    const csv = [header, cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meridian-fit-set-${Date.now()}.csv`;
    a.click();
  }

  function needOp() {
    if (!operator) {
      toast.message("Guest view only. Sign in to change the shared book.");
      return false;
    }
    return true;
  }

  return (
    <DeskShell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Auto</p>
          <h1 className="mt-1 font-display text-4xl">Paper desk</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Shared paper book {inr(PAPER_BUDGET)}. Signals proposes. Paper waits for Approve / Skip ({PENDING_MS / 1000}s auto-skip).
            Paper auto-send fills on its own. Live Kite stays locked. Farm time-stop {FARM_PROFILE.TIME_STOP_SEC}s. PnL sleeve stays
            flat until promotion gates pass.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-subtle">Mirrors header</span>
          {(["advisory", "paper", "auto"] as const).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? "default" : "outline"}
              disabled={!operator}
              onClick={() => needOp() && void setDeskMode(m)}
            >
              {MODE_LABEL[m]}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={!operator || isPending}
            onClick={() => needOp() && setAskReset(true)}
          >
            Reset paper
          </Button>
          <Button size="sm" variant="outline" onClick={() => void downloadSamples()}>
            Download fit set
          </Button>
        </div>

        <PromotionStrip meta={paper.data?.meta} closeStats={closeStats} />

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <p className="text-[11px] uppercase tracking-wider text-subtle">Last decision</p>
          <p className="mt-2 text-sm leading-relaxed">{lastDecision}</p>
          <p className="mt-2 text-xs text-subtle">{heatLine(heat.farm, heat.pnl)}</p>
          {killed && (
            <p className="mt-2 text-sm text-warn">
              PAUSED{pausedAt ? ` at ${formatIstStamp(pausedAt)}` : ""}. Exits still run. BUY is not live.
            </p>
          )}
        </div>

        {queued && (
          <div className="flex flex-wrap items-center gap-3 rounded-[24px] border border-border bg-surface p-5">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-subtle">Queued from {queued.from}</p>
              <p className="mt-1 text-sm">
                {queued.symbol} — {queued.note}
              </p>
            </div>
            <Button size="sm" variant="ghost" disabled={!operator} onClick={() => needOp() && void dismissDeskHedge()}>
              Dismiss
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[24px] border border-border bg-surface p-5">
            <p className="text-[11px] uppercase tracking-wider text-subtle">Budget</p>
            <p className="mt-2 font-mono text-2xl">{inr(PAPER_BUDGET)}</p>
            <p className="mt-1 text-[11px] text-subtle">
              farm {FARM_PROFILE.MAX_POS} · pnl {PNL_PROFILE.MAX_POS} clips
            </p>
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
            <p className="text-[11px] uppercase tracking-wider text-subtle">Samples</p>
            <p className="mt-2 font-mono text-2xl">{paper.data?.samples ?? 0}</p>
            <p className="mt-1 text-[11px] text-subtle">
              Artefact n {paper.data?.meta?.n ?? 0}
              {(paper.data?.samples ?? 0) !== (paper.data?.meta?.n ?? 0)
                ? " — counts differ; CSV is the fit set, artefact is the last fit."
                : ""}
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Action center</h2>
            <Badge tone="neutral">
              {mode === "paper" ? "Timeout auto-skip 15s" : mode === "auto" ? "Auto-send — no pending" : "Signals — not sent"}
            </Badge>
          </div>
          {pending.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              {mode === "paper"
                ? "No pending clip. Farm proposals wait here for Approve, Skip, or Size."
                : mode === "auto"
                  ? "Paper auto-send fills without a queue. Switch to Paper for Approve / Skip."
                  : "Signals only. Would-be entries sit on Last scan. Start paper to send."}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {pending.map((p) => {
                const left = Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000));
                const size = sizeEdits[p.id] ?? p.sizePct;
                return (
                  <li key={p.id} className="rounded-[16px] border border-border bg-elevated p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={p.side === "short" ? "down" : "up"}>{p.side === "short" ? "Pending SELL" : "Pending BUY"}</Badge>
                      <span className="font-mono text-xs">{p.symbol}</span>
                      <span className="text-sm text-muted">
                        {p.qty} @ {p.px.toFixed(2)} · {(size * 100).toFixed(1)}%
                      </span>
                      <span className="text-xs text-subtle">
                        {p.timeout} in {left}s
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted">{p.reason}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="text-xs text-subtle">
                        Size %
                        <input
                          type="number"
                          min={2}
                          max={8}
                          step={0.5}
                          className="ml-2 h-9 w-20 rounded-[8px] border border-border bg-bg px-2 font-mono text-xs"
                          value={(size * 100).toFixed(1)}
                          onChange={(e) =>
                            setSizeEdits((s) => ({ ...s, [p.id]: Math.max(0.02, Number(e.target.value) / 100) }))
                          }
                        />
                      </label>
                      <Button
                        size="sm"
                        disabled={!operator}
                        onClick={() => needOp() && void approveDeskPending(p.id, size)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!operator}
                        onClick={() => needOp() && void skipDeskPending(p.id)}
                      >
                        Skip
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Open clips</h2>
          {positions.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              {killed
                ? "Engine paused. Start paper to send farm clips. Signals still scan."
                : mode === "advisory"
                  ? "Signals — nothing is sent. Switch to Paper or Paper auto-send."
                  : "Waiting on the next scan."}
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-3 md:hidden">
                {positions.map((p) => (
                  <ClipCard key={p.symbol + p.entryTs} p={p} last={ticks[p.symbol] ?? p.entryPrice} operator={operator} needOp={needOp} />
                ))}
              </ul>
              <div className="mt-3 hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-subtle">
                    <tr>
                      <th className="py-2 font-medium">Symbol</th>
                      <th className="font-medium">Sleeve</th>
                      <th className="font-medium">Side</th>
                      <th className="font-medium">Qty</th>
                      <th className="font-medium">Entry</th>
                      <th className="font-medium">Hold</th>
                      <th className="font-medium">Last</th>
                      <th className="font-medium">Stop</th>
                      <th className="font-medium">P&L</th>
                      <th className="font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => {
                      const px = ticks[p.symbol] ?? p.entryPrice;
                      const dir = p.side === "short" ? -1 : 1;
                      const pnl = (px - p.entryPrice) * p.qty * dir;
                      return (
                        <tr key={p.symbol + p.entryTs} className="border-t border-border">
                          <td className="py-2 font-mono text-xs">{p.symbol}</td>
                          <td>
                            <Badge tone={p.sleeve === "pnl" ? "up" : "neutral"}>{p.sleeve ?? "farm"}</Badge>
                          </td>
                          <td>
                            <Badge tone={p.side === "short" ? "down" : "up"}>{p.side ?? "long"}</Badge>
                          </td>
                          <td>{p.qty}</td>
                          <td className="font-mono">{p.entryPrice.toFixed(2)}</td>
                          <td className="text-xs text-muted">{holdLeft(p)}</td>
                          <td className="font-mono">{px.toFixed(2)}</td>
                          <td className="font-mono">{(p.stopPct * 100).toFixed(2)}%</td>
                          <td className={pnl >= 0 ? "text-up" : "text-down"}>{inr(pnl)}</td>
                          <td>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!operator}
                              onClick={() => needOp() && void flattenDeskClip(p.symbol)}
                            >
                              Flatten
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
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
                  {f.qty} @ {f.price.toFixed(2)}
                </span>
                <span className="font-mono text-[11px] text-subtle">{formatIstStamp(f.ts)}</span>
                <Badge tone="neutral">{quoteSource(f.quoteLabel)}</Badge>
                <span className="text-subtle">{f.reason}</span>
              </li>
            ))}
            {fills.length === 0 && <li className="text-sm text-muted">No fills. Start paper when you want clips sent.</li>}
          </ul>
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Last scan</h2>
          {killed && mode !== "advisory" ? (
            <p className="mt-3 text-sm text-warn">
              PAUSED{pausedAt ? ` at ${formatIstStamp(pausedAt)}` : ""}. Scan frozen. BUY is not live.
            </p>
          ) : scan.length === 0 ? (
            <p className="mt-3 text-sm text-muted">First scan in a few seconds.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {scan.slice(0, 24).map((r) => (
                <li key={r.symbol} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono text-xs">{r.symbol}</span>
                  <Badge
                    tone={
                      r.action.includes("BUY") ? "up" : r.action.includes("SELL") ? "down" : "neutral"
                    }
                  >
                    {r.action}
                  </Badge>
                  <span className="text-muted">
                    {paper.data?.meta?.promoted ? `${(r.metaProb * 100).toFixed(0)}% meta` : "meta n/a"}
                  </span>
                  <span className="text-subtle">{r.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {askReset && (
        <Confirm
          title="Reset the paper book?"
          body="Clears open clips, pending proposals, fills, and daily P&L. Keeps live quotes, the universe, and the promotion artefact. Does not touch Kite (disarmed)."
          action="Reset paper"
          danger
          onCancel={() => setAskReset(false)}
          onOk={() => {
            setAskReset(false);
            void resetDeskPaper();
          }}
        />
      )}
    </DeskShell>
  );
}

function holdLeft(p: { sleeve?: string; entryTs: number }) {
  if (p.sleeve === "pnl") return "Quality hold — no time-stop";
  const left = Math.max(0, FARM_PROFILE.TIME_STOP_SEC - (Date.now() - p.entryTs) / 1000);
  return `${Math.round(left)}s to time-stop`;
}

function ClipCard({
  p,
  last,
  operator,
  needOp,
}: {
  p: { symbol: string; entryTs: number; entryPrice: number; qty: number; side?: string; sleeve?: string; stopPct: number };
  last: number;
  operator: boolean;
  needOp: () => boolean;
}) {
  const dir = p.side === "short" ? -1 : 1;
  const pnl = (last - p.entryPrice) * p.qty * dir;
  return (
    <li className="rounded-[16px] border border-border bg-elevated p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs">{p.symbol}</span>
        <Badge tone={p.side === "short" ? "down" : "up"}>{p.side ?? "long"}</Badge>
      </div>
      <p className="mt-2 text-sm text-muted">
        {p.qty} @ {p.entryPrice.toFixed(2)} → {last.toFixed(2)} · stop {(p.stopPct * 100).toFixed(2)}%
      </p>
      <p className="mt-1 text-xs text-subtle">{holdLeft(p)}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className={pnl >= 0 ? "text-up" : "text-down"}>{inr(pnl)}</span>
        <Button size="sm" variant="outline" disabled={!operator} onClick={() => needOp() && void flattenDeskClip(p.symbol)}>
          Flatten
        </Button>
      </div>
    </li>
  );
}
