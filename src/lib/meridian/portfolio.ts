import { compositeScore, mapAction, type ActionLabel, type Regime } from "./scoring";
import { predictMetaProb } from "./artefact";
import { factorParts, lookup, type UniverseName } from "./universe";
import { sessionClock } from "./decision";

export type HoldingRow = {
  symbol: string;
  companyName: string;
  qty: number;
  avgCost: number;
  lastPrice: number;
  instrument: string;
  accountName: string;
};

export type HoldingReview = HoldingRow & {
  invested: number;
  value: number;
  pnl: number;
  pnlPct: number;
  score: number | null;
  action: ActionLabel | "—";
  metaProb: number;
  predictability: number;
  strength: string;
  note: string;
  universe: UniverseName | null;
};

const HEADER_ALIASES: Record<string, keyof HoldingRow | "skip"> = {
  symbol: "symbol",
  instrument: "symbol",
  tradingsymbol: "symbol",
  ticker: "symbol",
  "company name": "companyName",
  name: "companyName",
  scheme: "companyName",
  qty: "qty",
  quantity: "qty",
  "qty.": "qty",
  units: "qty",
  "avg. cost": "avgCost",
  avgcost: "avgCost",
  "average cost": "avgCost",
  "avg price": "avgCost",
  "average buy": "avgCost",
  ltp: "lastPrice",
  last: "lastPrice",
  "last price": "lastPrice",
  price: "lastPrice",
  "cur. val": "skip",
  "p&l": "skip",
  isin: "skip",
};

function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseHoldingsCsv(text: string): HoldingRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = cells(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, " "));
  const idx = header.map((h) => HEADER_ALIASES[h] ?? null);
  const rows: HoldingRow[] = [];
  for (const line of lines.slice(1)) {
    const c = cells(line);
    const row: HoldingRow = {
      symbol: "",
      companyName: "",
      qty: 0,
      avgCost: 0,
      lastPrice: 0,
      instrument: "equity",
      accountName: "Imported",
    };
    c.forEach((val, i) => {
      const key = idx[i];
      if (!key || key === "skip") return;
      if (key === "qty" || key === "avgCost" || key === "lastPrice") {
        row[key] = Number(String(val).replace(/[,₹]/g, "")) || 0;
      } else if (key === "symbol") {
        row.symbol = val.replace(/-EQ$/i, "").replace(/\.NS$/i, "").toUpperCase();
      } else {
        row[key] = val;
      }
    });
    if (row.symbol) rows.push(row);
  }
  return rows;
}

export function reviewHolding(h: HoldingRow, regime: Regime): HoldingReview {
  const u = lookup(h.symbol);
  const last = h.lastPrice || u?.last || h.avgCost;
  const invested = h.qty * h.avgCost;
  const value = h.qty * last;
  const pnl = value - invested;
  const pnlPct = invested > 0 ? pnl / invested : 0;
  const parts = u
    ? factorParts(u)
    : { quality: null, valuation: null, technical: null, ownership: null, sentiment: null };
  const score = compositeScore(parts, regime);
  const action = mapAction(score, regime);
  const clock = sessionClock();
  const metaProb = predictMetaProb({
    confidence: (score ?? 5) / 10,
    confluence: 70 + (score ?? 5),
    p_success: 0.5 + ((score ?? 5) - 5) / 20,
    atr_pct: u?.atrPct ?? 0.02,
    approx_stop_pct: 1.5 * (u?.atrPct ?? 0.02),
    minutes_since_midnight: clock.minutesSinceMidnight,
    minutes_to_eod_flatten: Math.max(0, clock.minutesToEod),
  });
  const trend = u ? (u.last > u.sma50 ? 1 : 0) + (u.sma20 > u.sma50 ? 1 : 0) : 0;
  const predictability = Math.round(clamp01(metaProb * 0.7 + trend * 0.12 + (score ?? 5) / 50) * 100);
  const strength =
    predictability >= 70 ? "High" : predictability >= 55 ? "Medium" : predictability >= 40 ? "Low" : "Weak";
  let note = "Not an order. Review only.";
  if (action === "Strong Buy" || action === "Buy")
    note = "Tape and factors still support adding on dips. Size with heat. Not an order.";
  else if (action === "Hold") note = "Keep. Do not chase. Revisit if regime turns Stress. Not an order.";
  else if (action === "Reduce") note = "Edge is thinning. Trim into strength. Not an order.";
  else if (action === "Sell") note = "Factors no longer pay you to sit. Review an exit plan. Not an order.";
  return {
    ...h,
    lastPrice: last,
    invested,
    value,
    pnl,
    pnlPct,
    score,
    action,
    metaProb,
    predictability,
    strength,
    note,
    universe: u,
  };
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

export const DEMO_HOLDINGS: HoldingRow[] = [
  { symbol: "RELIANCE", companyName: "Reliance Industries", qty: 40, avgCost: 1284, lastPrice: 1316, instrument: "equity", accountName: "Core — Zerodha" },
  { symbol: "HDFCBANK", companyName: "HDFC Bank", qty: 55, avgCost: 710, lastPrice: 727, instrument: "equity", accountName: "Core — Zerodha" },
  { symbol: "TCS", companyName: "Tata Consultancy Services", qty: 12, avgCost: 2410, lastPrice: 2302, instrument: "equity", accountName: "Core — Zerodha" },
  { symbol: "POLYCAB", companyName: "Polycab India", qty: 6, avgCost: 8420, lastPrice: 8966, instrument: "equity", accountName: "Core — Zerodha" },
  { symbol: "ITC", companyName: "ITC", qty: 80, avgCost: 262, lastPrice: 269.4, instrument: "equity", accountName: "Core — Zerodha" },
  { symbol: "INFY", companyName: "Infosys", qty: 25, avgCost: 1188, lastPrice: 1121, instrument: "equity", accountName: "Core — Zerodha" },
  { symbol: "GOLD", companyName: "Gold (MCX)", qty: 1, avgCost: 151200, lastPrice: 158360, instrument: "commodity", accountName: "MCX" },
  { symbol: "BTC", companyName: "Bitcoin", qty: 0.08, avgCost: 73000, lastPrice: 77205, instrument: "crypto", accountName: "Delta paper" },
  { symbol: "USDINR", companyName: "USD / INR", qty: 2000, avgCost: 95.2, lastPrice: 95.685, instrument: "forex", accountName: "Spot FX" },
];
