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
import { rankResearch } from "@/lib/meridian/research-rank";
import { watchDeskSymbol, blockDeskSymbol } from "@/components/auto-engine";

export const Route = createFileRoute("/research")({ component: ResearchPage });

const EXAMPLES = [
  "Find me the best companies that supply spares and components to AI data centers",
  "Crypto names I can paper on Delta — BTC and ETH only if the tape is clean",
  "Gold, silver, copper — which commodity sleeve fits a Stress regime",
  "USDINR and G10 dollar pairs as a rupee hedge",
];

type Run = {
  query: string;
  names: ResearchName[];
  source: string;
  reason: string;
  at: number;
};

function ResearchPage() {
  const { user, isPending } = useCurrentUserState();
  const [query, setQuery] = useState(EXAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Run[]>([]);
  const latest = history[0];

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
        const ranked = rankResearch(query, UNIVERSE);
        setHistory((h) => [
          {
            query,
            names: ranked.names,
            source: "desk heuristic",
            reason: ranked.reason,
            at: Date.now(),
          },
          ...h,
        ].slice(0, 8));
        return;
      }
      const res = await runResearch({ data: { query } });
      setHistory((h) => [
        {
          query,
          names: res.names,
          source: res.source === "grok" ? "grok" : "desk heuristic",
          reason: res.reason ?? "Ranked from the desk universe.",
          at: Date.now(),
        },
        ...h,
      ].slice(0, 8));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Research failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DeskShell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Research</p>
          <h1 className="mt-1 font-display text-4xl">Ask the desk</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Natural-language query over the universe Meridian actually models. Mismatched questions return zero names — never a
            canned six-pack. Guests get a labelled heuristic. Signed-in sessions call Grok when a key is set.
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

        {latest && (
          <div>
            <p className="text-xs text-subtle">
              Source: {latest.source}. {latest.reason} Not an order.
            </p>
            {latest.names.length === 0 ? (
              <p className="mt-3 rounded-[24px] border border-border bg-surface p-5 text-sm text-muted">{latest.reason}</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {latest.names.map((n) => (
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
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Badge tone="accent">score {n.score.toFixed(1)}</Badge>
                      <Badge tone="neutral">{latest.source}</Badge>
                      <Button size="sm" variant="outline" disabled={!user} onClick={() => void watchDeskSymbol(n.symbol, true)}>
                        Watch
                      </Button>
                      <Button size="sm" variant="ghost" disabled={!user} onClick={() => void blockDeskSymbol(n.symbol, true)}>
                        Ignore
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-subtle">Next: Watch to surface on Auto, or Ignore to block the farm.</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {history.length > 1 && (
          <div>
            <h2 className="text-sm font-medium">Earlier runs</h2>
            <ol className="mt-3 space-y-2">
              {history.slice(1).map((r) => (
                <li key={r.at} className="rounded-[16px] border border-border bg-surface px-4 py-3 text-sm">
                  <p className="text-muted">{r.query}</p>
                  <p className="mt-1 text-xs text-subtle">
                    {r.source} · {r.names.length} names · {r.reason}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
        {!user && (
          <p className="text-xs text-subtle">Guest heuristic — not Grok. Sign in to persist runs.</p>
        )}
      </div>
    </DeskShell>
  );
}
