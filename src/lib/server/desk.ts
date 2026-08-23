import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { UNIVERSE, detectRegime } from "@/lib/meridian/universe";
import { buildAdvice, istSession, type MarketState } from "@/lib/meridian/advice";
import { parseHoldingsCsv, type HoldingRow } from "@/lib/meridian/portfolio";
import { rankResearch } from "@/lib/meridian/research-rank";
import { getArtefact } from "@/lib/meridian/artefact";
import { seedTestDeskUser } from "@/lib/server/seed-test-user";
import { getHistoryBars, getLiveBook, overlayName, type LiveQuote } from "@/lib/server/quotes";
import { listBinanceLive } from "@/lib/server/binance-catalog";
import { SNAPSHOT } from "@/lib/meridian/tickers";
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
  return {
    state,
    advice: buildAdvice(state, { promoted: getArtefact().promoted }),
    quotes,
    names,
    binance,
    asOf: book.asOf,
    source: book.source,
    ok: book.ok,
    fail: book.fail,
  };
});

export const getHistory = createServerFn({ method: "GET" })
  .validator((input: { symbol: string; range?: "1d" | "5d" | "1mo" | "3mo" | "1y" | "5y" }) => input)
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

export const getPaperSamples = createServerFn({ method: "GET" }).handler(async () => {
  const { listFitSamples } = await import("@/lib/server/paper-engine");
  return listFitSamples(4000);
});

export const runPaperOp = createServerFn({ method: "POST" })
  .validator((input: { type: string; symbol?: string; qty?: number; side?: "long" | "short"; sleeve?: "farm" | "pnl" }) => input)
  .handler(async ({ data }) => {
    const { operatorAction } = await import("@/lib/server/paper-engine");
    if (data.type === "hedge") return operatorAction({ type: "hedge", side: data.side ?? "short", qty: data.qty });
    if (data.type === "open") {
      return operatorAction({
        type: "open",
        symbol: String(data.symbol ?? ""),
        qty: data.qty,
        side: data.side,
        sleeve: data.sleeve,
      });
    }
    const symbol = String(data.symbol ?? "");
    if (data.type === "flatten") return operatorAction({ type: "flatten", symbol });
    if (data.type === "flatten_all") return operatorAction({ type: "flatten_all" });
    if (data.type === "reverse") return operatorAction({ type: "reverse", symbol });
    if (data.type === "skip") return operatorAction({ type: "skip", symbol });
    if (data.type === "block") return operatorAction({ type: "block", symbol });
    if (data.type === "unblock") return operatorAction({ type: "unblock", symbol });
    if (data.type === "watch") return operatorAction({ type: "watch", symbol });
    if (data.type === "unwatch") return operatorAction({ type: "unwatch", symbol });
    throw new Error("Unknown paper op");
  });

export const listResearchHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ query: string; result_json: string; created_at: string }>`
      select query, result_json, created_at from research_runs
      where user_id = ${context.userId}
      order by created_at desc
      limit 12
    `;
    return rows.map((r) => ({
      query: r.query,
      at: r.created_at,
      names: JSON.parse(r.result_json) as ResearchName[],
    }));
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
  next?: string;
  match?: string;
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
              "You are Meridian Final's Indian-equity research desk. Return ONLY JSON: {\"names\":[{\"symbol\",\"name\",\"sector\",\"score\",\"why\",\"risk\",\"sleeve\"}]}. Use ONLY symbols from the provided universe. score 0-10. sleeve is Spot|Futures|Options. Keep why/risk to two sentences. Not investment advice. Max 6 names.",
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
    const names = (json?.names ?? []) as ResearchName[];
    if (!names.length) return heuristicResearch(data.query);
    const sql = await getSql();
    await sql`
      insert into research_runs (user_id, query, result_json)
      values (${context.userId}, ${data.query}, ${JSON.stringify(names)})
    `;
    return { ok: true as const, source: "grok" as const, names: names.slice(0, 6) };
  });

function extractJson(text: string): { names?: ResearchName[] } | null {
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
  const r = rankResearch(query);
  return { ok: true as const, source: "desk" as const, names: r.names, emptyNote: r.emptyNote };
}
