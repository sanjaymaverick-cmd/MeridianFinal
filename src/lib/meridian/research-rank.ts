import { UNIVERSE } from "./universe";
import { rankFromUniverse, type RankedName, type ResearchRank } from "./research-rank-core";

export type { RankedName, ResearchRank };

export function rankResearch(query: string): ResearchRank {
  return rankFromUniverse(query, UNIVERSE);
}
