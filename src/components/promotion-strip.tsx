import { promotionVerdict, type PromotionMeta } from "@/lib/meridian/operator-copy";

export function PromotionStrip({ meta }: { meta: PromotionMeta | null | undefined }) {
  const v = promotionVerdict(meta);
  return (
    <section
      className={`rounded-[24px] border p-5 ${v.ready ? "border-up/40 bg-surface" : "border-warn/50 bg-surface"}`}
    >
      <p className="text-[11px] uppercase tracking-wider text-subtle">Promotion</p>
      <h2 className="mt-1 text-lg font-medium">{v.title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{v.body}</p>
      <p className="mt-2 text-sm">{v.next}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {v.gates.map((g) => (
          <li
            key={g.label}
            className={`rounded-full border px-3 py-1 text-xs ${g.pass ? "border-up/40 text-up" : "border-down/40 text-down"}`}
          >
            {g.label}: {g.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}
