import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DeskShell } from "@/components/desk-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriceChart } from "@/components/price-chart";
import { getHistory, getMarket } from "@/lib/server/desk";
import { UNIVERSE, assetClassOf } from "@/lib/meridian/universe";
import { useDesk } from "@/lib/desk-store";
import { formatIst, formatPx, pct } from "@/lib/utils";

export const Route = createFileRoute("/markets")({ component: MarketsPage });

const FILTERS = ["all", "equity", "crypto", "forex", "commodity", "futures", "options"] as const;

function MarketsPage() {
  const m = useQuery({ queryKey: ["market"], queryFn: () => getMarket(), refetchInterval: 45_000 });
  const ticks = useDesk((s) => s.ticks);
  const asOf = useDesk((s) => s.asOf);
  const source = useDesk((s) => s.source);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("crypto");
  const [pick, setPick] = useState("BTC");
  const [range, setRange] = useState<"1mo" | "3mo" | "1y" | "5y">("1y");
  const [q, setQ] = useState("");

  const hist = useQuery({
    queryKey: ["history", pick, range],
    queryFn: () => getHistory({ data: { symbol: pick, range } }),
    staleTime: 60_000,
  });

  const bn = m.data?.binance ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toUpperCase();
    if (filter === "crypto") {
      return bn
        .filter((r) => !needle || r.symbol.includes(needle) || r.pair.includes(needle))
        .map((r) => ({
          symbol: r.symbol,
          name: r.pair,
          last: r.last,
          chg: r.chg,
          rsi: null as number | null,
          quote: "USD" as const,
          venue: "Binance",
        }));
    }
    const base = UNIVERSE.filter((u) => (filter === "all" ? true : assetClassOf(u) === filter))
      .filter((u) => !needle || u.symbol.includes(needle) || u.name.toUpperCase().includes(needle))
      .map((u) => {
        const qq = m.data?.quotes?.[u.symbol];
        const last = qq?.last || ticks[u.symbol] || u.last;
        const contract = qq?.contract || ([qq?.expiry, qq?.strike, qq?.right].filter(Boolean).join(" ") || u.name);
        return {
          symbol: u.symbol,
          name: contract,
          last,
          chg: qq?.chg ?? 0,
          rsi: qq?.rsi ?? u.rsi,
          quote: u.quote ?? "INR",
          venue: u.venue ?? "NSE",
          delayed: qq?.delayed,
          source: qq?.source,
        };
      });
    if (filter === "futures" || filter === "options" || filter === "all") {
      const seen = new Set(base.map((r) => r.symbol));
      for (const [sym, qq] of Object.entries(m.data?.quotes ?? {})) {
        if (seen.has(sym) || !(qq.last > 0)) continue;
        const isOpt = qq.right === "CE" || qq.right === "PE";
        const isFut = qq.right === "FUT" || /PERP$|FUT$/.test(sym);
        if (filter === "options" && !isOpt) continue;
        if (filter === "futures" && !isFut) continue;
        if (filter === "all" && !isOpt && !isFut) continue;
        if (needle && !sym.includes(needle) && !(qq.contract ?? "").toUpperCase().includes(needle)) continue;
        base.push({
          symbol: sym,
          name: qq.contract || ([qq.expiry, qq.strike, qq.right].filter(Boolean).join(" ") || sym),
          last: qq.last,
          chg: qq.chg ?? 0,
          rsi: qq.rsi ?? 50,
          quote: /BTC|ETH|SOL/.test(sym) ? "USD" : "INR",
          venue: (qq.source ?? "").startsWith("Binance") ? "Binance" : "NFO",
          delayed: qq.delayed,
          source: qq.source,
        });
        seen.add(sym);
      }
    }
    return base;
  }, [filter, m.data, ticks, q, bn]);

  const pickedU = UNIVERSE.find((u) => u.symbol === pick);
  const pickedBn = bn.find((r) => r.symbol === pick);
  const quote = pickedU?.quote ?? (pickedBn ? "USD" : "INR");
  const title = pickedU?.name ?? pickedBn?.pair ?? pick;
  const venue = pickedU?.venue ?? (pickedBn ? "Binance" : "NSE");
  const lastPx = pickedBn?.last ?? ticks[pick] ?? pickedU?.last ?? 0;

  return (
    <DeskShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Tape</p>
            <h1 className="mt-1 font-display text-4xl">Live book + history</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Crypto tab is Binance USDT spot. Futures tab includes USDT-M / COIN-M perps. Options show expiry and strike (live Binance or delayed NSE ATM model).
              Other tabs are NSE / FX / COMEX. Not a Kite LTP.
            </p>
          </div>
          <div className="text-right text-xs text-subtle">
            <div>
              {bn.length} Binance USDT · {m.data?.ok ?? 0} book live
            </div>
            <div>{asOf ? formatIst(asOf) : "…"} IST</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter symbol"
            className="h-9 rounded-[8px] border border-border bg-elevated px-3 text-sm"
          />
        </div>

        <section className="grid gap-6 lg:grid-cols-5">
          <div className="overflow-x-auto rounded-[24px] border border-border bg-surface lg:col-span-3">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="font-medium">Last</th>
                  <th className="font-medium">1D</th>
                  <th className="font-medium">RSI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.symbol}
                    className={`cursor-pointer border-t border-border ${pick === r.symbol ? "bg-elevated" : ""}`}
                    onClick={() => setPick(r.symbol)}
                  >
                    <td className="px-4 py-2">
                      <div className="font-mono text-xs">{r.symbol}</div>
                      <div className="text-[11px] text-subtle">{r.name}{"delayed" in r && r.delayed ? " · delayed" : ""}</div>
                    </td>
                    <td className="font-mono text-xs">{formatPx(r.last, r.quote)}</td>
                    <td className={r.chg >= 0 ? "text-up" : "text-down"}>{pct(r.chg)}</td>
                    <td className="font-mono text-xs text-muted">{r.rsi ? r.rsi.toFixed(0) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-[24px] border border-border bg-surface p-5 lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-muted">{pick}</p>
                <h2 className="mt-1 text-lg font-medium">{title}</h2>
                <p className="mt-1 font-mono text-2xl">{formatPx(lastPx, quote)}</p>
              </div>
              <Badge tone="neutral">{venue}</Badge>
            </div>
            <div className="mt-3 flex gap-2">
              {(["1mo", "3mo", "1y", "5y"] as const).map((r) => (
                <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <div className="mt-4">
              {hist.isFetching && !hist.data ? (
                <div className="h-56 animate-pulse rounded-[16px] bg-elevated" />
              ) : (
                <PriceChart bars={hist.data?.bars ?? []} quote={quote} />
              )}
            </div>
            <p className="mt-2 text-[11px] text-subtle">{hist.data?.source ?? source}. Not an order.</p>
          </div>
        </section>
      </div>
    </DeskShell>
  );
}

