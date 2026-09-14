import type { Regime } from "./scoring";
import { endWithNotAnOrder } from "./operator-copy";

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

export function buildAdvice(m: MarketState, ctx?: { promoted?: boolean }): AdviceCard[] {
  const cards: AdviceCard[] = [];
  const promoted = !!ctx?.promoted;
  const weekend = m.session === "weekend" || m.session === "pre" || m.session === "post";
  if (m.regime === "Stress") {
    cards.push({
      id: "spot-1",
      sleeve: "Spot",
      stance: "Reduce",
      title: "Cut equity beta",
      body: endWithNotAnOrder("India VIX is elevated. Fresh cash longs wait. Existing quality names can sit; do not add cyclical beta."),
      urgency: "now",
    });
    cards.push({
      id: "fut-1",
      sleeve: "Futures",
      stance: "Short",
      title: "Index futures only as a hedge",
      body: endWithNotAnOrder("If the book is long delta, a small Nifty/Bank Nifty short is a hedge, not a view. Size to leftover delta, not conviction."),
      urgency: "session",
    });
    cards.push({
      id: "opt-1",
      sleeve: "Options",
      stance: "Harvest",
      title: "Prefer long gamma",
      body: endWithNotAnOrder("Wide daily ranges pay the ½ Γ (ΔS)² term if you flatten leftover delta. Avoid naked short vol."),
      urgency: "now",
    });
    cards.push({
      id: "crypto-1",
      sleeve: "Crypto",
      stance: "Reduce",
      title: "Cut crypto size",
      body: endWithNotAnOrder("Weekend gaps and thin books. BTC is collateral, not a hero trade. Delta paper only."),
      urgency: "now",
    });
    cards.push({
      id: "fx-1",
      sleeve: "FX",
      stance: "Long",
      title: "USDINR as a rupee hedge",
      body: endWithNotAnOrder("Stress in equities often prints a firmer dollar. A small USDINR long is a hedge, not a view."),
      urgency: "session",
    });
    cards.push({
      id: "cmd-1",
      sleeve: "Commodity",
      stance: "Long",
      title: "Gold over crude",
      body: endWithNotAnOrder("MCX gold is the defensive sleeve. Crude stays a tape, not a core hold, while VIX is up."),
      urgency: "session",
    });
  } else if (m.regime === "Elevated") {
    cards.push({
      id: "spot-1",
      sleeve: "Spot",
      stance: "Neutral",
      title: "Hold quality, skip chase",
      body: promoted
        ? endWithNotAnOrder("Tape is two-sided. Add only where five-factor score still clears Buy and meta-prob is above 0.55.")
        : endWithNotAnOrder("Tape is two-sided, but the paper model is not promoted. Do not treat Book Buy as model-backed. Farm clips only."),
      urgency: "session",
    });
    cards.push({
      id: "fut-1",
      sleeve: "Futures",
      stance: "Neutral",
      title: "No naked index direction",
      body: endWithNotAnOrder("Use futures to flatten gamma-scalp leftover delta, not to express a new index view."),
      urgency: "watch",
    });
    cards.push({
      id: "opt-1",
      sleeve: "Options",
      stance: "Long",
      title: "Defined-risk structures",
      body: endWithNotAnOrder("Debit spreads over naked calls. Time decay still bites."),
      urgency: "session",
    });
    cards.push({
      id: "crypto-1",
      sleeve: "Crypto",
      stance: "Neutral",
      title: "BTC only, skip alts",
      body: endWithNotAnOrder("ETH/SOL wait. One BTC clip if heat is under the cap."),
      urgency: "watch",
    });
    cards.push({
      id: "fx-1",
      sleeve: "FX",
      stance: "Neutral",
      title: "Fade G10 chase",
      body: endWithNotAnOrder("EURUSD and GBPUSD stay inside the London overlap. No overnight yen heroics."),
      urgency: "watch",
    });
    cards.push({
      id: "cmd-1",
      sleeve: "Commodity",
      stance: "Neutral",
      title: "Gold holds, silver waits",
      body: endWithNotAnOrder("MCX gold can sit. Silver and natgas are too whippy for a new clip."),
      urgency: "session",
    });
  } else {
    cards.push({
      id: "spot-1",
      sleeve: "Spot",
      stance: "Long",
      title: "Buy quality on dips",
      body: promoted
        ? endWithNotAnOrder("Calm regime. Five-factor Buy names with meta above 0.55 can be worked in cash. Heat still capped.")
        : endWithNotAnOrder("Calm tape, but the paper model is not promoted. Do not treat Book Buy as model-backed. Farm clips only."),
      urgency: "session",
    });
    cards.push({
      id: "fut-1",
      sleeve: "Futures",
      stance: weekend ? "Neutral" : "Long",
      title: weekend ? "Cash session closed" : "Index longs only with a stop",
      body: weekend
        ? endWithNotAnOrder("Cash session is closed. No NSE futures overlay until the next open. Crypto farm only.")
        : endWithNotAnOrder("Nifty futures are allowed as a tactical overlay if daily loss and heat gates are clear. Flatten 15 minutes before close."),
      urgency: "watch",
    });
    cards.push({
      id: "opt-1",
      sleeve: "Options",
      stance: "Neutral",
      title: "Do not overpay for vol",
      body: endWithNotAnOrder("Low VIX makes long gamma expensive versus realised. Prefer cash or small calendars."),
      urgency: "watch",
    });
    cards.push({
      id: "crypto-1",
      sleeve: "Crypto",
      stance: "Long",
      title: "BTC / ETH on dips",
      body: endWithNotAnOrder("Calm equity vol often coincides with cleaner crypto trend. Paper on Delta. Size vs INR budget, not USD notional."),
      urgency: "session",
    });
    cards.push({
      id: "fx-1",
      sleeve: "FX",
      stance: "Neutral",
      title: "USDINR range",
      body: endWithNotAnOrder("Rupee pair is a carry sleeve, not a punch. Fade extremes vs the 20-day."),
      urgency: "watch",
    });
    cards.push({
      id: "cmd-1",
      sleeve: "Commodity",
      stance: "Long",
      title: "Copper + gold barbell",
      body: endWithNotAnOrder("Copper rides the data-center / grid tape. Gold stays the ballast. Crude only with a stop."),
      urgency: "session",
    });
  }
  if (m.pcr < 0.8) {
    cards.push({
      id: "oi-1",
      sleeve: "Book",
      stance: "Reduce",
      title: "Put-call ratio is thin",
      body: endWithNotAnOrder(`PCR at ${m.pcr.toFixed(2)} — call-heavy open interest. Fade chase, do not join it.`),
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
