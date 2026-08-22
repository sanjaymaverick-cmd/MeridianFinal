/**
 * V2/V3 Greeks book + gamma scalping.
 * Daily PnL = one-day theta. Gamma scalp PnL = ½ Γ (ΔS)².
 * Ports meridian_v3/risk/greeks_book.py and gamma_scalp.py.
 */

export type OptionLeg = {
  id: string;
  symbol: string;
  label: string;
  lots: number;
  multiplier: number;
  markInr: number;
  delta: number;
  gamma: number;
  vegaPerLot: number;
  thetaPerLot: number;
};

export type GreekSnapshot = {
  symbol: string;
  deltaLots: number;
  gamma: number;
  vega: number;
  theta: number;
  markInr: number;
  multiplier: number;
  movePct: number;
  moveInr: number;
  dailyPnl: number;
  gammaScalpPnl: number;
  gammaSign: "long" | "short" | "flat";
  scalpHelps: boolean;
  legCount: number;
};

export type ScalpStep = {
  label: string;
  price: number;
  deltaLots: number;
  hedgeLots: number;
  lockedPnl: number;
  note: string;
};

export type GammaScalpReport = {
  posture: string;
  helps: boolean;
  hurts: boolean;
  rehedgeBandLots: number;
  currentDeltaLots: number;
  needsRehedge: boolean;
  suggestedFuturesLots: number;
  dailyTheta: number;
  movePct: number;
  moveInr: number;
  scalpPnlOnMove: number;
  netAfterMoveDay: number;
  moveCoversTheta: boolean;
  steps: ScalpStep[];
  statusLines: string[];
  dailyPnlLine: string;
  gammaScalpLine: string;
  suggestion: string;
};

function snapLots(x: number, step = 1) {
  if (step <= 0) return x;
  return Math.round(x / step) * step;
}

export function gammaScalpPnl(gamma: number, moveInr: number, multiplier: number) {
  return 0.5 * gamma * moveInr * moveInr * multiplier;
}

export function snapshotFromLegs(symbol: string, legs: OptionLeg[], movePct = 0.01): GreekSnapshot {
  const use = legs.filter((l) => l.symbol === symbol);
  const delta = use.reduce((s, l) => s + l.delta * l.lots, 0);
  const gamma = use.reduce((s, l) => s + l.gamma * l.lots, 0);
  const vega = use.reduce((s, l) => s + l.vegaPerLot * l.lots, 0);
  const theta = use.reduce((s, l) => s + l.thetaPerLot * l.lots, 0);
  const mark = use.find((l) => l.markInr)?.markInr ?? 0;
  const multiplier = use.find((l) => l.multiplier)?.multiplier ?? 1;
  const moveInr = mark * movePct;
  const scalp = gammaScalpPnl(gamma, moveInr, multiplier);
  const gammaSign = gamma > 1e-12 ? "long" : gamma < -1e-12 ? "short" : "flat";
  return {
    symbol,
    deltaLots: delta,
    gamma,
    vega,
    theta,
    markInr: mark,
    multiplier,
    movePct,
    moveInr,
    dailyPnl: theta,
    gammaScalpPnl: scalp,
    gammaSign,
    scalpHelps: gamma > 1e-12,
    legCount: use.length,
  };
}

export function explainScalp(
  snap: GreekSnapshot,
  opts: { rehedgeBandLots?: number; lotStep?: number; startHedged?: boolean } = {},
): GammaScalpReport {
  const rehedgeBandLots = opts.rehedgeBandLots ?? 1;
  const lotStep = opts.lotStep ?? 1;
  const startHedged = opts.startHedged ?? true;
  const startDelta = startHedged ? 0 : snap.deltaLots;
  const up = Math.abs(snap.moveInr);
  const down = -up;
  const scalp = snap.gammaScalpPnl;
  const net = snap.dailyPnl + scalp;
  const covers = Math.abs(scalp) + 1e-9 >= Math.abs(snap.dailyPnl) && snap.gammaSign === "long";
  const futuresNow = snapLots(-snap.deltaLots, lotStep);
  const needs = Math.abs(snap.deltaLots) >= rehedgeBandLots - 1e-12;

  let postureWords: string;
  let upNote: string;
  let downNote: string;
  let suggestion: string;
  if (snap.gammaSign === "long") {
    postureWords = "Long gamma — a move can help if leftover direction stays small";
    upNote =
      "Price went up. Extra long direction — the model reviews selling futures at the higher price. That is the helpful loop.";
    downNote =
      "Price went down. Extra short direction — the model reviews buying futures at the lower price. Same helpful loop.";
    suggestion = needs
      ? `Model suggestion: review a futures clip of ${futuresNow >= 0 ? "+" : ""}${futuresNow.toFixed(1)} lots to flatten leftover direction (review only). Gamma scalping is helping.`
      : "Model suggestion: no futures clip yet — leftover direction is still inside the band. Keep watching.";
  } else if (snap.gammaSign === "short") {
    postureWords = "Short gamma — a move can hurt";
    upNote = "Price went up. Short gamma pushed you the wrong way — buying futures at a higher price costs money.";
    downNote = "Price went down. Short gamma pushed you the wrong way — selling futures at a lower price costs money.";
    suggestion = `Model suggestion: this is not a harvest. Review cutting the short-gamma option, or accept that a ${(snap.movePct * 100).toFixed(1)}% jump can cost about ₹${Math.round(scalp).toLocaleString("en-IN")}. Not an order.`;
  } else {
    postureWords = "Gamma is flat — there is no scalp story";
    upNote = "A small up-move barely changes leftover direction.";
    downNote = "A small down-move barely changes leftover direction.";
    suggestion = "Model suggestion: nothing to scalp. Review only if leftover delta is large.";
  }

  const deltaUp = startDelta + snap.gamma * up;
  const deltaDown = startDelta + snap.gamma * down;
  const move = snap.movePct * 100;
  const rupees = (v: number) => `${v > 0 ? "+" : ""}₹${Math.round(v).toLocaleString("en-IN")}`;

  const dailyLine =
    snap.dailyPnl < -1
      ? `Daily PnL: about ${rupees(snap.dailyPnl)} today if the market sits still (mostly time decay).`
      : snap.dailyPnl > 1
        ? `Daily PnL: about ${rupees(snap.dailyPnl)} today if the market sits still (time is paying you).`
        : "Daily PnL: near zero if the market sits still.";

  const scalpLine =
    snap.gammaSign === "long"
      ? `Gamma Scalping PnL: a ${move.toFixed(1)}% move could add about ${rupees(scalp)} if you keep delta small.`
      : snap.gammaSign === "short"
        ? `Gamma Scalping PnL: a ${move.toFixed(1)}% move could cost about ${rupees(scalp)} (short gamma hurts).`
        : "Gamma Scalping PnL: near zero on a small move (gamma is flat).";

  const bandWords = needs
    ? `above the ${rehedgeBandLots.toFixed(1)}-lot band — review a flatten`
    : "still inside the band";

  return {
    posture: snap.gammaSign,
    helps: snap.gammaSign === "long",
    hurts: snap.gammaSign === "short",
    rehedgeBandLots,
    currentDeltaLots: snap.deltaLots,
    needsRehedge: needs,
    suggestedFuturesLots: needs ? futuresNow : 0,
    dailyTheta: snap.dailyPnl,
    movePct: snap.movePct,
    moveInr: snap.moveInr,
    scalpPnlOnMove: scalp,
    netAfterMoveDay: net,
    moveCoversTheta: covers,
    steps: [
      {
        label: "Start (delta flattened)",
        price: snap.markInr,
        deltaLots: startDelta,
        hedgeLots: snapLots(-startDelta, lotStep),
        lockedPnl: 0,
        note: "Begin with leftover direction near zero so the next move is a clean gamma story.",
      },
      {
        label: `If price rises ${move.toFixed(1)}%`,
        price: snap.markInr + up,
        deltaLots: deltaUp,
        hedgeLots: snapLots(-deltaUp, lotStep),
        lockedPnl: scalp,
        note: upNote,
      },
      {
        label: `If price falls ${move.toFixed(1)}%`,
        price: snap.markInr + down,
        deltaLots: deltaDown,
        hedgeLots: snapLots(-deltaDown, lotStep),
        lockedPnl: scalp,
        note: downNote,
      },
    ],
    statusLines: [
      `Delta: leftover direction is ${snap.deltaLots >= 0 ? "+" : ""}${snap.deltaLots.toFixed(2)} lots (${bandWords}).`,
      `Gamma: ${postureWords} (${snap.gamma >= 0 ? "+" : ""}${snap.gamma.toFixed(4)}).`,
      `After a ${move.toFixed(1)}% move, leftover delta would be about ${deltaUp >= 0 ? "+" : ""}${deltaUp.toFixed(2)} lots up or ${deltaDown >= 0 ? "+" : ""}${deltaDown.toFixed(2)} lots down.`,
      `Time: ${rupees(snap.theta)} today if nothing else happens.`,
    ],
    dailyPnlLine: dailyLine,
    gammaScalpLine: scalpLine,
    suggestion,
  };
}

export const DEMO_NIFTY_LEGS: OptionLeg[] = [
  {
    id: "ce",
    symbol: "NIFTY",
    label: "NIFTY ATM CE",
    lots: 2,
    multiplier: 65,
    markInr: 24252,
    delta: 0.52,
    gamma: 0.00085,
    vegaPerLot: 18,
    thetaPerLot: -42,
  },
  {
    id: "pe",
    symbol: "NIFTY",
    label: "NIFTY ATM PE",
    lots: 2,
    multiplier: 65,
    markInr: 24252,
    delta: -0.48,
    gamma: 0.00082,
    vegaPerLot: 17,
    thetaPerLot: -39,
  },
];
