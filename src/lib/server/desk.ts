import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { UNIVERSE, detectRegime } from "@/lib/meridian/universe";
import { buildAdvice, istSession, type MarketState } from "@/lib/meridian/advice";
import { parseHoldingsCsv, type HoldingRow } from "@/lib/meridian/portfolio";
import { seedTestDeskUser } from "@/lib/server/seed-test-user";
import { getHistoryBars, getLiveBook, overlayName, type LiveQuote } from "@/lib/server/quotes";
import { listBinanceLive } from "@/lib/server/binance-catalog";
import { SNAPSHOT } from "@/lib/meridian/tickers";
import { rankResearch } from "@/lib/meridian/research-rank";
import { getArtefact } from "@/lib/meridian/artefact";
import { z } from "zod";

function q(book: Awaited<ReturnType<typeof getLiveBook>>, sym: string, fallback: number) {
  return book.quotes[sym] ?? { last: fallback, chg: 0, prev: fallback };
}

export const getMarket = createServerFn({ method: "GET" }).handler(async () => {
  await seedTestDeskUser();
  const book = await getLiveBook();
  const nifty = q(book, "NIFTY", SNAPSHOT.NIFTY ?? 24252);
  const bank = q(book, "BANKNIFTY", SNAPSHOT.BANKNIFTY ?? 57762);
  const vix = q(book, "INDIAVIX", SNAPSHOT.INDIAVIX ?? 11.2);
  const btc = q(book, "BTC", SNAPSHOT.BTC ?? 77205);
  const gold = q(book, "GOLD", SNAPSHOT.GOLD ?? 158360);
  const usdinr = q(book, "USDINR", SNAPSHOT.USDINR ?? 95.685);
  const crude = q(book, "CRUDE", SNAPSHOT.CRUDE ?? 8311);
  const regime = detectRegime(vix.last, nifty.chg);
  const state: MarketState = {
    nifty: nifty.last,
    niftyChg: nifty.chg,
    bankNifty: bank.last,
    bankChg: bank.chg,
    indiaVix: vix.last,
    pcr: 0.92,
    btc: btc.last,
    btcChg: btc.chg,
    gold: gold.last,
    goldChg: gold.chg,
    usdinr: usdinr.last,
    usdinrChg: usdinr.chg,
    crude: crude.last,
    crudeChg: crude.chg,
    regime,
    session: istSession(),
    asOf: book.asOf,
    source: book.source,
  };
  const quotes: Record<string, LiveQuote> = book.quotes;
  const names = UNIVERSE.map((u) => overlayName(u, quotes[u.symbol]));
  const binance =
    book.binance?.length
      ? book.binance
      : (await listBinanceLive()).map((r) => ({ symbol: r.symbol, pair: r.pair, last: r.last, chg: r.chg, vol: r.vol }));
  const art = getArtefact();
  return {
    state,
    advice: buildAdvice(state, { promoted: art.promoted, n: art.n }),
    quotes,
    names,
    binance,
    asOf: book.asOf,
    source: book.source,
    ok: book.ok,
    fail: book.fail,
    meta: {
      n: art.n,
      auc: art.auc,
      hitRate: art.hitRate,
      promoted: art.promoted,
      source: art.source,
    },
  };
});

export const getHistory = createServerFn({ method: "GET" })
  .validator((input: { symbol: string; range?: "1mo" | "3mo" | "1y" | "5y" }) => input)
  .handler(async ({ data }) => getHistoryBars(data.symbol.toUpperCase(), data.range ?? "1y"));

export const getPaperBook = createServerFn({ method: "GET" }).handler(async () => {
  const { snapshotBook, startPaperEngine } = await import("@/lib/server/paper-engine");
  startPaperEngine();
  return snapshotBook();
});

export const setPaperFlags = createServerFn({ method: "POST" })
  .validator((input: { mode?: "advisory" | "paper" | "auto"; killed?: boolean }) => input)
  .handler(async ({ data }) => {
    const { setEngineFlags } = await import("@/lib/server/paper-engine");
    return setEngineFlags(data);
  });

export const resetPaperBook = createServerFn({ method: "POST" }).handler(async () => {
  const { resetEngine } = await import("@/lib/server/paper-engine");
  return resetEngine();
});

export const flattenPaperBook = createServerFn({ method: "POST" }).handler(async () => {
  const { flattenEngine } = await import("@/lib/server/paper-engine");
  return flattenEngine();
});

export const flattenPaperClip = createServerFn({ method: "POST" })
  .validator((input: { symbol: string }) => input)
  .handler(async ({ data }) => {
    const { flattenClip } = await import("@/lib/server/paper-engine");
    return flattenClip(data.symbol);
  });

export const approvePaperPending = createServerFn({ method: "POST" })
  .validator((input: { id: string; sizePct?: number }) => input)
  .handler(async ({ data }) => {
    const { approvePending } = await import("@/lib/server/paper-engine");
    return approvePending(data.id, data.sizePct);
  });

export const skipPaperPending = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { skipPending } = await import("@/lib/server/paper-engine");
    return skipPending(data.id);
  });

export const setPaperBlock = createServerFn({ method: "POST" })
  .validator((input: { symbol: string; blocked: boolean }) => input)
  .handler(async ({ data }) => {
    const { setBlocked } = await import("@/lib/server/paper-engine");
    return setBlocked(data.symbol, data.blocked);
  });

export const setPaperWatch = createServerFn({ method: "POST" })
  .validator((input: { symbol: string; watch: boolean }) => input)
  .handler(async ({ data }) => {
    const { setWatched } = await import("@/lib/server/paper-engine");
    return setWatched(data.symbol, data.watch);
  });

export const queuePaperHedge = createServerFn({ method: "POST" })
  .validator((input: { symbol: string; note: string; from?: string }) => input)
  .handler(async ({ data }) => {
    const { queueHedge } = await import("@/lib/server/paper-engine");
    return queueHedge(data.symbol, data.note, data.from ?? "greeks");
  });

export const dismissPaperHedge = createServerFn({ method: "POST" }).handler(async () => {
  const { dismissHedge } = await import("@/lib/server/paper-engine");
  return dismissHedge();
});

export const getPaperSamples = createServerFn({ method: "GET" }).handler(async () => {
  const { listSamples } = await import("@/lib/server/paper-engine");
  return listSamples(800);
});

export const saveHoldings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { rows: HoldingRow[] }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from holdings where user_id = ${context.userId}`;
    for (const r of data.rows) {
      await sql`
        insert into holdings (user_id, symbol, company_name, qty, avg_cost, last_price, instrument, account_name)
        values (${context.userId}, ${r.symbol}, ${r.companyName}, ${r.qty}, ${r.avgCost}, ${r.lastPrice}, ${r.instrument}, ${r.accountName})
      `;
    }
    return { ok: true as const, n: data.rows.length };
  });

export const loadHoldings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      symbol: string;
      company_name: string;
      qty: number;
      avg_cost: number;
      last_price: number;
      instrument: string;
      account_name: string;
    }>`
      select symbol, company_name, qty, avg_cost, last_price, instrument, account_name
      from holdings where user_id = ${context.userId} order by id
    `;
    return rows.map((r) => ({
      symbol: r.symbol,
      companyName: r.company_name,
      qty: Number(r.qty),
      avgCost: Number(r.avg_cost),
      lastPrice: Number(r.last_price),
      instrument: r.instrument,
      accountName: r.account_name,
    })) satisfies HoldingRow[];
  });

export const parseCsvFn = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => input)
  .handler(async ({ data }) => parseHoldingsCsv(data.text));

const researchSchema = z.object({ query: z.string().min(8).max(400) });

export type ResearchName = {
  symbol: string;
  name: string;
  sector: string;
  score: number;
  why: string;
  risk: string;
  sleeve: string;
};

export const runResearch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => researchSchema.parse(input))
  .handler(async ({ context, data }) => {
    const catalog = UNIVERSE.map((u) => ({
      symbol: u.symbol,
      name: u.name,
      sector: u.sector,
      themes: u.themes,
      thesis: u.thesis,
    }));
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return heuristicResearch(data.query);
    }
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 900,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are Meridian Final's Indian-equity research desk. Return ONLY JSON: {\"names\":[{\"symbol\",\"name\",\"sector\",\"score\",\"why\",\"risk\",\"sleeve\"}],\"reason\":\"\"}. Use ONLY symbols from the provided universe. If the query does not match those names, return {\"names\":[],\"reason\":\"No names in the desk universe match that question.\"}. Never pad with unrelated banks or IT. score 0-10. sleeve is Spot|Futures|Options|Crypto|FX|Commodity. Keep why/risk to two sentences. Not investment advice. Max 6 names.",
          },
          {
            role: "user",
            content: `Query: ${data.query}\nUniverse: ${JSON.stringify(catalog)}`,
          },
        ],
      }),
    });
    if (!res.ok) return heuristicResearch(data.query);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    const json = extractJson(text);
    const allowed = new Set(UNIVERSE.map((u) => u.symbol));
    const names = ((json?.names ?? []) as ResearchName[]).filter((n) => allowed.has(n.symbol));
    if (!names.length) {
      return {
        ok: true as const,
        source: "grok" as const,
        names: [],
        reason: json && Array.isArray(json.names) ? "No names in the desk universe match that question. Refusing a canned shortlist." : "Grok returned no matching names.",
      };
    }
    const sql = await getSql();
    await sql`
      insert into research_runs (user_id, query, result_json)
      values (${context.userId}, ${data.query}, ${JSON.stringify(names)})
    `;
    return { ok: true as const, source: "grok" as const, names: names.slice(0, 6), reason: "Ranked from the desk universe." };
  });

function extractJson(text: string): { names?: ResearchName[]; reason?: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as { names?: ResearchName[] };
  } catch {
    return null;
  }
}

function heuristicResearch(query: string) {
  const ranked = rankResearch(query, UNIVERSE);
  return { ok: true as const, source: "desk" as const, names: ranked.names, reason: ranked.reason };
}
