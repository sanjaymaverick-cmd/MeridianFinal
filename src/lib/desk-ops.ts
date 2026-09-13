import { toast } from "sonner";
import { runDeskOp } from "@/components/auto-engine";
import { explainReason } from "@/lib/meridian/reasons";
import { paperBlockedReason } from "@/lib/meridian/session-lock";
import { useDesk } from "@/lib/desk-store";

export async function paperSend(opts: {
  type: "open" | "flatten" | "reverse" | "skip" | "flatten_all";
  symbol?: string;
  qty?: number;
  side?: "long" | "short";
  sleeve?: "farm" | "pnl";
  feed?: string;
}) {
  if (opts.type === "open" && opts.symbol) {
    const blocked = paperBlockedReason(opts.symbol, opts.feed);
    if (blocked) {
      toast.message("NSE cash is closed. Crypto farm only until the next open.");
      return;
    }
  }
  try {
    const book = await runDeskOp({
      type: opts.type,
      symbol: opts.symbol,
      qty: opts.qty,
      side: opts.side,
      sleeve: opts.sleeve,
    });
    const err = (book as { error?: string }).error;
    if (err) {
      toast.message(explainReason(err));
      return;
    }
    if (opts.type === "open") {
      toast.message(`Papered ${opts.qty ?? ""} ${opts.symbol ?? ""} ${opts.side ?? "long"}. Kite stays off.`);
    } else if (opts.type === "flatten") {
      toast.message(`Flattened ${opts.symbol}. Kite stays off.`);
    } else if (opts.type === "reverse") {
      toast.message(`Reversed ${opts.symbol}. Kite stays off.`);
    } else if (opts.type === "flatten_all") {
      toast.message("Flattened all open clips. Kite stays off.");
    }
    return book;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Desk op failed");
  }
}

export function focusedOrFirstOpen() {
  const s = useDesk.getState();
  return s.focusSymbol || s.positions[0]?.symbol || s.fills[0]?.symbol || "";
}
