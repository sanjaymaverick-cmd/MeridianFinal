import { create } from "zustand";
import { DEMO_HOLDINGS, type HoldingRow } from "@/lib/meridian/portfolio";
import type { Position } from "@/lib/meridian/decision";
import { UNIVERSE } from "@/lib/meridian/universe";
import { SNAPSHOT } from "@/lib/meridian/tickers";

export type DeskMode = "advisory" | "paper" | "auto";

export type TickMap = Record<string, number>;

export type Fill = {
  id: string;
  ts: number;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  reason: string;
  quoteLabel?: "live" | "delayed" | "model";
  expiry?: string;
  strike?: number;
  right?: string;
  sleeve?: "farm" | "pnl";
};

export type ScanRow = {
  symbol: string;
  action: string;
  reason: string;
  metaProb: number;
  px: number;
};

type DeskState = {
  mode: DeskMode;
  killed: boolean;
  holdings: HoldingRow[];
  positions: Position[];
  fills: Fill[];
  ticks: TickMap;
  anchors: TickMap;
  dailyPnl: number;
  scan: ScanRow[];
  asOf: number | null;
  source: string;
  setMode: (m: DeskMode) => void;
  setKilled: (k: boolean) => void;
  setHoldings: (h: HoldingRow[]) => void;
  setPositions: (p: Position[]) => void;
  addFill: (f: Fill) => void;
  bumpTicks: () => void;
  addDailyPnl: (x: number) => void;
  resetPaper: () => void;
  applyQuotes: (quotes: Record<string, { last: number }>, meta?: { asOf?: number; source?: string }) => void;
  setScan: (scan: ScanRow[]) => void;
  hydratePaper: (book: {
    mode: DeskMode;
    killed: boolean;
    positions: Position[];
    fills: Fill[];
    ticks: TickMap;
    dailyPnl: number;
    scan: ScanRow[];
  }) => void;
};

function seedTicks(): TickMap {
  const t: TickMap = {};
  for (const [k, v] of Object.entries(SNAPSHOT)) t[k] = v;
  for (const u of UNIVERSE) if (u.last) t[u.symbol] = u.last;
  return t;
}

export const useDesk = create<DeskState>((set, get) => ({
  mode: "auto",
  killed: false,
  holdings: DEMO_HOLDINGS,
  positions: [],
  fills: [],
  ticks: seedTicks(),
  anchors: seedTicks(),
  dailyPnl: 0,
  scan: [],
  asOf: null,
  source: "snapshot",
  setMode: (mode) => set({ mode }),
  setKilled: (killed) => set({ killed }),
  setHoldings: (holdings) => set({ holdings }),
  setPositions: (positions) => set({ positions }),
  addFill: (f) => set({ fills: [f, ...get().fills].slice(0, 80) }),
  bumpTicks: () => {
    // Paper fills use live prints only. Do not walk the tape.
  },
  addDailyPnl: (x) => set({ dailyPnl: get().dailyPnl + x }),
  resetPaper: () =>
    set({
      positions: [],
      fills: [],
      dailyPnl: 0,
      ticks: { ...get().anchors },
      scan: [],
    }),
  applyQuotes: (quotes, meta) => {
    const ticks = { ...get().ticks };
    for (const [k, v] of Object.entries(quotes)) {
      if (v.last > 0) ticks[k] = v.last;
    }
    const holdings = get().holdings.map((h) => ({
      ...h,
      lastPrice: ticks[h.symbol] ?? h.lastPrice,
    }));
    set({
      ticks,
      anchors: { ...ticks },
      holdings,
      asOf: meta?.asOf ?? Date.now(),
      source: meta?.source ?? get().source,
    });
  },
  setScan: (scan) => set({ scan }),
  hydratePaper: (book) =>
    set({
      mode: book.mode,
      killed: book.killed,
      positions: book.positions,
      fills: book.fills,
      ticks: { ...get().ticks, ...book.ticks },
      dailyPnl: book.dailyPnl,
      scan: book.scan,
    }),
}));
