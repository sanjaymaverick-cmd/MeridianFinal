import type { UniverseName } from "./universe";

export function rankResearch(query: string, universe: UniverseName[]) {
  const q = query.toLowerCase();
  const wantCrypto = /crypto|bitcoin|btc|eth|delta|binance/.test(q);
  const wantFx = /usd|inr|rupee|forex|fx|dollar|hedge/.test(q);
  const wantMetal = /gold|silver|copper|crude|commodit|metal|stress/.test(q);
  const wantSpares = /spare|component|data.?center|cable|wire|havells|kei|polycab|ai data/.test(q);
  const wantBank = /\bbank/.test(q);
  const wantIt = /\bit\b|infosys|tcs|software/.test(q);

  const scored = universe.map((u) => {
    let s = 0;
    for (const t of u.themes) {
      const t0 = t.replace(/-/g, " ");
      if (q.includes(t0) || q.includes(t)) s += 4;
    }
    if (wantCrypto && u.assetClass === "crypto") s += 12;
    if (wantFx && u.assetClass === "forex") s += 12;
    if (wantMetal && u.assetClass === "commodity") s += 12;
    if (wantSpares && u.themes.some((t) => /cable|power|ems|ai|electrical|spare/.test(t))) s += 10;
    if (wantBank && u.themes.includes("banks")) s += 10;
    if (wantIt && u.themes.includes("it-services")) s += 8;
    if (wantCrypto && u.assetClass !== "crypto") s -= 8;
    if (wantFx && u.assetClass !== "forex") s -= 8;
    if (wantMetal && u.assetClass !== "commodity") s -= 6;
    if (wantSpares && u.themes.includes("banks")) s -= 10;
    return { u, s };
  });

  const hits = scored.filter((x) => x.s >= 8).sort((a, b) => b.s - a.s);
  if (!hits.length) {
    return {
      names: [] as Array<{
        symbol: string;
        name: string;
        sector: string;
        score: number;
        why: string;
        risk: string;
        sleeve: string;
      }>,
      reason: "No names in the desk universe match that question. Refusing a canned shortlist.",
    };
  }
  return {
    reason: "Ranked from the desk universe.",
    names: hits.slice(0, 6).map(({ u }) => ({
      symbol: u.symbol,
      name: u.name,
      sector: u.sector,
      score: Math.round((u.quality * 0.5 + u.sentiment * 0.3 + 2) * 10) / 10,
      why: u.thesis,
      risk: "Desk heuristic — not Grok. Not an order.",
      sleeve:
        u.assetClass === "crypto"
          ? "Crypto"
          : u.assetClass === "forex"
            ? "FX"
            : u.assetClass === "commodity"
              ? "Commodity"
              : "Spot",
    })),
  };
}
