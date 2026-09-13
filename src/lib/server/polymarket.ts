/**
 * Public Polymarket Gamma + CLOB. No wallet. No CLOB order.
 * Cache 3s. Tag feed `polymarket`.
 */
import {
  PRED_CACHE_MS,
  PRED_COPY,
  applyQuoteHealth,
  btc5mSlugCandidates,
  emptyPredQuote,
  jsonList,
  parseGammaEvent,
  pricesSumOk,
  tokenIdsForYesNo,
  windowStartUnix,
  wouldBuy,
  type PredQuote,
} from "@/lib/meridian/pred-orb";

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

type Cache = { at: number; quote: PredQuote };
let cache: Cache | null = null;

async function getJson(url: string, ms = 4000): Promise<unknown> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function clobMid(tokenId: string): Promise<number | null> {
  if (!tokenId) return null;
  const j = (await getJson(`${CLOB}/midpoint?token_id=${encodeURIComponent(tokenId)}`)) as {
    mid?: string;
  } | null;
  const n = Number(j?.mid);
  return n > 0 && n < 1.5 ? n : null;
}

async function clobPrice(tokenId: string, side: "buy" | "sell"): Promise<number | null> {
  if (!tokenId) return null;
  const j = (await getJson(`${CLOB}/price?token_id=${encodeURIComponent(tokenId)}&side=${side}`)) as {
    price?: string;
  } | null;
  const n = Number(j?.price);
  return n > 0 && n < 1.5 ? n : null;
}

async function eventBySlug(slug: string): Promise<unknown> {
  return getJson(`${GAMMA}/events?slug=${encodeURIComponent(slug)}`);
}

async function searchBtc5m(): Promise<unknown> {
  const q = encodeURIComponent("Bitcoin Up or Down 5");
  return getJson(`${GAMMA}/events?active=true&closed=false&limit=20&q=${q}`);
}

function firstEvent(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (raw && typeof raw === "object" && Array.isArray((raw as { events?: unknown[] }).events)) {
    return (raw as { events: unknown[] }).events[0];
  }
  if (raw && typeof raw === "object" && (raw as { slug?: string }).slug) return raw;
  return null;
}

async function enrichClob(q: PredQuote, raw: unknown): Promise<PredQuote> {
  if (q.ok && q.yes != null && q.no != null) return q;
  const ev = firstEvent(raw);
  if (!ev || typeof ev !== "object") return q;
  const rec = ev as Record<string, unknown>;
  const markets = Array.isArray(rec.markets) ? rec.markets : [rec];
  const m0 = markets[0] as Record<string, unknown> | undefined;
  if (!m0) return q;
  const tokens = jsonList(m0.clobTokenIds);
  const outcomes = jsonList(m0.outcomes ?? rec.outcomes);
  const { yes: yesTok, no: noTok } = tokenIdsForYesNo(outcomes, tokens);
  const yes = yesTok ? await clobMid(yesTok) : q.yes;
  const no = noTok ? await clobMid(noTok) : q.no;
  const yesBid = yesTok ? await clobPrice(yesTok, "sell") : null;
  const yesAsk = yesTok ? await clobPrice(yesTok, "buy") : null;
  const noBid = noTok ? await clobPrice(noTok, "sell") : null;
  const noAsk = noTok ? await clobPrice(noTok, "buy") : null;
  const next = {
    ...q,
    yes: yes ?? q.yes,
    no: no ?? q.no,
    yesBid,
    yesAsk,
    noBid,
    noAsk,
    would: wouldBuy(yes ?? q.yes, no ?? q.no),
    note: pricesSumOk(yes ?? q.yes, no ?? q.no) ? PRED_COPY : q.note,
  };
  return applyQuoteHealth(next, 0);
}

async function loadWindow(windowStart: number, now: number): Promise<{ parsed: PredQuote | null; raw: unknown }> {
  let parsed: PredQuote | null = null;
  let raw: unknown = null;
  for (const slug of btc5mSlugCandidates(windowStart)) {
    raw = await eventBySlug(slug);
    parsed = parseGammaEvent(raw, now);
    if (parsed && (parsed.ok || parsed.slug || parsed.resolved)) return { parsed, raw };
    parsed = null;
  }
  return { parsed, raw };
}

export async function fetchBtc5mQuoteAt(windowStart: number, now = Date.now()): Promise<PredQuote> {
  const { parsed, raw } = await loadWindow(windowStart, now);
  let quote = parsed ?? emptyPredQuote();
  quote = await enrichClob(quote, raw);
  if (!quote.ok && !quote.resolved) quote = { ...quote, note: "quote unavailable", stale: true };
  return quote;
}

export async function fetchBtc5mQuote(now = Date.now()): Promise<PredQuote> {
  if (cache && now - cache.at < PRED_CACHE_MS) {
    return applyQuoteHealth(cache.quote, now - cache.at);
  }
  const start = windowStartUnix(Math.floor(now / 1000));
  let { parsed, raw } = await loadWindow(start, now);
  if (!parsed?.ok) {
    raw = await searchBtc5m();
    const list = Array.isArray(raw) ? raw : (raw as { events?: unknown[] })?.events ?? [];
    const hit = (list as Record<string, unknown>[]).find((e) => {
      const slug = String(e.slug ?? "");
      return slug.includes("btc") && (slug.includes(`5m-${start}`) || slug.includes(`5-minute-windows-${start}`) || slug.includes(`5-minute-${start}`));
    });
    if (hit) parsed = parseGammaEvent(hit, now);
  }
  let quote = parsed ?? emptyPredQuote();
  quote = await enrichClob(quote, raw);
  quote = applyQuoteHealth(quote, 0);
  if (quote.ok || quote.quoteHealth === "bundle_gap") {
    cache = { at: now, quote };
    return quote;
  }
  if (cache) return applyQuoteHealth(cache.quote, now - cache.at);
  return { ...quote, note: "quote unavailable", quoteHealth: "unavailable", stale: true, ok: false };
}

export function peekPredCache(now = Date.now()): PredQuote | null {
  if (!cache) return null;
  return applyQuoteHealth(cache.quote, now - cache.at);
}
