import { useEffect, useRef } from "react";

export function DepthHeatmap({
  rows,
}: {
  rows: Array<{ symbol: string; last: number; chg: number; vol?: number }>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#121416";
    ctx.fillRect(0, 0, w, h);
    const slice = rows.slice(0, 40);
    if (!slice.length) return;
    const vols = slice.map((r) => r.vol ?? Math.abs(r.chg) * 1000);
    const max = Math.max(...vols, 1);
    const bw = w / slice.length;
    slice.forEach((r, i) => {
      const intensity = (vols[i] ?? 0) / max;
      ctx.fillStyle = r.chg >= 0 ? `rgba(63,143,107,${0.15 + intensity * 0.7})` : `rgba(196,92,74,${0.15 + intensity * 0.7})`;
      const bh = Math.max(4, intensity * (h - 8));
      ctx.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
    });
  }, [rows]);
  return (
    <div>
      <canvas ref={ref} width={640} height={120} className="h-28 w-full rounded-[12px] border border-border" />
      <p className="mt-1 text-[11px] text-subtle">Illustrative depth from print size / change — not an L2 book.</p>
    </div>
  );
}
