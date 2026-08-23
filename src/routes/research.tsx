import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DeskShell } from "@/components/desk-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { listResearchHistory, runResearch, type ResearchName } from "@/lib/server/desk";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { rankResearch } from "@/lib/meridian/research-rank";
import { runDeskOp } from "@/components/auto-engine";
import { PromotionStrip } from "@/components/promotion-strip";
import { getPaperBook } from "@/lib/server/desk";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/research")({ component: ResearchPage });

const EXAMPLES = [
  "Find me the best companies that supply spares and components to AI data centers",
  "Crypto names I can paper on Delta — BTC and ETH only if the tape is clean",
  "Gold, silver, copper — which commodity sleeve fits a Stress regime",
  "USDINR and G10 dollar pairs as a rupee hedge",
];

type Run = { query: string; at: string; source: string; names: ResearchName[]; emptyNote?: string | null };

function ResearchPage() {
  const { user, isPending } = useCurrentUserState();
  const [query, setQuery] = useState(EXAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<ResearchName[] | null>(null);
  const [source, setSource] = useState<string>("");
  const [emptyNote, setEmptyNote] = useState<string | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const paper = useQuery({ queryKey: ["paper"], queryFn: () => getPaperBook(), refetchInterval: 8000 });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("meridian-research-history");
      if (raw) setHistory(JSON.parse(raw) as Run[]);
    } catch {
      /* ignore */
    }
    if (user) {
      void listResearchHistory()
        .then((rows) => {
          setHistory((prev) => {
            const mapped: Run[] = rows.map((r) => ({ query: r.query, at: r.at, source: "saved", names: r.names }));
            return [...mapped, ...prev].slice(0, 12);
          });
        })
        .catch(() => {});
    }
  }, [user]);

  if (isPending) {
    return (
      <DeskShell>
        <div className="h-40 animate-pulse rounded-[24px] bg-surface" />
      </DeskShell>
    );
  }

  function remember(run: Run) {
    setHistory((prev) => {
      const next = [run, ...prev].slice(0, 12);
      try {
        sessionStorage.setItem("meridian-research-history", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function run() {
    setBusy(true);
    setEmptyNote(null);
    try {
      if (!user) {
        const res = rankResearch(query);
        setNames(res.names);
        setSource("desk heuristic");
        setEmptyNote(res.emptyNote);
        remember({ query, at: new Date().toISOString(), source: "desk heuristic", names: res.names, emptyNote: res.emptyNote });
        return;
      }
      const res = await runResearch({ data: { query } });
      setNames(res.names);
      setSource(res.source === "grok" ? "Grok" : "desk heuristic");
      setEmptyNote("emptyNote" in res ? ((res as { emptyNote?: string | null }).emptyNote ?? null) : null);
      remember({ query, at: new Date().toISOString(), source: res.source, names: res.names });
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
            Ranked names from the universe Meridian actually models. Guests get a desk heuristic. Signed-in sessions try
            Grok, then fall back. Always a review — Watch or skip; never an order.
          </p>
        </div>

        <PromotionStrip meta={paper.data?.meta} />

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

        {emptyNote && <p className="text-sm text-warn">{emptyNote}</p>}

        {names && names.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {names.map((n) => (
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
                {n.next && <p className="mt-2 text-sm">{n.next}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge tone="accent">score {n.score.toFixed(1)}</Badge>
                  <Button size="sm" onClick={() => void runDeskOp({ type: "watch", symbol: n.symbol })}>
                    Watch in Auto
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/markets">Open on Tape</Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void runDeskOp({ type: "skip", symbol: n.symbol })}>
                    Skip
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
        {source && <p className="text-xs text-subtle">Source: {source}. Not an order.</p>}

        {history.length > 0 && (
          <div className="rounded-[24px] border border-border bg-surface p-5">
            <h2 className="text-sm font-medium">Run history</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {history.map((h, i) => (
                <li key={h.at + i} className="flex flex-wrap items-center gap-2">
                  <span className="text-subtle">{new Date(h.at).toLocaleString("en-IN")}</span>
                  <Badge tone="neutral">{h.source}</Badge>
                  <button
                    type="button"
                    className="text-left underline-offset-4 hover:underline"
                    onClick={() => {
                      setQuery(h.query);
                      setNames(h.names);
                      setSource(h.source);
                      setEmptyNote(h.emptyNote ?? null);
                    }}
                  >
                    {h.query}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DeskShell>
  );
}
