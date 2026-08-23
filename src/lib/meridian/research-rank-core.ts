export type RankInput = {
  symbol: string;
  name: string;
  sector: string;
  quality: number;
  sentiment: number;
  themes: string[];
  thesis: string;
  assetClass?: string;
};

export type RankedName = {
  symbol: string;
  name: string;
  sector: string;
  score: number;
  why: string;
  risk: string;
  sleeve: string;
  next: string;
  match: string;
};

export type ResearchRank = {
  names: RankedName[];
  source: "desk";
  emptyNote: string | null;
};

const STOP = new Set([
  "the", "and", "for", "that", "with", "from", "this", "only", "can", "are", "you",
  "me", "my", "to", "of", "in", "on", "a", "an", "as", "if", "or", "i", "best",
  "find", "which", "fits", "names", "companies",
]);

function tokens(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function sleeveOf(u: RankInput): string {
  if (u.assetClass === "crypto") return "Crypto";
  if (u.assetClass === "forex") return "FX";
  if (u.assetClass === "commodity") return "Commodity";
  if (u.assetClass === "futures") return "Futures";
  if (u.assetClass === "options") return "Options";
  return "Spot";
}

function nextOf(u: RankInput, q: string): string {
  if (q.includes("stress") && u.assetClass === "commodity") return "Hold as ballast — do not chase crude.";
  if (u.assetClass === "crypto") return "Watch in Auto on paper. Size vs INR, not USD.";
  if (u.assetClass === "forex") return "Hedge sleeve, not a punch. Open on Tape.";
  return "Watch in Auto or open on Tape. Not an order.";
}

export function rankFromUniverse(query: string, names: RankInput[]): ResearchRank {
  const q = query.toLowerCase();
  const toks = tokens(q);
  const wantCrypto = /crypto|bitcoin|btc|eth|delta/.test(q);
  const wantFx = /forex|dollar|rupee|usdinr|g10|hedge|fx\b/.test(q);
  const wantCmd = /gold|silver|copper|crude|commodit/.test(q);
  const wantSpares = /spare|component|cable|data.?center|datacenter|cooling|ems|grid/.test(q);
  const wantAi = /\bai\b|data.?center|datacenter/.test(q);
  const wantBank = /\bbank/.test(q);
  const wantIt = /\bit\b|software|infy|tcs/.test(q);
  const stress = /stress/.test(q);

  const scored = names
    .map((u) => {
      let s = 0;
      const themes = u.themes.map((t) => t.replace(/-/g, " "));
      for (const t of themes) {
        if (q.includes(t)) s += 5;
        for (const tok of toks) if (t.includes(tok)) s += 2;
      }
      if (wantSpares && themes.some((t) => /cable|ai data|power|ems|cooling|grid/.test(t))) s += 10;
      if (wantAi && themes.some((t) => t.includes("ai data") || t.includes("cable") || t.includes("power"))) s += 4;
      if (wantCrypto && u.assetClass === "crypto") s += 12;
      if (wantFx && u.assetClass === "forex") s += 12;
      if (wantCmd && u.assetClass === "commodity") s += 12;
      if (stress && u.symbol === "GOLD") s += 4;
      if (wantBank && u.themes.includes("banks")) s += 6;
      if (wantIt && u.themes.includes("it-services")) s += 4;
      if (wantCrypto && u.assetClass !== "crypto") s -= 14;
      if (wantFx && u.assetClass !== "forex") s -= 14;
      if (wantCmd && u.assetClass !== "commodity") s -= 14;
      if (wantSpares && (u.themes.includes("banks") || u.themes.includes("it-services"))) s -= 10;
      s += u.quality / 8;
      return { u, s };
    })
    .filter((r) => r.s >= 4)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6);

  if (!scored.length) {
    return {
      names: [],
      source: "desk",
      emptyNote:
        "Nothing in the modelled universe matches that question. Try cables, BTC/ETH, gold, or USDINR.",
    };
  }

  return {
    names: scored.map(({ u }) => ({
      symbol: u.symbol,
      name: u.name,
      sector: u.sector,
      score: Math.round((u.quality * 0.5 + u.sentiment * 0.3 + 2) * 10) / 10,
      why: u.thesis,
      risk: "Desk heuristic over the modelled universe. Not Grok. Not an order.",
      sleeve: sleeveOf(u),
      next: nextOf(u, q),
      match: u.themes.slice(0, 3).join(" · "),
    })),
    source: "desk",
    emptyNote: null,
  };
}
