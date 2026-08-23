import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { DeskShell } from "@/components/desk-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resetDeskPaper, setDeskMode } from "@/components/auto-engine";
import { useDesk } from "@/lib/desk-store";
import { inr, formatIstStamp } from "@/lib/utils";
import { PAPER_BUDGET, FARM_PROFILE, PNL_PROFILE } from "@/lib/meridian/decision";
import { getPaperBook, getPaperSamples } from "@/lib/server/desk";
import { PromotionChip } from "@/components/promotion-strip";
import { explainReason, MODE_CHIPS } from "@/lib/meridian/operator-copy";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { toast } from "sonner";
import { paperSend } from "@/lib/desk-ops";
import { HeatRing } from "@/components/heat-ring";

export const Route = createFileRoute("/auto")({ component: AutoPage });

function AutoPage() {
  const mode = useDesk((s) => s.mode);
  const killed = useDesk((s) => s.killed);
  const positions = useDesk((s) => s.positions);
  const fills = useDesk((s) => s.fills);
  const ticks = useDesk((s) => s.ticks);
  const dailyPnl = useDesk((s) => s.dailyPnl);
  const scan = useDesk((s) => s.scan);
  const { user, isPending } = useCurrentUserState();
  const guest = !isPending && !user;
  const paper = useQuery({ queryKey: ["paper"], queryFn: () => getPaperBook(), refetchInterval: 2500 });
  const [resetAsk, setResetAsk] = useState(false);
  const [menu, setMenu] = useState(false);

  const mtm = positions.reduce((a, p) => {
    const px = ticks[p.symbol] ?? p.entryPrice;
    const dir = p.side === "short" ? -1 : 1;
    return a + (px - p.entryPrice) * p.qty * dir;
  }, 0);
  const heat = (paper.data?.heatFarm ?? 0) + (paper.data?.heatPnl ?? 0);

  async function downloadSamples() {
    const rows = await getPaperSamples();
    const cols = [
      "symbol", "side", "hold_sec", "fwd_ret", "reason_close", "quality_hold", "contaminated", "set", "pnl",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meridian-fit-samples-${Date.now()}.csv`;
    a.click();
  }

  const pending = scan.filter((r) => r.action === "BUY" || r.action === "SELL");
  const idle = scan.filter((r) => r.action !== "BUY" && r.action !== "SELL");

  return (
    <DeskShell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Auto trade</p>
          <h1 className="mt-1 font-display text-4xl">Paper loop</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Shared paper book {inr(PAPER_BUDGET)}. Kite stays off. Signals proposes and still runs stops. Paper and Auto
            both send farm clips. Flatten or skip a single name here — you are not a spectator.
          </p>
        </div>

        <PromotionChip meta={paper.data?.meta} />

        <div className="flex flex-wrap gap-2">
          {MODE_CHIPS.map((m) => (
            <Button
              key={m.id}
              variant={mode === m.id ? "default" : "outline"}
              disabled={guest}
              title={m.hint}
              onClick={() => void setDeskMode(m.id)}
            >
              {m.label}
            </Button>
          ))}
          <Button variant="outline" onClick={() => setMenu((v) => !v)}>
            More
          </Button>
          <div className={`flex flex-wrap gap-2 ${menu ? "" : "hidden"}`}>
            <Button variant="outline" onClick={() => void downloadSamples()}>
              Download fit samples
            </Button>
            {resetAsk ? (
              <>
                <Button
                  variant="danger"
                  disabled={guest}
                  onClick={() => {
                    void resetDeskPaper();
                    setResetAsk(false);
                    toast.message("Open clips cleared. Fit samples on disk were not deleted.");
                  }}
                >
                  Confirm reset
                </Button>
                <Button variant="ghost" onClick={() => setResetAsk(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" disabled={guest} onClick={() => setResetAsk(true)}>
                Reset paper…
              </Button>
            )}
          </div>
        </div>
        {guest && (
          <p className="text-xs text-subtle">Sign in to Halt, change mode, or reset the shared book.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label="Budget" value={inr(PAPER_BUDGET)} sub={`farm ${FARM_PROFILE.MAX_POS} · pnl ${PNL_PROFILE.MAX_POS}`} />
          <Kpi label="Open MTM" value={inr(mtm)} up={mtm >= 0} />
          <Kpi label="Realised" value={inr(dailyPnl)} up={dailyPnl >= 0} />
          <Kpi label="Heat" value={`${(heat * 100).toFixed(0)}%`} sub="farm + pnl size" ring={<HeatRing heat={heat} cap={0.9} />} />
          <Kpi
            label="Meta"
            value={paper.data?.meta?.promoted ? "armed" : "not ready"}
            sub={`n ${paper.data?.meta?.n ?? 0} · hit ${((paper.data?.meta?.hitRate ?? 0) * 100).toFixed(0)}%`}
          />
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">
            {killed ? "HALTED — no new clips" : mode === "advisory" ? "Action center — would send, not sent" : "Action center"}
          </h2>
          <p className="mt-1 text-xs text-subtle">
            {killed
              ? "Open risk still here. Stops paused. Resume paper from Halt in the header."
              : mode === "advisory"
                ? "Approve opens a paper clip. Skip cools the name for 15 minutes. Stops still run."
                : mode === "auto"
                  ? "Auto is sending farm clips on its own. Skip a name or flatten an open clip."
                  : "Paper is sending farm clips. Skip a name or flatten an open clip."}
          </p>
          {scan.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Waiting on the next scan tick.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {[...pending, ...idle].slice(0, 16).map((r) => (
                <li key={r.symbol} className={`flex flex-wrap items-center gap-2 rounded-[16px] border border-border bg-elevated p-3 ${killed ? "opacity-50" : ""}`}>
                  <span className="font-mono text-xs">{r.symbol}</span>
                  <Badge tone={r.action === "BUY" ? "up" : r.action === "SELL" ? "down" : "neutral"}>
                    {mode === "advisory" && (r.action === "BUY" || r.action === "SELL") ? `Would ${r.action}` : r.action}
                  </Badge>
                  <span className="text-muted">{(r.metaProb * 100).toFixed(0)}% meta</span>
                  <span className="text-subtle">{explainReason(r.reason)}</span>
                  <span className="ml-auto flex flex-wrap gap-2">
                    {mode === "advisory" && (r.action === "BUY" || r.action === "SELL") && (
                      <Button
                        size="sm"
                        onClick={() =>
                          void paperSend({
                            type: "open",
                            symbol: r.symbol.replace(/^(farm|pnl):/, ""),
                            side: r.action === "SELL" ? "short" : "long",
                            sleeve: r.sleeve,
                          })
                        }
                      >
                        Approve
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => void paperSend({ type: "skip", symbol: r.symbol })}>
                      Skip
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Open clips</h2>
          {positions.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No open clips. Paper or Auto must be on, Halt off. Signals still shows proposals above.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-subtle">
                  <tr>
                    <th className="py-2 font-medium">Symbol</th>
                    <th className="font-medium">Sleeve</th>
                    <th className="font-medium">Side</th>
                    <th className="font-medium">Qty</th>
                    <th className="font-medium">Hold</th>
                    <th className="font-medium">Stop</th>
                    <th className="font-medium">Meta</th>
                    <th className="font-medium">P&L</th>
                    <th className="font-medium"> </th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const px = ticks[p.symbol] ?? p.entryPrice;
                    const dir = p.side === "short" ? -1 : 1;
                    const pnl = (px - p.entryPrice) * p.qty * dir;
                    const held = Math.max(0, (Date.now() - p.entryTs) / 1000);
                    const cap = p.sleeve === "pnl" ? 0 : FARM_PROFILE.TIME_STOP_SEC;
                    const left = cap > 0 ? Math.max(0, cap - held) : null;
                    return (
                      <tr key={p.symbol + p.entryTs} className="border-t border-border">
                        <td className="py-2 font-mono text-xs">
                          {p.symbol}
                          {(p.expiry || p.strike) && (
                            <div className="text-[10px] text-subtle">{[p.expiry, p.strike, p.right].filter(Boolean).join(" ")}</div>
                          )}
                        </td>
                        <td>
                          <Badge tone={p.sleeve === "pnl" ? "up" : "neutral"}>{p.sleeve ?? "farm"}</Badge>
                        </td>
                        <td>
                          <Badge tone={p.side === "short" ? "down" : "up"}>{p.side ?? "long"}</Badge>
                        </td>
                        <td>{p.qty}</td>
                        <td className="font-mono text-xs">
                          {left != null ? `STOP ${Math.round(left)}s` : `${Math.round(held)}s`}
                        </td>
                        <td className="font-mono">{(p.stopPct * 100).toFixed(2)}%</td>
                        <td>{(p.metaProb * 100).toFixed(0)}%</td>
                        <td className={pnl >= 0 ? "text-up" : "text-down"}>{inr(pnl)}</td>
                        <td>
                          <Button size="sm" variant="outline" onClick={() => void paperSend({ type: "flatten", symbol: p.symbol })}>
                            Flatten
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void paperSend({ type: "reverse", symbol: p.symbol })}>
                            Reverse
                          </Button>
                        </td>
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
          <ul className="fill-tape mt-3 space-y-2">
            {fills.slice(0, 12).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 text-sm" style={{ animation: "flash-up var(--motion-regular) var(--ease-out-desk)" }}>
                <Badge tone={f.side === "BUY" ? "up" : "down"}>{f.side}</Badge>
                <span className="font-mono text-xs">{f.symbol}</span>
                <span className="text-muted">
                  {f.qty} @ {f.price.toFixed(2)} <span className="font-mono text-[11px]">{formatIstStamp(f.ts)}</span>
                </span>
                <span className="text-subtle">{explainReason(f.reason)}</span>
              </li>
            ))}
            {fills.length === 0 && <li className="text-sm text-muted">Engine starting…</li>}
          </ul>
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Other scan rows</h2>
          {idle.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No flats this tick.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {idle.slice(0, 16).map((r) => (
                <li key={r.symbol} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono text-xs">{r.symbol}</span>
                  <Badge tone="neutral">{r.action}</Badge>
                  <span className="text-muted">{(r.metaProb * 100).toFixed(0)}% meta</span>
                  <span className="text-subtle">{explainReason(r.reason)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DeskShell>
  );
}

function Kpi({ label, value, sub, up, ring }: { label: string; value: string; sub?: string; up?: boolean; ring?: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-border bg-surface p-5">
      <p className="text-[11px] uppercase tracking-wider text-subtle">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        {ring}
        <p className={`font-mono text-2xl ${up === undefined ? "" : up ? "text-up" : "text-down"}`}>{value}</p>
      </div>
      {sub && <p className="mt-1 text-[11px] text-subtle">{sub}</p>}
    </div>
  );
}
