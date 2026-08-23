import { Badge } from "@/components/ui/badge";
import { PROMOTE_MIN_AUC, PROMOTE_MIN_HIT, PROMOTE_MIN_N } from "@/lib/meridian/kelly";
import { promotionLines } from "@/lib/ux-copy";

export type MetaBits = {
  n?: number;
  auc?: number;
  hitRate?: number;
  promoted?: boolean;
  source?: string;
};

export function PromotionStrip({
  meta,
  closeStats,
}: {
  meta?: MetaBits | null;
  closeStats?: { n: number; timeStop: number; quality: number } | null;
}) {
  const v = promotionLines(meta ?? undefined);
  const n = meta?.n ?? 0;
  const auc = meta?.auc ?? 0;
  const hit = meta?.hitRate ?? 0;
  const closed = closeStats?.n ?? 0;
  const tsShare = closed > 0 ? (closeStats!.timeStop / closed) * 100 : 0;
  const qShare = closed > 0 ? (closeStats!.quality / closed) * 100 : 0;

  return (
    <section className="rounded-[24px] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Promotion</p>
          <h2 className="mt-1 font-display text-2xl">{v.headline}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{v.body}</p>
        </div>
        <Badge tone={v.promoted ? "up" : "warn"}>{v.promoted ? "PnL eligible" : "Farming"}</Badge>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        <Gate ok={v.nOk} label="Samples" value={`${n.toLocaleString("en-IN")} / ${PROMOTE_MIN_N.toLocaleString("en-IN")}`} />
        <Gate ok={v.aucOk} label="AUC" value={`${auc.toFixed(3)} / ${PROMOTE_MIN_AUC}`} />
        <Gate ok={v.hitOk} label="Hit rate" value={`${(hit * 100).toFixed(0)}% / ${Math.round(PROMOTE_MIN_HIT * 100)}%`} />
      </ul>
      <p className="mt-3 text-xs text-subtle">
        {closed
          ? `Closed clips: ${closed}. Quality holds ${qShare.toFixed(0)}% (≥300s / stop / take-profit). Time-stop ${tsShare.toFixed(0)}% (90s farm barrier). Source ${meta?.source ?? "synth"}.`
          : "No closed clips yet. Quality vs time-stop share appears after the first exits."}
      </p>
    </section>
  );
}

function Gate({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <li className="rounded-[16px] border border-border bg-elevated px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-1 font-mono text-sm">{value}</p>
      <p className={`mt-1 text-xs ${ok ? "text-up" : "text-down"}`}>{ok ? "Pass" : "Fail"}</p>
    </li>
  );
}
