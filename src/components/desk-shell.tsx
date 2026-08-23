import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, BookOpen, Compass, LayoutDashboard, LineChart, Sigma } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/desk-store";
import { cn, inr, formatPx } from "@/lib/utils";
import { AutoEngine, setDeskKilled } from "@/components/auto-engine";
import { QuotesHydrator } from "@/components/quotes-hydrator";
import { MODE_CHIPS } from "@/lib/meridian/operator-copy";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { nseCashClosed } from "@/lib/meridian/session-lock";
import { HeatRing } from "@/components/heat-ring";
import { paperSend, focusedOrFirstOpen } from "@/lib/desk-ops";
import { PromotionChip } from "@/components/promotion-strip";
import { useQuery } from "@tanstack/react-query";
import { getPaperBook } from "@/lib/server/desk";

const NAV = [
  { to: "/", label: "Command", icon: LayoutDashboard, key: "1" },
  { to: "/markets", label: "Tape", icon: LineChart, key: "2" },
  { to: "/portfolio", label: "Book", icon: BookOpen, key: "3" },
  { to: "/auto", label: "Auto", icon: Activity, key: "4" },
  { to: "/greeks", label: "Greeks", icon: Sigma, key: "5" },
  { to: "/research", label: "Research", icon: Compass, key: "6" },
] as const;

export function DeskShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const mode = useDesk((s) => s.mode);
  const killed = useDesk((s) => s.killed);
  const positions = useDesk((s) => s.positions);
  const ticks = useDesk((s) => s.ticks);
  const dailyPnl = useDesk((s) => s.dailyPnl);
  const heatFarm = useDesk((s) => s.heatFarm);
  const heatPnl = useDesk((s) => s.heatPnl);
  const [haltAsk, setHaltAsk] = useState(false);
  const [help, setHelp] = useState(false);
  const guest = !isPending && !user;
  const canDrive = !guest;
  const closed = nseCashClosed();
  const paper = useQuery({ queryKey: ["paper"], queryFn: () => getPaperBook(), refetchInterval: 2500 });
  const mtm = positions.reduce((a, p) => {
    const px = ticks[p.symbol] ?? p.entryPrice;
    const dir = p.side === "short" ? -1 : 1;
    return a + (px - p.entryPrice) * p.qty * dir;
  }, 0);
  const heat = (paper.data?.heatFarm ?? heatFarm) + (paper.data?.heatPnl ?? heatPnl);
  const deskState = killed ? "killed" : guest ? "guest" : mode;

  function onHalt() {
    if (!canDrive) {
      toast.message("Sign in to halt the shared book.");
      return;
    }
    if (!killed) {
      setHaltAsk(true);
      return;
    }
    void setDeskKilled(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "Escape") {
        setHaltAsk(false);
        setHelp(false);
        return;
      }
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setHelp((v) => !v);
        return;
      }
      if (typing) return;
      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        onHalt();
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        const sym = focusedOrFirstOpen();
        if (sym) void paperSend({ type: "flatten", symbol: sym });
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        const sym = focusedOrFirstOpen();
        if (sym) void paperSend({ type: "reverse", symbol: sym });
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        const sym = focusedOrFirstOpen();
        if (sym) void paperSend({ type: "skip", symbol: sym });
      }
      if (e.key === "/") {
        e.preventDefault();
        void navigate({ to: "/markets", search: {} });
      }
      const nav = NAV.find((n) => n.key === e.key);
      if (nav) {
        e.preventDefault();
        void navigate({ to: nav.to });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canDrive, killed, guest, navigate]);

  const btc = ticks.BTC ?? 0;
  const eth = ticks.ETH ?? 0;
  const nifty = ticks.NIFTY ?? 0;
  const vix = ticks.INDIAVIX ?? 0;
  const gold = ticks.GOLD ?? 0;
  const usd = ticks.USDINR ?? 0;
  const tape = [
    `NIFTY ${nifty.toFixed(0)}${closed ? " STALE" : ""}`,
    `VIX ${vix.toFixed(1)}`,
    `BTC ${formatPx(btc, "USD")}`,
    `ETH ${formatPx(eth, "USD")}`,
    `GOLD ${formatPx(gold)}`,
    `USDINR ${formatPx(usd, "FX")}`,
  ];

  return (
    <div className="min-h-dvh bg-bg text-fg" data-desk={deskState}>
      <QuotesHydrator />
      <AutoEngine />
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 overflow-x-hidden px-4 py-2 md:px-6">
          <Link to="/" className="flex shrink-0 items-baseline gap-2">
            <span className="font-display text-xl tracking-tight">Meridian</span>
            <span className="hidden text-[11px] uppercase tracking-[0.22em] text-muted sm:inline">Final</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((n) => {
              const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "rounded-[8px] px-3 py-2 text-sm transition-colors duration-100",
                    n.label === "Auto" && "nav-auto",
                    active ? "bg-elevated text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone={killed ? "down" : mode === "auto" || mode === "paper" ? "warn" : "neutral"}>
              {killed ? "Halted" : (MODE_CHIPS.find((m) => m.id === mode)?.label ?? mode)}
            </Badge>
            <Button
              size="sm"
              variant={killed ? "outline" : "danger"}
              disabled={guest}
              className="min-h-11 min-w-[5.5rem] active:scale-100"
              title={guest ? "Sign in to halt" : killed ? "Resume paper" : "Halt (H)"}
              onClick={onHalt}
            >
              {killed ? "Resume paper" : "Halt"}
            </Button>
            {isPending ? (
              <div className="size-8 animate-pulse rounded-full bg-elevated" />
            ) : user ? (
              <UserButton />
            ) : (
              <Link to="/login" className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
                Sign in
              </Link>
            )}
          </div>
        </div>
        <div className="overflow-hidden border-t border-border bg-bg">
          <div className="desk-ticker gap-8 px-4 py-1 font-mono text-[11px] text-muted">
            {[...tape, ...tape].map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
        {closed && (
          <div className="border-t border-warn/50 bg-warn/10 px-4 py-2 text-center text-xs font-medium text-warn md:px-6">
            NSE CASH CLOSED · CRYPTO ONLY · cash / F&O paper disabled until next 09:15 IST
          </div>
        )}
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 border-t border-border px-4 py-2 text-xs md:px-6">
          <span className={dailyPnl >= 0 ? "text-up" : "text-down"}>P&L {inr(dailyPnl)}</span>
          <span className={mtm >= 0 ? "text-up" : "text-down"}>MTM {inr(mtm)}</span>
          <span className="flex items-center gap-1">
            <HeatRing heat={heat} cap={0.9} />
            HEAT {(heat * 100).toFixed(0)}%
          </span>
          <span>{positions.length} clips</span>
          {closed && <span className="text-warn">NSE CLOSED</span>}
          <Button size="sm" variant="ghost" disabled={guest || positions.length === 0} onClick={() => void paperSend({ type: "flatten_all" })}>
            Flatten all
          </Button>
          <div className="hidden min-w-[220px] flex-1 md:block">
            <PromotionChip meta={paper.data?.meta} />
          </div>
        </div>
        {haltAsk && (
          <div className="border-t border-border bg-elevated px-4 py-3 md:px-6">
            <p className="text-sm">Halt the paper engine? Open clips stay. Stops pause. This is not live Kite.</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setHaltAsk(false);
                  void setDeskKilled(true);
                }}
              >
                Halt paper
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setHaltAsk(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {help && (
          <div className="border-t border-border bg-elevated px-4 py-3 font-mono text-xs md:px-6">
            <p className="font-sans text-sm">Keys — H halt · F flatten · R reverse · S skip 15m · / tape · 1–6 nav · Esc close · ? this</p>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 md:px-6 md:pb-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-border bg-bg/95 md:hidden">
        {NAV.map((n) => {
          const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-wider",
                n.label === "Auto" && "nav-auto",
                active ? "text-fg" : "text-muted",
              )}
            >
              <Icon className="size-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
