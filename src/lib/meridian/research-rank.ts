import { UNIVERSE } from "./universe";
import {
  rankFromUniverse,
  researchAnswer,
  type RankedName,
  type ResearchAnswer,
  type ResearchRank,
} from "./research-rank-core";

export type { RankedName, ResearchAnswer, ResearchRank };

export function rankResearch(query: string): ResearchRank {
  return rankFromUniverse(query, UNIVERSE);
}

/** Rank against the modelled universe. Grok symbols that miss the rank are dropped. */
export function answerResearch(query: string, grokSymbols?: readonly string[] | null): ResearchAnswer {
  return researchAnswer(query, UNIVERSE, grokSymbols);
}
