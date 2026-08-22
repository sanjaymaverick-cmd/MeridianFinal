import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { DeskShell } from "@/components/desk-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { runResearch, type ResearchName } from "@/lib/server/desk";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { UNIVERSE } from "@/lib/meridian/universe";
import { compositeScore, mapAction } from "@/lib/meridian/scoring";
import { factorParts } from "@/lib/meridian/universe";

export const Route = createFileRoute("/research")({ component: ResearchPage });

const EXAMPLES = [
  "Find me the best companies that supply spares and components to AI data centers",
  "Crypto names I can paper on Delta — BTC and ETH only if the tape is clean",
  "Gold, silver, copper — which commodity sleeve fits a Stress regime",
  "USDINR and G10 dollar pairs as a rupee hedge",
];

function ResearchPage() {
  const { user, isPending } = useCurrentUserState();
  const [query, setQuery] = useState(EXAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<ResearchName[] | null>(null);
  const [source, setSource] = useState<string>("");

  if (isPending) {
    return (
      <DeskShell>
        <div className="h-40 animate-pulse rounded-[24px] bg-surface" />
      </DeskShell>
    );
  }

  async function run() {
    setBusy(true);
    try {
      if (!user) {
        const q = query.toLowerCase();
        const ranked = UNIVERSE.filter(
          (u) =>
            u.themes.some((t) => q.includes(t.replace(/-/g, " "))) ||
            q.includes("data") ||
            q.includes("ai") ||
            q.includes("bank") ||
            q.includes("power") ||
            q.includes("crypto") ||
            q.includes("bitcoin") ||
            q.includes("gold") ||
            q.includes("forex") ||
            q.includes("dollar") ||
            q.includes("crude") ||
            q.includes("copper"),
        )
          .slice(0, 6)
          .map((u) => ({
            symbol: u.symbol,
            name: u.name,
            sector: u.sector,
            score: u.quality,
            why: u.thesis,
            risk: "Guest shortlist from the in-desk universe. Sign in for Grok research. Not an order.",
            sleeve: "Spot",
          }));
        setNames(ranked.length ? ranked : UNIVERSE.slice(0, 6).map((u) => ({
          symbol: u.symbol,
          name: u.name,
          sector: u.sector,
          score: u.quality,
          why: u.thesis,
          risk: "Not an order.",
          sleeve: "Spot",
        })));
        setSource("desk");
        return;
      }
      const res = await runResearch({ data: { query } });
      setNames(res.names);
      setSource(res.source);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Research failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DeskShell>
      {!user ? null : <span className="sr-only">signed in</span>}
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Research</p>
          <h1 className="mt-1 font-display text-4xl">Ask the desk</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Natural-language query over the NSE universe Meridian actually models. Signed-in sessions call Grok.
            Guests get the same ranked shortlist from the local book. Always a review.
          </p>
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <Textarea value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="rounded-full border border-border px-3 py-1.5 text-left text-xs text-muted hover:text-fg"
                onClick={() => setQuery(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
          <Button className="mt-4" disabled={busy || query.trim().length < 8} onClick={() => void run()}>
            {busy ? "Scanning…" : "Run research"}
          </Button>
        </div>

        {names && (
          <div className="grid gap-3 md:grid-cols-2">
            {names.map((n) => {
              const u = UNIVERSE.find((x) => x.symbol === n.symbol);
              const action = u ? mapAction(compositeScore(factorParts(u), "Calm"), "Calm") : "—";
              return (
                <article key={n.symbol} className="rounded-[24px] border border-border bg-surface p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs text-muted">{n.symbol}</p>
                      <h2 className="text-lg font-medium">{n.name}</h2>
                    </div>
                    <Badge tone="neutral">{n.sleeve}</Badge>
                  </div>
                  <p className="mt-1 text-xs uppercase tracking-wider text-subtle">{n.sector}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{n.why}</p>
                  <p className="mt-2 text-sm text-subtle">{n.risk}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <Badge tone="accent">score {n.score.toFixed(1)}</Badge>
                    <Badge tone={action === "Buy" || action === "Strong Buy" ? "up" : "neutral"}>{action}</Badge>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {source && <p className="text-xs text-subtle">Source: {source}. Not an order.</p>}
        {!user && (
          <p className="text-xs text-subtle">Sign in to persist runs and route the query through Grok.</p>
        )}
      </div>
    </DeskShell>
  );
}
