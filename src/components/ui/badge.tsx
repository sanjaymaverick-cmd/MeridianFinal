import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "up" | "down" | "warn" | "accent";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-elevated text-muted border-border",
    up: "bg-up/15 text-up border-up/30",
    down: "bg-down/15 text-down border-down/30",
    warn: "bg-warn/15 text-warn border-warn/30",
    accent: "bg-accent text-accent-fg border-transparent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
