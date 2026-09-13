import { useState } from "react";
import { promotionVerdict, type PromotionMeta } from "@/lib/meridian/operator-copy";

export function PromotionChip({ meta }: { meta: PromotionMeta | null | undefined }) {
  const v = promotionVerdict(meta);
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-[12px] border ${v.ready ? "border-up/40" : "border-warn/50"} bg-surface`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        onClick={() => setOpen((x) => !x)}
      >
        <span className="text-xs">
          {v.ready ? "PnL sleeve ready" : `PnL sleeve not ready · hit ${((meta?.hitRate ?? 0) * 100).toFixed(0)}%`}
        </span>
        <span className="text-[11px] text-subtle">{open ? "Hide" : "Gates"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-3">
          <p className="text-sm font-medium">{v.title}</p>
          <p className="mt-1 text-sm text-muted">{v.body}</p>
          <p className="mt-1 text-sm">{v.next}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {v.gates.map((g) => (
              <li
                key={g.label}
                className={`rounded-full border px-3 py-1 text-xs ${g.pass ? "border-up/40 text-up" : "border-down/40 text-down"}`}
              >
                {g.label}: {g.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function PromotionStrip({ meta }: { meta: PromotionMeta | null | undefined }) {
  return <PromotionChip meta={meta} />;
}
