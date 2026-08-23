import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DeskShell } from "@/components/desk-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runDeskOp } from "@/components/auto-engine";
import { toast } from "sonner";
import { DEMO_NIFTY_LEGS, explainScalp, snapshotFromLegs, type OptionLeg } from "@/lib/meridian/greeks";
import { useDesk } from "@/lib/desk-store";
import { inr } from "@/lib/utils";

export const Route = createFileRoute("/greeks")({ component: GreeksPage });

function GreeksPage() {
  const nifty = useDesk((s) => s.ticks.NIFTY ?? 24252);
  const [movePct, setMovePct] = useState(1);
  const [band, setBand] = useState(1);
  const [shortGamma, setShortGamma] = useState(false);

  const legs: OptionLeg[] = useMemo(() => {
    const mark = nifty;
    if (!shortGamma) return DEMO_NIFTY_LEGS.map((l) => ({ ...l, markInr: mark }));
    return [
      {
        id: "short-straddle",
        symbol: "NIFTY",
        label: "Short ATM straddle",
        lots: -2,
        multiplier: 65,
        markInr: mark,
        delta: 0.04,
        gamma: 0.00084,
        vegaPerLot: 18,
        thetaPerLot: -40,
      },
    ];
  }, [nifty, shortGamma]);

  const snap = snapshotFromLegs("NIFTY", legs, movePct / 100);
  const report = explainScalp(snap, { rehedgeBandLots: band, startHedged: true });

  return (
    <DeskShell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Greeks</p>
          <h1 className="mt-1 font-display text-4xl">Gamma scalping</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Demo book — not your live paper clips. Daily PnL is one-day theta. Gamma Scalping PnL is the textbook ½ Γ
            (ΔS)² term. Long gamma can help if you keep leftover delta small. Short gamma does the opposite. Reviews
            only — not an order.
          </p>
          <p className="mt-2 text-xs text-warn">Teaching surface on a Nifty demo straddle. Queue hedge sends a paper clip, not Kite.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <ButtonLike active={!shortGamma} onClick={() => setShortGamma(false)}>
            Long gamma straddle
          </ButtonLike>
          <ButtonLike active={shortGamma} onClick={() => setShortGamma(true)}>
            Short gamma
          </ButtonLike>
          <Badge tone={report.helps ? "up" : report.hurts ? "down" : "neutral"}>{report.posture} gamma</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Nifty mark" value={nifty.toFixed(1)} />
          <Metric label="Delta lots" value={snap.deltaLots.toFixed(2)} />
          <Metric label="Gamma" value={snap.gamma.toFixed(5)} />
          <Metric label="Theta / day" value={inr(snap.theta)} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[24px] border border-border bg-surface p-5">
            <label className="text-sm font-medium">
              Assumed move {movePct.toFixed(1)}%
            </label>
            <input
              type="range"
              min={0.3}
              max={3}
              step={0.1}
              value={movePct}
              onChange={(e) => setMovePct(Number(e.target.value))}
              className="mt-3 w-full accent-accent"
            />
            <label className="mt-5 block text-sm font-medium">Rehedge band {band.toFixed(1)} lots</label>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.5}
              value={band}
              onChange={(e) => setBand(Number(e.target.value))}
              className="mt-3 w-full accent-accent"
            />
            <p className="mt-4 text-sm text-muted">{report.dailyPnlLine}</p>
            <p className="mt-2 text-sm text-muted">{report.gammaScalpLine}</p>
            <p className="mt-3 text-sm">{report.suggestion}</p>
            {report.needsRehedge && (
              <div className="mt-3 flex flex-wrap gap-2">
                <p className="w-full text-sm text-warn">
                  Suggested futures clip: {report.suggestedFuturesLots >= 0 ? "+" : ""}
                  {report.suggestedFuturesLots.toFixed(1)} lots (review only).
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    void runDeskOp({
                      type: "hedge",
                      side: report.suggestedFuturesLots >= 0 ? "long" : "short",
                      qty: Math.max(1, Math.abs(report.suggestedFuturesLots)),
                    });
                    toast.message("Queued a paper hedge. Kite stays off.");
                  }}
                >
                  Queue paper hedge
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toast.message("Dismissed. No clip sent.")}>
                  Dismiss
                </Button>
              </div>
            )}
          </div>
          <div className="rounded-[24px] border border-border bg-surface p-5">
            <h2 className="text-sm font-medium">Rehedge path</h2>
            <ol className="mt-4 space-y-4">
              {report.steps.map((st) => (
                <li key={st.label} className="rounded-[16px] border border-border bg-elevated p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{st.label}</span>
                    <span className="font-mono text-xs text-muted">{st.price.toFixed(1)}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{st.note}</p>
                  <p className="mt-2 font-mono text-xs text-subtle">
                    Δ {st.deltaLots.toFixed(2)} · hedge {st.hedgeLots.toFixed(1)} · locked {inr(st.lockedPnl)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <ul className="space-y-1 text-sm text-muted">
          {report.statusLines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </DeskShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-border bg-surface p-5">
      <p className="text-[11px] uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-2 font-mono text-2xl tabular-nums">{value}</p>
    </div>
  );
}

function ButtonLike({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "h-11 rounded-[8px] bg-accent px-4 text-sm font-medium text-accent-fg"
          : "h-11 rounded-[8px] border border-border px-4 text-sm text-fg"
      }
    >
      {children}
    </button>
  );
}
