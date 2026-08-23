import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DeskShell } from "@/components/desk-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/desk-store";
import { parseHoldingsCsv, reviewHolding } from "@/lib/meridian/portfolio";
import { inr, pct } from "@/lib/utils";
import { saveHoldings } from "@/lib/server/desk";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { getMarket, getPaperBook } from "@/lib/server/desk";
import type { ActionLabel } from "@/lib/meridian/scoring";
import { runDeskOp } from "@/components/auto-engine";
import { PromotionChip } from "@/components/promotion-strip";
import { paperSend } from "@/lib/desk-ops";
import { paperBlockedReason } from "@/lib/meridian/session-lock";
import { FARM_PROFILE } from "@/lib/meridian/decision";

export const Route = createFileRoute("/portfolio")({ component: PortfolioPage });

function toneFor(a: ActionLabel | "—"): "up" | "down" | "warn" | "neutral" {
  if (a === "Strong Buy" || a === "Buy") return "up";
  if (a === "Sell" || a === "Reduce") return "down";
  if (a === "Hold") return "warn";
  return "neutral";
}

function PortfolioPage() {
  const holdings = useDesk((s) => s.holdings);
  const setHoldings = useDesk((s) => s.setHoldings);
  const ticks = useDesk((s) => s.ticks);
  const user = useCurrentUser();
  const m = useQuery({ queryKey: ["market"], queryFn: () => getMarket() });
  const paper = useQuery({ queryKey: ["paper"], queryFn: () => getPaperBook(), refetchInterval: 2500 });
  const promoted = !!paper.data?.meta?.promoted;
  const regime = m.data?.state.regime ?? "Calm";
  const [raw, setRaw] = useState("");
  const [tab, setTab] = useState<"clips" | "imported">("clips");
  const positions = useDesk((s) => s.positions);
  const dailyPnl = useDesk((s) => s.dailyPnl);

  const reviews = useMemo(
    () => holdings.map((h) => reviewHolding({ ...h, lastPrice: ticks[h.symbol] ?? h.lastPrice }, regime)),
    [holdings, ticks, regime],
  );
  const invested = reviews.reduce((a, r) => a + r.invested, 0);
  const value = reviews.reduce((a, r) => a + r.value, 0);

  function applyText(text: string) {
    const rows = parseHoldingsCsv(text);
    if (!rows.length) {
      toast.error("No holdings parsed. Need a header row with Symbol / Qty / Avg. cost.");
      return;
    }
    setHoldings(rows);
    toast.success(`Loaded ${rows.length} lines`);
    if (user) {
      void saveHoldings({ data: { rows } }).catch(() => toast.message("Saved locally. Sign-in required to persist."));
    }
  }

  return (
    <DeskShell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Book</p>
          <h1 className="mt-1 font-display text-4xl">Paper clips</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Open farm risk first. Imported Zerodha CSV is a second tab — not this book.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={tab === "clips" ? "default" : "outline"} onClick={() => setTab("clips")}>
            Paper clips
          </Button>
          <Button size="sm" variant={tab === "imported" ? "default" : "outline"} onClick={() => setTab("imported")}>
            Holdings
          </Button>
        </div>

        <PromotionChip meta={paper.data?.meta} />

        {tab === "clips" && (
          <div className="overflow-x-auto rounded-[24px] border border-border bg-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="font-medium">Side</th>
                  <th className="font-medium">Qty</th>
                  <th className="font-medium">P&L</th>
                  <th className="font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const px = ticks[p.symbol] ?? p.entryPrice;
                  const dir = p.side === "short" ? -1 : 1;
                  const pnl = (px - p.entryPrice) * p.qty * dir;
                  return (
                    <tr key={p.symbol + p.entryTs} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{p.symbol}</td>
                      <td>{p.side}</td>
                      <td>{p.qty}</td>
                      <td className={pnl >= 0 ? "text-up" : "text-down"}>{inr(pnl)}</td>
                      <td className="flex flex-wrap gap-1 py-2 pr-3">
                        <Button size="sm" variant="outline" onClick={() => void paperSend({ type: "flatten", symbol: p.symbol })}>
                          Flatten
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void paperSend({ type: "reverse", symbol: p.symbol })}>
                          Reverse
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void paperSend({ type: "skip", symbol: p.symbol })}>
                          Skip
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {positions.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-sm text-muted" colSpan={5}>
                      No open clips. Realised {inr(dailyPnl)}. Time stop {FARM_PROFILE.TIME_STOP_SEC}s farm.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "imported" && (
          <>
        <div className="grid gap-4 md:grid-cols-3">
          <Kpi label="Invested" value={inr(invested)} />
          <Kpi label="Mark" value={inr(value)} />
          <Kpi label="Unrealised" value={inr(value - invested)} up={value - invested >= 0} />
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Import</h2>
          <p className="mt-1 text-sm text-muted">
            Headers such as Instrument, Qty., Avg. cost, LTP. Or paste below. Sample is preloaded as Core — Zerodha.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex h-11 cursor-pointer items-center rounded-[8px] border border-border px-4 text-sm">
              Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void f.text().then(applyText);
                }}
              />
            </label>
            <Button
              variant="outline"
              onClick={() =>
                applyText(`Instrument,Qty.,Avg. cost,LTP
POLYCAB,8,5400,6684
KEI,10,3600,4128
SIEMENS,4,3400,3288
HAVELLS,15,1800,1924
NTPC,40,380,412`)
              }
            >
              Load AI-supply sample
            </Button>
          </div>
          <textarea
            className="mt-3 min-h-24 w-full rounded-[12px] border border-border bg-elevated px-3 py-2 font-mono text-xs text-fg"
            placeholder="Paste CSV…"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <Button className="mt-3" variant="outline" onClick={() => applyText(raw)}>
            Parse paste
          </Button>
        </div>

        <div className="overflow-x-auto rounded-[24px] border border-border bg-surface">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Symbol</th>
                <th className="font-medium">Qty</th>
                <th className="font-medium">Avg</th>
                <th className="font-medium">LTP</th>
                <th className="font-medium">P&L</th>
                <th className="font-medium">Score</th>
                <th className="font-medium">Meta</th>
                <th className="font-medium">Predict</th>
                <th className="font-medium">Action</th>
                <th className="font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.symbol + r.avgCost} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs">{r.symbol}</div>
                    <div className="text-[11px] text-subtle">{r.companyName}</div>
                  </td>
                  <td>{r.qty}</td>
                  <td className="font-mono text-xs">{r.avgCost.toFixed(1)}</td>
                  <td className="font-mono text-xs">{r.lastPrice.toFixed(1)}</td>
                  <td className={r.pnl >= 0 ? "text-up" : "text-down"}>
                    {inr(r.pnl)}
                    <div className="text-[11px]">{pct(r.pnlPct)}</div>
                  </td>
                  <td className="font-mono">{r.score?.toFixed(2) ?? "—"}</td>
                  <td className="font-mono text-xs">
                    {promoted ? `${(r.metaProb * 100).toFixed(0)}%` : "n/a — not promoted"}
                  </td>
                  <td>
                    <div>{promoted ? r.predictability : "—"}</div>
                    <div className="text-[11px] text-subtle">{promoted ? r.strength : "five-factor only"}</div>
                  </td>
                  <td>
                    <Badge tone={promoted ? toneFor(r.action) : "neutral"}>{promoted ? r.action : `Factor ${r.action}`}</Badge>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1 py-2 pr-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!paperBlockedReason(r.symbol)}
                        onClick={() => void paperSend({ type: "open", symbol: r.symbol, side: "long", sleeve: "farm" })}
                      >
                        Paper clip
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void runDeskOp({ type: "block", symbol: r.symbol })}>
                        Block
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-subtle">
          {promoted
            ? (reviews[0]?.note ?? "Not an order.")
            : "Five-factor likes some names. The paper model is not promoted — do not add size on meta. Not an order."}
        </p>
          </>
        )}
      </div>
    </DeskShell>
  );
}

function Kpi({ label, value, up }: { label: string; value: string; up?: boolean }) {
  return (
    <div className="rounded-[24px] border border-border bg-surface p-5">
      <p className="text-[11px] uppercase tracking-wider text-subtle">{label}</p>
      <p className={`mt-2 font-mono text-2xl tabular-nums ${up === undefined ? "" : up ? "text-up" : "text-down"}`}>
        {value}
      </p>
    </div>
  );
}
