/** Desk symbol → Yahoo / Binance ticker. NSE archives 403 here; Binance.com is geo-blocked — vision data API works. */

import { parseFo } from "./fo-contracts";

export const TROY_OZ_G = 31.1034768;
export const MCX_GOLD_PREMIUM = 1.1;
export const BINANCE_API = "https://data-api.binance.vision";

export type YahooKind = "equity" | "index" | "crypto" | "fx" | "comex" | "futures" | "options";

export type TickerMap = {
  yahoo: string;
  kind: YahooKind;
  feed?: "yahoo" | "binance" | "binance-fut" | "derived";
  binance?: string;
  convert?: "gold10g" | "silverKg" | "crudeInr" | "copperKg" | "gasInr" | "plat10g";
  underlier?: string;
};

const binance = (pair: string, yahoo: string): TickerMap => ({
  yahoo,
  kind: "crypto",
  feed: "binance",
  binance: pair,
});

export const TICKERS: Record<string, TickerMap> = {
  NIFTY: { yahoo: "^NSEI", kind: "index" },
  BANKNIFTY: { yahoo: "^NSEBANK", kind: "index" },
  INDIAVIX: { yahoo: "^INDIAVIX", kind: "index" },
  SENSEX: { yahoo: "^BSESN", kind: "index" },
  FINNIFTY: { yahoo: "NIFTY_FIN_SERVICE.NS", kind: "index" },

  BTC: binance("BTCUSDT", "BTC-USD"),
  ETH: binance("ETHUSDT", "ETH-USD"),
  BNB: binance("BNBUSDT", "BNB-USD"),
  SOL: binance("SOLUSDT", "SOL-USD"),
  XRP: binance("XRPUSDT", "XRP-USD"),
  DOGE: binance("DOGEUSDT", "DOGE-USD"),
  ADA: binance("ADAUSDT", "ADA-USD"),
  AVAX: binance("AVAXUSDT", "AVAX-USD"),
  DOT: binance("DOTUSDT", "DOT-USD"),
  LINK: binance("LINKUSDT", "LINK-USD"),
  SUI: binance("SUIUSDT", "SUI-USD"),
  NEAR: binance("NEARUSDT", "NEAR-USD"),
  APT: binance("APTUSDT", "APT-USD"),
  ARB: binance("ARBUSDT", "ARB-USD"),
  OP: binance("OPUSDT", "OP-USD"),
  LTC: binance("LTCUSDT", "LTC-USD"),
  BCH: binance("BCHUSDT", "BCH-USD"),
  TRX: binance("TRXUSDT", "TRX-USD"),
  FIL: binance("FILUSDT", "FIL-USD"),
  ATOM: binance("ATOMUSDT", "ATOM-USD"),
  UNI: binance("UNIUSDT", "UNI-USD"),
  AAVE: binance("AAVEUSDT", "AAVE-USD"),
  INJ: binance("INJUSDT", "INJ-USD"),
  TIA: binance("TIAUSDT", "TIA-USD"),
  FET: binance("FETUSDT", "FET-USD"),
  RENDER: binance("RENDERUSDT", "RENDER-USD"),
  TAO: binance("TAOUSDT", "TAO-USD"),
  HBAR: binance("HBARUSDT", "HBAR-USD"),
  XLM: binance("XLMUSDT", "XLM-USD"),
  ETC: binance("ETCUSDT", "ETC-USD"),
  ICP: binance("ICPUSDT", "ICP-USD"),
  ONDO: binance("ONDOUSDT", "ONDO-USD"),
  WLD: binance("WLDUSDT", "WLD-USD"),
  PEPE: binance("PEPEUSDT", "PEPE-USD"),
  SHIB: binance("SHIBUSDT", "SHIB-USD"),
  TON: binance("TONUSDT", "TON-USD"),
  SEI: binance("SEIUSDT", "SEI-USD"),
  RUNE: binance("RUNEUSDT", "RUNE-USD"),
  MKR: binance("MKRUSDT", "MKR-USD"),
  ENA: binance("ENAUSDT", "ENA-USD"),
  PAXG: binance("PAXGUSDT", "PAXG-USD"),

  USDINR: { yahoo: "INR=X", kind: "fx" },
  EURUSD: { yahoo: "EURUSD=X", kind: "fx" },
  GBPUSD: { yahoo: "GBPUSD=X", kind: "fx" },
  USDJPY: { yahoo: "USDJPY=X", kind: "fx" },
  AUDUSD: { yahoo: "AUDUSD=X", kind: "fx" },
  NZDUSD: { yahoo: "NZDUSD=X", kind: "fx" },
  USDCAD: { yahoo: "USDCAD=X", kind: "fx" },
  USDCHF: { yahoo: "USDCHF=X", kind: "fx" },
  EURJPY: { yahoo: "EURJPY=X", kind: "fx" },
  GBPJPY: { yahoo: "GBPJPY=X", kind: "fx" },
  EURGBP: { yahoo: "EURGBP=X", kind: "fx" },
  EURINR: { yahoo: "EURINR=X", kind: "fx" },
  GBPINR: { yahoo: "GBPINR=X", kind: "fx" },
  JPYINR: { yahoo: "JPYINR=X", kind: "fx" },
  USDCNH: { yahoo: "CNH=X", kind: "fx" },

  GOLD: { yahoo: "GC=F", kind: "comex", convert: "gold10g" },
  SILVER: { yahoo: "SI=F", kind: "comex", convert: "silverKg" },
  CRUDE: { yahoo: "CL=F", kind: "comex", convert: "crudeInr" },
  BRENT: { yahoo: "BZ=F", kind: "comex", convert: "crudeInr" },
  COPPER: { yahoo: "HG=F", kind: "comex", convert: "copperKg" },
  NATGAS: { yahoo: "NG=F", kind: "comex", convert: "gasInr" },
  PLATINUM: { yahoo: "PL=F", kind: "comex", convert: "plat10g" },
  PALLADIUM: { yahoo: "PA=F", kind: "comex", convert: "copperKg" },
  WHEAT: { yahoo: "ZW=F", kind: "comex" },
  CORN: { yahoo: "ZC=F", kind: "comex" },
  COTTON: { yahoo: "CT=F", kind: "comex" },
  COFFEE: { yahoo: "KC=F", kind: "comex" },
  COCOA: { yahoo: "CC=F", kind: "comex" },
  SOY: { yahoo: "ZS=F", kind: "comex" },

  NIFTYFUT: { yahoo: "^NSEI", kind: "futures", feed: "derived", underlier: "NIFTY" },
  BANKNIFTYFUT: { yahoo: "^NSEBANK", kind: "futures", feed: "derived", underlier: "BANKNIFTY" },
  FINNIFTYFUT: { yahoo: "NIFTY_FIN_SERVICE.NS", kind: "futures", feed: "derived", underlier: "FINNIFTY" },
  SENSEXFUT: { yahoo: "^BSESN", kind: "futures", feed: "derived", underlier: "SENSEX" },
  RELIANCEFUT: { yahoo: "RELIANCE.NS", kind: "futures", feed: "derived", underlier: "RELIANCE" },
  HDFCBANKFUT: { yahoo: "HDFCBANK.NS", kind: "futures", feed: "derived", underlier: "HDFCBANK" },
  TCSFUT: { yahoo: "TCS.NS", kind: "futures", feed: "derived", underlier: "TCS" },
  GOLDFUT: { yahoo: "GC=F", kind: "futures", feed: "derived", underlier: "GOLD" },
  CRUDEFUT: { yahoo: "CL=F", kind: "futures", feed: "derived", underlier: "CRUDE" },
  BTCPERP: { yahoo: "BTC-USD", kind: "futures", feed: "binance-fut", binance: "BTCUSDT" },
  ETHPERP: { yahoo: "ETH-USD", kind: "futures", feed: "binance-fut", binance: "ETHUSDT" },
  SOLPERP: { yahoo: "SOL-USD", kind: "futures", feed: "binance-fut", binance: "SOLUSDT" },
  BTCUSDPERP: { yahoo: "BTC-USD", kind: "futures", feed: "binance-fut", binance: "BTCUSD_PERP" },
  ETHUSDPERP: { yahoo: "ETH-USD", kind: "futures", feed: "binance-fut", binance: "ETHUSD_PERP" },

  NIFTYCE: { yahoo: "^NSEI", kind: "options", feed: "derived", underlier: "NIFTY" },
  NIFTYPE: { yahoo: "^NSEI", kind: "options", feed: "derived", underlier: "NIFTY" },
  BANKNIFTYCE: { yahoo: "^NSEBANK", kind: "options", feed: "derived", underlier: "BANKNIFTY" },
  BANKNIFTYPE: { yahoo: "^NSEBANK", kind: "options", feed: "derived", underlier: "BANKNIFTY" },
  RELIANCECE: { yahoo: "RELIANCE.NS", kind: "options", feed: "derived", underlier: "RELIANCE" },
  RELIANCEPE: { yahoo: "RELIANCE.NS", kind: "options", feed: "derived", underlier: "RELIANCE" },
  HDFCBANKCE: { yahoo: "HDFCBANK.NS", kind: "options", feed: "derived", underlier: "HDFCBANK" },
  HDFCBANKPE: { yahoo: "HDFCBANK.NS", kind: "options", feed: "derived", underlier: "HDFCBANK" },
  BTCCM: { yahoo: "BTC-USD", kind: "options", feed: "derived", underlier: "BTC" },
  BTCPE: { yahoo: "BTC-USD", kind: "options", feed: "derived", underlier: "BTC" },
};

export function yahooFor(symbol: string): TickerMap {
  const hit = TICKERS[symbol.toUpperCase()];
  if (hit) return hit;
  const fo = parseFo(symbol);
  if (fo) {
    const und = TICKERS[fo.underlier];
    return {
      yahoo: und?.yahoo ?? `${fo.underlier}.NS`,
      kind: fo.right === "FUT" ? "futures" : "options",
      feed: fo.underlier === "BTC" || fo.underlier === "ETH" || fo.underlier === "SOL" ? "binance-fut" : "derived",
      underlier: fo.underlier,
    };
  }
  return { yahoo: `${symbol.toUpperCase()}.NS`, kind: "equity", feed: "yahoo" };
}

export function convertPx(kind: TickerMap["convert"], usd: number, usdinr: number) {
  if (!kind || !Number.isFinite(usd) || !Number.isFinite(usdinr) || usdinr <= 0) return usd;
  if (kind === "gold10g" || kind === "plat10g") return ((usd * usdinr * 10) / TROY_OZ_G) * MCX_GOLD_PREMIUM;
  if (kind === "silverKg") return (usd * usdinr * 1000) / TROY_OZ_G;
  if (kind === "crudeInr") return usd * usdinr;
  if (kind === "copperKg") return usd * 2.20462262 * usdinr;
  if (kind === "gasInr") return usd * usdinr;
  return usd;
}

export const SNAPSHOT: Record<string, number> = {
  NIFTY: 24252,
  BANKNIFTY: 57762,
  INDIAVIX: 11.2,
  SENSEX: 77538,
  RELIANCE: 1316,
  TCS: 2302,
  INFY: 1121,
  HDFCBANK: 727,
  ICICIBANK: 1420,
  SBIN: 1049,
  BHARTIARTL: 1946,
  ITC: 269.4,
  LT: 4093,
  HINDUNILVR: 2015,
  POLYCAB: 8966,
  KEI: 5528,
  HAVELLS: 1268,
  SIEMENS: 3920,
  ABB: 7424,
  CGPOWER: 867,
  POWERGRID: 272.4,
  NTPC: 340,
  TATAPOWER: 374.3,
  DIXON: 14850,
  KAYNES: 3890,
  SYRMA: 1439,
  THERMAX: 3968,
  BHEL: 413,
  EXIDEIND: 459.6,
  BTC: 77120,
  ETH: 2415,
  SOL: 91.0,
  XRP: 1.379,
  BNB: 675,
  USDINR: 95.685,
  EURUSD: 1.1684,
  GBPUSD: 1.3649,
  USDJPY: 159.02,
  GOLD: 158360,
  SILVER: 214100,
  CRUDE: 8311,
  COPPER: 1389,
  NATGAS: 268,
};
