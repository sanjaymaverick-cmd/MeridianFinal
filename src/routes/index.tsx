import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DeskShell } from "@/components/desk-shell";
import { Badge } from "@/components/ui/badge";
import { getMarket } from "@/lib/server/desk";
import { useDesk } from "@/lib/desk-store";
import { inr, pct, formatPx, formatIst } from "@/lib/utils";
import { reviewHolding } from "@/lib/meridian/portfolio";
import { PAPER_BUDGET } from "@/lib/meridian/decision";
import type { MarketState } from "@/lib/meridian/advice";

export const Route = createFileRoute("/")({ component: Command });

function Command() {
  const q = useQuery({ queryKey: ["market"], queryFn: () => getMarket(), refetchInterval: 12_000 });
  const holdings = useDesk((s) => s.holdings);
  const positions = useDesk((s) => s.positions);
  const dailyPnl = useDesk((s) => s.dailyPnl);
  const ticks = useDesk((s) => s.ticks);
  const fills = useDesk((s) => s.fills);
  const regime = (q.data?.state.regime ?? "Calm") as MarketState["regime"];
  const reviews = holdings.map((h) => reviewHolding({ ...h, lastPrice: ticks[h.symbol] ?? h.lastPrice }, regime));
  const bookValue = reviews.reduce((a, r) => a + r.value, 0);
  const bookPnl = reviews.reduce((a, r) => a + r.pnl, 0);
  const nifty = q.data?.state.nifty ?? ticks.NIFTY ?? 24252;
  const asOf = q.data?.asOf;

  return (
    <DeskShell>
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Command</p>
            <h1 className="mt-1 font-display text-4xl leading-none md:text-5xl">Multi-asset desk</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Live Binance USDT + Yahoo NSE/FX/COMEX. Futures/options on Tape are derived. Auto paper. Not an order.
              Live Kite stays disarmed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={q.data?.state.session === "open" ? "up" : "neutral"}>
              {q.data?.state.session ?? "…"} session
            </Badge>
            <Badge tone={regime === "Stress" ? "down" : regime === "Elevated" ? "warn" : "up"}>
              {regime}
            </Badge>
            {asOf && (
              <Badge tone="neutral">
                {formatIst(asOf)} IST · {q.data?.ok ?? 0} live
              </Badge>
            )}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Nifty" value={nifty.toFixed(1)} sub={pct(q.data?.state.niftyChg ?? 0)} up={(q.data?.state.niftyChg ?? 0) >= 0} />
          <Stat label="Bank Nifty" value={(q.data?.state.bankNifty ?? ticks.BANKNIFTY ?? 57762).toFixed(0)} sub={pct(q.data?.state.bankChg ?? 0)} up={(q.data?.state.bankChg ?? 0) >= 0} />
          <Stat label="India VIX" value={(q.data?.state.indiaVix ?? 11.2).toFixed(1)} sub="vol regime" />
          <Stat label="Paper P&L" value={inr(dailyPnl)} sub={`${positions.length} open · ${inr(PAPER_BUDGET)} budget`} up={dailyPnl >= 0} />
          <Stat
            label="Bitcoin"
            value={formatPx(q.data?.state.btc ?? ticks.BTC ?? 77205, "USD")}
            sub={pct(q.data?.state.btcChg ?? 0)}
            up={(q.data?.state.btcChg ?? 0) >= 0}
          />
          <Stat
            label="Gold MCX est."
            value={formatPx(q.data?.state.gold ?? ticks.GOLD ?? 158360)}
            sub={pct(q.data?.state.goldChg ?? 0)}
            up={(q.data?.state.goldChg ?? 0) >= 0}
          />
          <Stat
            label="USD / INR"
            value={formatPx(q.data?.state.usdinr ?? ticks.USDINR ?? 95.685, "FX")}
            sub={pct(q.data?.state.usdinrChg ?? 0)}
            up={(q.data?.state.usdinrChg ?? 0) >= 0}
          />
          <Stat
            label="Crude MCX est."
            value={formatPx(q.data?.state.crude ?? ticks.CRUDE ?? 8311)}
            sub={pct(q.data?.state.crudeChg ?? 0)}
            up={(q.data?.state.crudeChg ?? 0) >= 0}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-5">
          <div className="rounded-[24px] border border-border bg-surface p-5 lg:col-span-3">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium">Market advice</h2>
              <span className="text-[11px] text-subtle">Spot · Futures · Options · Crypto · FX · Commodity</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(q.data?.advice ?? []).map((c) => (
                <article key={c.id} className="rounded-[16px] border border-border bg-elevated p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="neutral">{c.sleeve}</Badge>
                    <span className="text-[11px] uppercase tracking-wider text-muted">{c.stance}</span>
                  </div>
                  <h3 className="mt-3 text-sm font-medium">{c.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{c.body}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="rounded-[24px] border border-border bg-surface p-5 lg:col-span-2">
            <h2 className="mb-4 text-sm font-medium">Imported book</h2>
            <p className="font-mono text-2xl tabular-nums">{inr(bookValue)}</p>
            <p className={`mt-1 text-sm ${bookPnl >= 0 ? "text-up" : "text-down"}`}>{inr(bookPnl)} vs cost</p>
            <ul className="mt-4 space-y-2">
              {reviews.slice(0, 6).map((r) => (
                <li key={r.symbol} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{r.symbol}</span>
                  <span className="text-muted">{r.action}</span>
                  <span className={r.pnl >= 0 ? "text-up" : "text-down"}>{inr(r.pnl)}</span>
                </li>
              ))}
            </ul>
            <Link to="/portfolio" className="mt-4 inline-block text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
              Open full book
            </Link>
          </div>
        </section>

        <section className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium">Latest paper fills</h2>
          {fills.length === 0 ? (
            <p className="text-sm text-muted">No fills yet. Switch mode to Auto on the Auto page to let the engine work the watchlist.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-subtle">
                  <tr>
                    <th className="py-2 font-medium">Time</th>
                    <th className="font-medium">Symbol</th>
                    <th className="font-medium">Side</th>
                    <th className="font-medium">Qty</th>
                    <th className="font-medium">Price</th>
                    <th className="font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {fills.slice(0, 8).map((f) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="py-2 font-mono text-xs text-muted">
                        {new Date(f.ts).toLocaleTimeString("en-IN")}
                      </td>
                      <td className="font-mono text-xs">{f.symbol}</td>
                      <td className={f.side === "BUY" ? "text-up" : "text-down"}>{f.side}</td>
                      <td>{f.qty}</td>
                      <td className="font-mono">{f.price.toFixed(2)}</td>
                      <td className="text-muted">{f.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DeskShell>
  );
}

function Stat({
  label,
  value,
  sub,
  up,
}: {
  label: string;
  value: string;
  sub: string;
  up?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-border bg-surface p-5">
      <p className="text-[11px] uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-2 font-mono text-2xl tabular-nums">{value}</p>
      <p className={`mt-1 text-xs ${up === undefined ? "text-muted" : up ? "text-up" : "text-down"}`}>{sub}</p>
    </div>
  );
}
