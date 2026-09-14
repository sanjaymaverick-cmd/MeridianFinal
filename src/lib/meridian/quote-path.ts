/**
 * Quote path tag from the live feed name.
 * Crypto Binance last → quote:binance. Separate from fill reasons (money path stays :paper)
 * and from QuoteLabel enum ("live" | "delayed" | "model") — do not rename that enum.
 */
export function quotePathOf(feed: string | undefined | null): string {
  const f = String(feed ?? "").toLowerCase();
  if (f.startsWith("binance")) return "quote:binance";
  if (f.startsWith("polymarket")) return "quote:polymarket";
  if (f.includes("model") || f === "nse-opt-model") return "quote:model";
  if (f.startsWith("yahoo") || f === "derived") return "quote:yahoo";
  return "quote:last";
}
