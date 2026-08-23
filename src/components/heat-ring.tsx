export function HeatRing({ heat, cap = 1 }: { heat: number; cap?: number }) {
  const pct = Math.max(0, Math.min(1, cap > 0 ? heat / cap : 0));
  const r = 18;
  const c = 2 * Math.PI * r;
  const tone = pct >= 0.6 ? "var(--color-down)" : pct >= 0.4 ? "var(--color-warn)" : "var(--color-muted)";
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--color-border)" strokeWidth="4" />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth="4"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
        style={{ transition: "stroke-dashoffset var(--motion-regular) var(--ease-out-desk)" }}
      />
    </svg>
  );
}
