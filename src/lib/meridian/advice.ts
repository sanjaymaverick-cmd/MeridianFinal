import type { Regime } from "./scoring";

export type AdviceCard = {
  id: string;
  sleeve: "Spot" | "Futures" | "Options" | "Book" | "Crypto" | "FX" | "Commodity";
  stance: "Long" | "Short" | "Neutral" | "Reduce" | "Harvest";
  title: string;
  body: string;
  urgency: "now" | "session" | "watch";
};

export type MarketState = {
  nifty: number;
  niftyChg: number;
  bankNifty: number;
  bankChg: number;
  indiaVix: number;
  pcr: number;
  btc: number;
  btcChg: number;
  gold: number;
  goldChg: number;
  usdinr: number;
  usdinrChg: number;
  crude: number;
  crudeChg: number;
  regime: Regime;
  session: "pre" | "open" | "post" | "weekend";
  asOf: number;
  source: string;
};

export function buildAdvice(
  m: MarketState,
  meta?: { promoted?: boolean; n?: number },
): AdviceCard[] {
  const cards: AdviceCard[] = [];
  const cashClosed = m.session === "weekend" || m.session === "pre" || m.session === "post";
  const promoted = Boolean(meta?.promoted);

  if (cashClosed) {
    cards.push({
      id: "spot-closed",
      sleeve: "Spot",
      stance: "Neutral",
      title: "Cash session closed",
      body: "Do not work NSE cash while the session is shut. Overnight paper is crypto-only. Not an order.",
      urgency: "now",
    });
    cards.push({
      id: "fut-closed",
      sleeve: "Futures",
      stance: "Neutral",
      title: "NSE F&O waits for the open",
      body: "Index futures and options are not a weekend job. Flatten leftover NSE delta in the cash session. Not an order.",
      urgency: "watch",
    });
    cards.push({
      id: "crypto-closed",
      sleeve: "Crypto",
      stance: "Neutral",
      title: "Overnight farm is crypto-only",
      body: "BTC/ETH/SOL paper clips are the night job. This is paper. Kite stays off. Not an order.",
      urgency: "session",
    });
    cards.push({
      id: "fx-closed",
      sleeve: "FX",
      stance: "Neutral",
      title: "USDINR sits overnight",
      body: "Rupee pair is a hedge, not a punch, while NSE is shut. Not an order.",
      urgency: "watch",
    });
    cards.push({
      id: "cmd-closed",
      sleeve: "Commodity",
      stance: "Neutral",
      title: "Gold is ballast",
      body: "MCX gold can sit. Do not start a new crude clip from a closed cash tape. Not an order.",
      urgency: "watch",
    });
  } else if (m.regime === "Stress") {
    cards.push({
      id: "spot-1",
      sleeve: "Spot",
      stance: "Reduce",
      title: "Cut equity beta",
      body: "India VIX is elevated. Fresh cash longs wait. Existing quality names can sit; do not add cyclical beta. Not an order.",
      urgency: "now",
    });
    cards.push({
      id: "fut-1",
      sleeve: "Futures",
      stance: "Short",
      title: "Index futures only as a hedge",
      body: "If the book is long delta, a small Nifty/Bank Nifty short is a hedge, not a view. Size to leftover delta, not conviction. Not an order.",
      urgency: "session",
    });
    cards.push({
      id: "opt-1",
      sleeve: "Options",
      stance: "Harvest",
      title: "Prefer long gamma",
      body: "Wide daily ranges pay the ½ Γ (ΔS)² term if you flatten leftover delta. Avoid naked short vol. Not an order.",
      urgency: "now",
    });
    cards.push({
      id: "crypto-1",
      sleeve: "Crypto",
      stance: "Reduce",
      title: "Cut crypto size",
      body: "Weekend gaps and thin books. BTC is collateral, not a hero trade. Delta paper only. Not an order.",
      urgency: "now",
    });
    cards.push({
      id: "fx-1",
      sleeve: "FX",
      stance: "Long",
      title: "USDINR as a rupee hedge",
      body: "Stress in equities often prints a firmer dollar. A small USDINR long is a hedge, not a view. Not an order.",
      urgency: "session",
    });
    cards.push({
      id: "cmd-1",
      sleeve: "Commodity",
      stance: "Long",
      title: "Gold over crude",
      body: "MCX gold is the defensive sleeve. Crude stays a tape, not a core hold, while VIX is up. Not an order.",
      urgency: "session",
    });
  } else if (m.regime === "Elevated") {
    cards.push({
      id: "spot-1",
      sleeve: "Spot",
      stance: "Neutral",
      title: "Hold quality, skip chase",
      body: promoted
        ? "Tape is two-sided. Add only where five-factor score still clears Buy and paper meta is promoted. Not an order."
        : "Tape is two-sided. Factor Buy is not a paper-model size. Meta is not promoted — do not work a 0.55 gate. Not an order.",
      urgency: "session",
    });
    cards.push({
      id: "fut-1",
      sleeve: "Futures",
      stance: "Neutral",
      title: "No naked index direction",
      body: "Use futures to flatten gamma-scalp leftover delta, not to express a new index view. Not an order.",
      urgency: "watch",
    });
    cards.push({
      id: "opt-1",
      sleeve: "Options",
      stance: "Long",
      title: "Defined-risk structures",
      body: "Debit spreads over naked calls. Time decay still bites. Not an order.",
      urgency: "session",
    });
    cards.push({
      id: "crypto-1",
      sleeve: "Crypto",
      stance: "Neutral",
      title: "BTC only, skip alts",
      body: "ETH/SOL wait. One BTC clip if heat is under the cap. Not an order.",
      urgency: "watch",
    });
    cards.push({
      id: "fx-1",
      sleeve: "FX",
      stance: "Neutral",
      title: "Fade G10 chase",
      body: "EURUSD and GBPUSD stay inside the London overlap. No overnight yen heroics. Not an order.",
      urgency: "watch",
    });
    cards.push({
      id: "cmd-1",
      sleeve: "Commodity",
      stance: "Neutral",
      title: "Gold holds, silver waits",
      body: "MCX gold can sit. Silver and natgas are too whippy for a new clip. Not an order.",
      urgency: "session",
    });
  } else {
    cards.push({
      id: "spot-1",
      sleeve: "Spot",
      stance: promoted ? "Long" : "Neutral",
      title: promoted ? "Buy quality on dips" : "Quality sits until promote",
      body: promoted
        ? "Calm regime. Five-factor Buy names with a promoted paper model can be worked in cash. Heat still capped. Not an order."
        : "Calm regime. Five-factor labels can sit. Paper model is not promoted — do not treat Book Buy as model-backed and do not work a 0.55 gate. Keep farming. Not an order.",
      urgency: "session",
    });
    cards.push({
      id: "fut-1",
      sleeve: "Futures",
      stance: "Long",
      title: "Index longs only with a stop",
      body: "Nifty futures are allowed as a tactical overlay if daily loss and heat gates are clear. Flatten 15 minutes before close. Not an order.",
      urgency: "watch",
    });
    cards.push({
      id: "opt-1",
      sleeve: "Options",
      stance: "Neutral",
      title: "Do not overpay for vol",
      body: "Low VIX makes long gamma expensive versus realised. Prefer cash or small calendars. Not an order.",
      urgency: "watch",
    });
    cards.push({
      id: "crypto-1",
      sleeve: "Crypto",
      stance: "Long",
      title: "BTC / ETH on dips",
      body: "Calm equity vol often coincides with cleaner crypto trend. Paper on Delta. Size vs INR budget, not USD notional. Not an order.",
      urgency: "session",
    });
    cards.push({
      id: "fx-1",
      sleeve: "FX",
      stance: "Neutral",
      title: "USDINR range",
      body: "Rupee pair is a carry sleeve, not a punch. Fade extremes vs the 20-day. Not an order.",
      urgency: "watch",
    });
    cards.push({
      id: "cmd-1",
      sleeve: "Commodity",
      stance: "Long",
      title: "Copper + gold barbell",
      body: "Copper rides the data-center / grid tape. Gold stays the ballast. Crude only with a stop. Not an order.",
      urgency: "session",
    });
  }
  if (m.pcr < 0.8) {
    cards.push({
      id: "oi-1",
      sleeve: "Book",
      stance: "Reduce",
      title: "Put-call ratio is thin",
      body: `PCR at ${m.pcr.toFixed(2)} — call-heavy open interest. Fade chase, do not join it. Not an order.`,
      urgency: "session",
    });
  }
  return cards;
}

export function istSession(now = new Date()): MarketState["session"] {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const d = ist.getUTCDay();
  if (d === 0 || d === 6) return "weekend";
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (m < 9 * 60 + 15) return "pre";
  if (m > 15 * 60 + 30) return "post";
  return "open";
}
