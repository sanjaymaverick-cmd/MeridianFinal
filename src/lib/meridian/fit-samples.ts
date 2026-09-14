/** Fit-sample download labels (IMP-21). Pure helpers — no fs. */

export type FitSampleSet = "fit" | "contaminated" | "live-db";

export type FitSampleRow = {
  symbol?: string;
  side?: string;
  hold_sec: number;
  fwd_ret?: number;
  reason_close: string;
  quality_hold: boolean;
  contaminated: boolean;
  set: FitSampleSet;
  pnl?: number;
  farm_bucket?: "core" | "tail" | "other";
};

export type FitDownloadSource = "fit-jsonl" | "live-db";

export type FitDownloadSummary = {
  source: FitDownloadSource;
  artefactN: number;
  downloadN: number;
  fitN: number;
  contaminatedN: number;
  qualityHoldN: number;
  jsonlTotalN: number;
  truncated: boolean;
  countsMatchArtefact: boolean;
  /** Null when download row count matches AUC artefact n from the fit jsonl. */
  mismatchLabel: string | null;
  legend: string;
};

export function isContaminatedSample(reasonClose: string, holdSec: number): boolean {
  const reason = String(reasonClose ?? "");
  const hold = Number(holdSec) || 0;
  return reason.includes("time_stop") || hold < 120;
}

export function labelFitSampleRow(input: {
  symbol?: string;
  side?: string;
  hold_sec: number;
  fwd_ret?: number;
  reason_close: string;
  pnl?: number;
  farm_bucket?: "core" | "tail" | "other";
  source: FitDownloadSource;
}): FitSampleRow {
  const hold = Number(input.hold_sec) || 0;
  const reason = String(input.reason_close ?? "");
  const contaminated = isContaminatedSample(reason, hold);
  let set: FitSampleSet;
  if (input.source === "live-db") set = "live-db";
  else set = contaminated ? "contaminated" : "fit";
  return {
    symbol: input.symbol,
    side: input.side,
    hold_sec: hold,
    fwd_ret: input.fwd_ret,
    reason_close: reason,
    quality_hold: hold >= 300,
    contaminated,
    set,
    pnl: input.pnl,
    farm_bucket: input.farm_bucket,
  };
}

export function summarizeFitDownload(opts: {
  rows: FitSampleRow[];
  artefactN: number;
  source: FitDownloadSource;
  /** Full labelled clip count on disk (fit-jsonl), even if download truncated. */
  jsonlTotalN?: number;
}): FitDownloadSummary {
  const downloadN = opts.rows.length;
  let fitN = 0;
  let contaminatedN = 0;
  let qualityHoldN = 0;
  for (const r of opts.rows) {
    if (r.contaminated || r.set === "contaminated") contaminatedN += 1;
    else if (r.set === "fit") fitN += 1;
    else if (r.set === "live-db" && !r.contaminated) fitN += 1;
    if (r.quality_hold) qualityHoldN += 1;
  }
  const jsonlTotalN = opts.jsonlTotalN ?? (opts.source === "fit-jsonl" ? downloadN : 0);
  const truncated = opts.source === "fit-jsonl" && jsonlTotalN > downloadN;
  const artefactN = Number(opts.artefactN) || 0;

  let mismatchLabel: string | null = null;
  let countsMatchArtefact = false;

  if (opts.source === "live-db") {
    mismatchLabel = `mismatch: live DB fallback — not the AUC fit jsonl (artefact n=${artefactN}, download n=${downloadN})`;
  } else if (truncated) {
    mismatchLabel = `mismatch: download truncated ${downloadN} of ${jsonlTotalN} jsonl rows; AUC artefact n=${artefactN}`;
  } else if (artefactN <= 0) {
    mismatchLabel = `mismatch: AUC artefact n=${artefactN} (synth or unset); jsonl n=${jsonlTotalN}`;
  } else if (jsonlTotalN !== artefactN) {
    mismatchLabel = `mismatch: jsonl n=${jsonlTotalN} ≠ AUC artefact n=${artefactN}`;
  } else if (downloadN !== artefactN) {
    mismatchLabel = `mismatch: download n=${downloadN} ≠ AUC artefact n=${artefactN}`;
  } else {
    countsMatchArtefact = true;
  }

  const legend =
    "Fit set = clean labelled clips (set=fit). Contaminated = time_stop or hold<120s (set=contaminated). Counts must match AUC artefact n or show mismatch.";

  return {
    source: opts.source,
    artefactN,
    downloadN,
    fitN,
    contaminatedN,
    qualityHoldN,
    jsonlTotalN,
    truncated,
    countsMatchArtefact,
    mismatchLabel,
    legend,
  };
}

/** CSV comment block for the operator (IMP-21). */
export function fitDownloadCsvPreamble(summary: FitDownloadSummary): string {
  const matchBit = summary.countsMatchArtefact
    ? "counts_match_auc_artefact=yes"
    : summary.mismatchLabel ?? "counts_match_auc_artefact=no";
  return [
    "# Meridian sample download — fit set vs contaminated labelled (IMP-21)",
    `# ${summary.legend}`,
    `# source=${summary.source} artefact_n=${summary.artefactN} download_n=${summary.downloadN} jsonl_total_n=${summary.jsonlTotalN}`,
    `# fit=${summary.fitN} contaminated=${summary.contaminatedN} quality_hold=${summary.qualityHoldN}`,
    `# ${matchBit}`,
  ].join("\n");
}
