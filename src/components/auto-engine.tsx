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
  const book = await setPaperFlags({ data: { mode } });
  useDesk.getState().hydratePaper(book);
}

export async function setDeskKilled(killed: boolean) {
  const book = await setPaperFlags({ data: { killed } });
  useDesk.getState().hydratePaper(book);
}

export async function resetDeskPaper() {
  const book = await resetPaperBook();
  useDesk.getState().hydratePaper(book);
}
