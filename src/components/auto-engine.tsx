import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPaperBook, resetPaperBook, setPaperFlags } from "@/lib/server/desk";
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
  // Optimistic UI — engine used to force mode=auto on every poll; that is fixed.
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

export async function runDeskOp(data: {
  type: string;
  symbol?: string;
  qty?: number;
  side?: "long" | "short";
  sleeve?: "farm" | "pnl";
}) {
  const { runPaperOp } = await import("@/lib/server/desk");
  try {
    const book = await runPaperOp({ data });
    useDesk.getState().hydratePaper(book);
  } catch (err) {
    console.error("[desk] op failed", err);
    throw err;
  }
}
