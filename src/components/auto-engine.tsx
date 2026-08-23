import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPaperBook,
  resetPaperBook,
  setPaperFlags,
  flattenPaperBook,
  flattenPaperClip,
  approvePaperPending,
  skipPaperPending,
  setPaperBlock,
  setPaperWatch,
  queuePaperHedge,
  dismissPaperHedge,
} from "@/lib/server/desk";
import { useDesk } from "@/lib/desk-store";

export function AutoEngine() {
  const hydratePaper = useDesk((s) => s.hydratePaper);
  const q = useQuery({
    queryKey: ["paper"],
    queryFn: () => getPaperBook(),
    refetchInterval: 2500,
    staleTime: 800,
  });

  useEffect(() => {
    if (q.data) hydratePaper(q.data);
  }, [q.data, hydratePaper]);

  return null;
}

export async function setDeskMode(mode: "advisory" | "paper" | "auto") {
  useDesk.getState().setMode(mode);
  try {
    const book = await setPaperFlags({ data: { mode } });
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] setMode failed", err);
  }
}

export async function setDeskKilled(killed: boolean) {
  useDesk.getState().setKilled(killed);
  try {
    const book = await setPaperFlags({ data: { killed } });
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] setKilled failed", err);
  }
}

export async function resetDeskPaper() {
  try {
    const book = await resetPaperBook();
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] reset failed", err);
  }
}

export async function flattenDeskPaper() {
  try {
    const book = await flattenPaperBook();
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] flatten failed", err);
  }
}

export async function flattenDeskClip(symbol: string) {
  try {
    const book = await flattenPaperClip({ data: { symbol } });
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] flatten clip failed", err);
  }
}

export async function approveDeskPending(id: string, sizePct?: number) {
  try {
    const book = await approvePaperPending({ data: { id, sizePct } });
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] approve failed", err);
  }
}

export async function skipDeskPending(id: string) {
  try {
    const book = await skipPaperPending({ data: { id } });
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] skip failed", err);
  }
}

export async function blockDeskSymbol(symbol: string, blocked: boolean) {
  try {
    const book = await setPaperBlock({ data: { symbol, blocked } });
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] block failed", err);
  }
}

export async function watchDeskSymbol(symbol: string, watch: boolean) {
  try {
    const book = await setPaperWatch({ data: { symbol, watch } });
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] watch failed", err);
  }
}

export async function queueDeskHedge(symbol: string, note: string, from = "greeks") {
  try {
    const book = await queuePaperHedge({ data: { symbol, note, from } });
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] queue hedge failed", err);
  }
}

export async function dismissDeskHedge() {
  try {
    const book = await dismissPaperHedge();
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] dismiss hedge failed", err);
  }
}
