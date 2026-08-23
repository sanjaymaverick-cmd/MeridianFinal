import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, BookOpen, Compass, LayoutDashboard, LineChart, Sigma } from "lucide-react";
import { toast } from "sonner";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/confirm";
import { useDesk, type DeskMode } from "@/lib/desk-store";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/utils";
import { PAPER_BUDGET } from "@/lib/meridian/decision";
import { AutoEngine, setDeskKilled, setDeskMode, flattenDeskPaper } from "@/components/auto-engine";
import { QuotesHydrator } from "@/components/quotes-hydrator";
import { MODE_LABEL } from "@/lib/ux-copy";
import { formatIstStamp } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Command", icon: LayoutDashboard },
  { to: "/markets", label: "Tape", icon: LineChart },
  { to: "/portfolio", label: "Book", icon: BookOpen },
  { to: "/auto", label: "Auto", icon: Activity },
  { to: "/greeks", label: "Greeks", icon: Sigma },
  { to: "/research", label: "Research", icon: Compass },
] as const;

const MODES: DeskMode[] = ["advisory", "paper", "auto"];

export function DeskShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const mode = useDesk((s) => s.mode);
  const killed = useDesk((s) => s.killed);
  const pausedAt = useDesk((s) => s.pausedAt);
  const [askFlatten, setAskFlatten] = useState(false);
  const guest = !isPending && !user;
  const operator = Boolean(user);
  const engineOn = !killed;
  const modeLabel = MODE_LABEL[mode];

  function guard(fn: () => void) {
    if (!operator) {
      toast.message("Guest view only. Sign in to Pause, Flatten, or change mode.");
      return;
    }
    fn();
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <QuotesHydrator />
      <AutoEngine />
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-4 py-3 md:px-6">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-display text-xl tracking-tight">Meridian</span>
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted">Final</span>
          </Link>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
            MOCK {inr(PAPER_BUDGET)} · {modeLabel} · ENGINE {engineOn ? "ON" : "PAUSED"} · KITE DISARMED
          </p>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => {
              const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "rounded-[8px] px-3 py-2 text-sm transition-colors duration-150",
                    active ? "bg-elevated text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {guest && (
              <Badge tone="warn">Guest · view only · engine {engineOn ? "on" : "paused"}</Badge>
            )}
            <div className="flex flex-wrap gap-1" role="group" aria-label="Desk mode">
              {MODES.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={mode === m ? "default" : "outline"}
                  disabled={!operator}
                  onClick={() => guard(() => void setDeskMode(m))}
                >
                  {MODE_LABEL[m]}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled
                title="Live Kite stays disarmed"
                onClick={() => toast.message("Live Kite stays disarmed. Paper only.")}
              >
                Live (locked)
              </Button>
            </div>
            <Button
              size="sm"
              variant={killed ? "default" : "outline"}
              disabled={!operator}
              onClick={() =>
                guard(() => {
                  if (killed) {
                    void setDeskKilled(false);
                    if (mode === "advisory") void setDeskMode("paper");
                  } else {
                    void setDeskKilled(true);
                  }
                })
              }
            >
              {killed ? (mode === "advisory" ? "Start paper" : "Resume paper") : "Pause"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={!operator}
              onClick={() => guard(() => setAskFlatten(true))}
            >
              Flatten
            </Button>
            {killed && pausedAt ? (
              <span className="text-[10px] text-subtle">Paused {formatIstStamp(pausedAt)}</span>
            ) : null}
            {isPending ? (
              <div className="size-8 animate-pulse rounded-full bg-elevated" />
            ) : user ? (
              <UserButton />
            ) : (
              <Link
                to="/login"
                className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 md:px-6 md:pb-10">{children}</main>
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
                active ? "text-fg" : "text-muted",
              )}
            >
              <Icon className="size-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      {askFlatten && (
        <Confirm
          title="Flatten the paper book?"
          body="Closes every open paper clip at the last print. Does not change mode. Does not arm anything. Kite stays disarmed. Pause is separate and will not flatten."
          action="Flatten paper book"
          danger
          onCancel={() => setAskFlatten(false)}
          onOk={() => {
            setAskFlatten(false);
            void flattenDeskPaper();
          }}
        />
      )}
    </div>
  );
}
