import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarket } from "@/lib/server/desk";
import { useDesk } from "@/lib/desk-store";

export function QuotesHydrator() {
  const applyQuotes = useDesk((s) => s.applyQuotes);
  const q = useQuery({
    queryKey: ["market"],
    queryFn: () => getMarket(),
    refetchInterval: 45_000,
    staleTime: 20_000,
  });

  useEffect(() => {
    if (!q.data?.quotes) return;
    applyQuotes(q.data.quotes, { asOf: q.data.asOf, source: q.data.source });
  }, [q.data, applyQuotes]);

  return null;
}
