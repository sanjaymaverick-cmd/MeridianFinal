import { useQuery } from "@tanstack/react-query";
import { getPredOrb } from "@/lib/server/desk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { paperSend } from "@/lib/desk-ops";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useDesk } from "@/lib/desk-store";
import { PRED_COPY, PRED_NO, PRED_YES } from "@/lib/meridian/pred-orb";
import { toast } from "sonner";

function timeLeft(endSec: number) {
  const s = Math.max(0, Math.floor(endSec - Date.now() / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function px(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(3);
}

export function PaperOrb({ compact = false }: { compact?: boolean }) {
  const { user, isPending } = useCurrentUserState();
  const guest = !isPending && !user;
  const killed = useDesk((s) => s.killed);
  const positions = useDesk((s) => s.positions);
  const q = useQuery({ queryKey: ["pred-orb"], queryFn: () => getPredOrb(), refetchInterval: 4_000 });
  const d = q.data;
  const health = d?.quoteHealth ?? "unavailable";
  const hasPx = d?.yes != null && d?.no != null;
  const expired = !!d?.windowEnd && Date.now() / 1000 >= d.windowEnd;
  const loading = q.isPending && !d;
  const predOpen = positions.some((p) => p.sleeve === "pred" || p.symbol === PRED_YES || p.symbol === PRED_NO);
  const sendOk = hasPx && health !== "unavailable" && !expired;
  const locked = guest || killed || !sendOk || loading || predOpen;
  const would = d?.would ?? "FLAT";
  const sum = hasPx ? (d!.yes! + d!.no!).toFixed(3) : "—";

  async function send(side: "yes" | "no") {
    if (guest) {
      toast.message("Sign in to paper the orb.");
      return;
    }
    if (!sendOk) {
      toast.message("quote unavailable");
      return;
    }
    await paperSend({
      type: "open",
      symbol: side === "yes" ? PRED_YES : PRED_NO,
      side: "long",
      sleeve: "pred",
      feed: "polymarket",
    });
  }

  const quoteBadge = loading ? (
    <Badge tone="neutral">loading quote</Badge>
  ) : health === "ok" ? (
    <Badge tone="neutral">quoteHealth ok</Badge>
  ) : health === "bundle_gap" ? (
    <Badge tone="warn">bundle_gap</Badge>
  ) : health === "delayed" ? (
    <Badge tone="warn">delayed</Badge>
  ) : health === "stale" ? (
    <Badge tone="warn">stale</Badge>
  ) : (
    <Badge tone="warn">quote unavailable</Badge>
  );

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={would === "YES" ? "default" : "outline"} disabled={locked} onClick={() => void send("yes")}>
        Paper YES
      </Button>
      <Button size="sm" variant={would === "NO" ? "default" : "outline"} disabled={locked} onClick={() => void send("no")}>
        Paper NO
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={guest || !predOpen}
        onClick={() => {
          const yes = positions.find((p) => p.symbol === PRED_YES);
          const no = positions.find((p) => p.symbol === PRED_NO);
          if (yes) void paperSend({ type: "skip", symbol: PRED_YES });
          if (no) void paperSend({ type: "skip", symbol: PRED_NO });
        }}
      >
        Skip
      </Button>
    </div>
  );

  if (compact) {
    return (
      <section className="rounded-[16px] border border-border bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Orb</span>
          <span className="min-w-0 flex-1 truncate text-sm">{d?.question ?? "BTC 5m Up/Down"}</span>
          <span className="font-mono text-xs text-up">Y {px(d?.yes ?? null)}</span>
          <span className="font-mono text-xs text-down">N {px(d?.no ?? null)}</span>
          <span className="text-[11px] text-muted">Would {would}</span>
          {d?.windowEnd ? <span className="font-mono text-[11px] text-muted">{timeLeft(d.windowEnd)}s</span> : null}
          <span className="font-mono text-[11px] text-muted">sum {sum}</span>
          <Badge tone="neutral">paper · polymarket</Badge>
          {quoteBadge}
          {actions}
        </div>
        <p className="mt-1 text-[11px] text-subtle">{PRED_COPY}</p>
        {guest ? <p className="text-[11px] text-subtle">Sign in to send paper YES/NO. Guest cannot open the orb.</p> : null}
        {killed && !guest ? <p className="text-[11px] text-subtle">Pause: no new pred opens. Open windows still settle.</p> : null}
      </section>
    );
  }

  return (
    <section className="rounded-[24px] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Orb</p>
          <h2 className="mt-1 text-sm font-medium">{d?.question ?? "Bitcoin Up or Down — 5 minutes"}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">paper · polymarket</Badge>
          {quoteBadge}
          {d?.windowEnd ? <Badge tone="neutral">{timeLeft(d.windowEnd)} left</Badge> : null}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-subtle">{PRED_COPY}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[16px] border border-border bg-elevated p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">YES · Up</div>
          <div className="font-mono text-2xl tabular-nums text-up">{px(d?.yes ?? null)}</div>
        </div>
        <div className="rounded-[16px] border border-border bg-elevated p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">NO · Down</div>
          <div className="font-mono text-2xl tabular-nums text-down">{px(d?.no ?? null)}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          Would BUY <span className="font-medium text-fg">{would}</span>
        </span>
        {d?.volume != null ? <span>· vol {Math.round(d.volume).toLocaleString("en-IN")}</span> : null}
        <span>· sum {sum}</span>
        <span>· quoteHealth {health}</span>
      </div>
      <div className="mt-4">{actions}</div>
      {guest ? <p className="mt-2 text-[11px] text-subtle">Sign in to send paper YES/NO. Guest cannot open the orb.</p> : null}
      {killed && !guest ? <p className="mt-2 text-[11px] text-subtle">Pause: no new pred opens. Open windows still settle.</p> : null}
    </section>
  );
}
