import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, BookOpen, Compass, LayoutDashboard, LineChart, Sigma } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/desk-store";
import { cn } from "@/lib/utils";
import { AutoEngine, setDeskKilled, setDeskMode } from "@/components/auto-engine";
import { QuotesHydrator } from "@/components/quotes-hydrator";
import { MODE_CHIPS } from "@/lib/meridian/operator-copy";
import { toast } from "sonner";
import { useState } from "react";

const NAV = [
  { to: "/", label: "Command", icon: LayoutDashboard },
  { to: "/markets", label: "Tape", icon: LineChart },
  { to: "/portfolio", label: "Book", icon: BookOpen },
  { to: "/auto", label: "Auto", icon: Activity },
  { to: "/greeks", label: "Greeks", icon: Sigma },
  { to: "/research", label: "Research", icon: Compass },
] as const;

export function DeskShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const mode = useDesk((s) => s.mode);
  const killed = useDesk((s) => s.killed);
  const [haltAsk, setHaltAsk] = useState(false);
  const guest = !isPending && !user;
  const canDrive = !guest;

  function onMode(next: typeof mode) {
    if (!canDrive) {
      toast.message("Sign in to change mode on the shared book.");
      return;
    }
    void setDeskMode(next);
  }

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

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <QuotesHydrator />
      <AutoEngine />
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 md:px-6">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-display text-xl tracking-tight">Meridian</span>
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted">Final</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex">
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
          <div className="ml-auto flex items-center gap-2">
            <Badge tone={killed ? "down" : mode === "auto" || mode === "paper" ? "warn" : "neutral"}>
              {killed ? "Halted" : (MODE_CHIPS.find((m) => m.id === mode)?.label ?? mode)}
            </Badge>
            <Button
              size="sm"
              variant={killed ? "outline" : "danger"}
              disabled={guest}
              title={guest ? "Sign in to halt" : killed ? "Resume paper" : "Halt new risk and stops"}
              onClick={onHalt}
            >
              {killed ? "Resume paper" : "Halt"}
            </Button>
            <select
              aria-label="Desk mode"
              disabled={guest}
              className="h-9 min-h-11 rounded-[8px] border border-border bg-elevated px-2 text-xs text-fg md:min-h-9"
              value={mode}
              onChange={(e) => onMode(e.target.value as typeof mode)}
            >
              {MODE_CHIPS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
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
