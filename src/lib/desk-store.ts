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
  sleeve?: "farm" | "pnl";
  sizePct?: number;
  pending?: boolean;
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
  heatFarm: number;
  heatPnl: number;
  lastTick: number;
  focusSymbol: string;
  flash: Record<string, "up" | "down">;
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
  setFocusSymbol: (s: string) => void;
  hydratePaper: (book: {
    mode: DeskMode;
    killed: boolean;
    positions: Position[];
    fills: Fill[];
    ticks: TickMap;
    dailyPnl: number;
    scan: ScanRow[];
    heatFarm?: number;
    heatPnl?: number;
    lastTick?: number;
    error?: string;
  }) => void;
};

function seedTicks(): TickMap {
  const t: TickMap = {};
  for (const [k, v] of Object.entries(SNAPSHOT)) t[k] = v;
  for (const u of UNIVERSE) if (u.last) t[u.symbol] = u.last;
  return t;
}

export const useDesk = create<DeskState>((set, get) => ({
  mode: "paper",
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
  heatFarm: 0,
  heatPnl: 0,
  lastTick: 0,
  focusSymbol: "",
  flash: {},
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
    const cur = get();
    if (meta?.asOf && cur.asOf === meta.asOf) return;
    const ticks = { ...cur.ticks };
    const flash: Record<string, "up" | "down"> = { ...cur.flash };
    for (const [k, v] of Object.entries(quotes)) {
      if (v.last > 0) {
        const prev = ticks[k];
        if (prev > 0 && v.last !== prev) flash[k] = v.last > prev ? "up" : "down";
        ticks[k] = v.last;
      }
    }
    const holdings = cur.holdings.map((h) => ({
      ...h,
      lastPrice: ticks[h.symbol] ?? h.lastPrice,
    }));
    set({
      ticks,
      anchors: { ...ticks },
      holdings,
      flash,
      asOf: meta?.asOf ?? Date.now(),
      source: meta?.source ?? cur.source,
    });
  },
  setScan: (scan) => set({ scan }),
  setFocusSymbol: (focusSymbol) => set({ focusSymbol }),
  hydratePaper: (book) => {
    const cur = get();
    if (
      cur.lastTick === (book.lastTick ?? 0) &&
      cur.mode === book.mode &&
      cur.killed === book.killed &&
      cur.dailyPnl === book.dailyPnl &&
      cur.positions.length === book.positions.length &&
      cur.fills[0]?.id === book.fills[0]?.id &&
      cur.scan.length === book.scan.length
    ) {
      return;
    }
    const ticks = { ...cur.ticks, ...book.ticks };
    const flash = { ...cur.flash };
    for (const [k, v] of Object.entries(book.ticks ?? {})) {
      const prev = cur.ticks[k];
      if (prev > 0 && v > 0 && v !== prev) flash[k] = v > prev ? "up" : "down";
    }
    set({
      mode: book.mode,
      killed: book.killed,
      positions: book.positions,
      fills: book.fills,
      ticks,
      dailyPnl: book.dailyPnl,
      scan: book.scan,
      heatFarm: book.heatFarm ?? cur.heatFarm,
      heatPnl: book.heatPnl ?? cur.heatPnl,
      lastTick: book.lastTick ?? cur.lastTick,
      flash,
    });
  },
}));
