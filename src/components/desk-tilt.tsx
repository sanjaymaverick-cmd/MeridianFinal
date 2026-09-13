import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DeskTilt({ children, className, disabled }: { children: ReactNode; className?: string; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  function onMove(e: React.PointerEvent) {
    if (disabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;
    const el = ref.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5;
    const y = (e.clientY - b.top) / b.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 7).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${e.clientX - b.left}px`);
    el.style.setProperty("--my", `${e.clientY - b.top}px`);
  }
  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn("relative overflow-hidden rounded-[24px] border border-border bg-surface", className)}
      style={{
        transform: disabled ? undefined : "perspective(1200px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))",
        transformStyle: "preserve-3d",
        transition: "transform var(--motion-regular) var(--ease-out-desk)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), color-mix(in oklab, var(--color-fg) 8%, transparent), transparent 70%)",
        }}
      />
      <div className="relative" style={{ transform: "none" }}>
        {children}
      </div>
    </div>
  );
}
