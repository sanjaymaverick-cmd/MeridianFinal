/**
 * IMP-38: fit-sample exclusion. Pure helpers — no fs.
 * The samples jsonl is never rewritten; bad rows are skipped at read time by
 *  (a) rule: short-root / strike-less option symbols (NIFTYCE, HDFCBANKPE, …), and
 *  (b) an optional id list `paper-samples.exclude.jsonl` (one JSON object with `id` per line, or a bare id).
 */
import { isMalformedOption } from "./fo-contracts";

export const SAMPLE_EXCLUDE_FILE = "paper-samples.exclude.jsonl";

export function parseExcludeList(txt: string): Set<string> {
  const ids = new Set<string>();
  for (const raw of String(txt ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("{")) {
      try {
        const o = JSON.parse(line) as { id?: unknown; exclude?: unknown };
        if (o.exclude === false) continue;
        if (typeof o.id === "string" && o.id) ids.add(o.id);
      } catch {
        /* skip bad line */
      }
      continue;
    }
    ids.add(line);
  }
  return ids;
}

export type ExcludeWhy = "short_root_option" | "exclude_list" | null;

export function sampleExcludeReason(row: { id?: unknown; symbol?: unknown }, ids?: Set<string>): ExcludeWhy {
  if (isMalformedOption(String(row.symbol ?? ""))) return "short_root_option";
  const id = typeof row.id === "string" ? row.id : "";
  if (id && ids?.has(id)) return "exclude_list";
  return null;
}

export function isExcludedSample(row: { id?: unknown; symbol?: unknown }, ids?: Set<string>): boolean {
  return sampleExcludeReason(row, ids) != null;
}
