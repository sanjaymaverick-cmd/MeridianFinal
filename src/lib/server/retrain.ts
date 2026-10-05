import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { meridianDataDir } from "@/lib/server/paths";
import { artefactFromFit, getArtefact, setArtefact, type ArtefactStatus } from "@/lib/meridian/artefact";
import { shouldPromote } from "@/lib/meridian/kelly";
import { FEATURE_KEYS, emptyFeatures, packFeatures, type FeatureVec } from "@/lib/meridian/features";
import { FIT_MIN_N } from "@/lib/meridian/kelly";
import { fitLogistic, hitRate, predictRow, rocAuc, timeSplit } from "@/lib/meridian/logistic";
import { isPredSample } from "@/lib/meridian/pred-orb";
import { SAMPLE_EXCLUDE_FILE, isExcludedSample, parseExcludeList } from "@/lib/meridian/sample-exclude";

const DATA_DIR = meridianDataDir();
const JSONL = path.join(DATA_DIR, "paper-samples.jsonl");
const ARTEFACT_PATH = path.join(DATA_DIR, "meta-artefact.json");
/** IMP-38: optional id list of rows to skip at fit time (samples jsonl is never rewritten). */
const EXCLUDE_PATH = process.env.MERIDIAN_SAMPLE_EXCLUDE || path.join(DATA_DIR, SAMPLE_EXCLUDE_FILE);

export async function loadSampleExcludeIds(excludePath = EXCLUDE_PATH): Promise<Set<string>> {
  try {
    return parseExcludeList(await readFile(excludePath, "utf8"));
  } catch {
    return new Set();
  }
}

type SampleRow = {
  id?: string;
  label?: number;
  fwdRet?: number;
  fwd_ret?: number;
  barrier?: string;
  confidence?: number;
  confluence?: number;
  pSuccess?: number;
  p_success?: number;
  atrPct?: number;
  atr_pct?: number;
  features?: Partial<FeatureVec> & Record<string, unknown>;
  tsClose?: number;
  ts_close?: string;
  quoteLabel?: string;
  sleeve?: string;
  symbol?: string;
  reasonOpen?: string;
  reason_open?: string;
};

function featureRow(raw: SampleRow): FeatureVec {
  const f = emptyFeatures();
  const src = { ...raw, ...(raw.features ?? {}) } as Record<string, unknown>;
  for (const k of FEATURE_KEYS) {
    const v = Number(src[k]);
    if (Number.isFinite(v)) f[k] = v;
  }
  if (!f.confidence) f.confidence = Number(raw.confidence) || 0.55;
  if (!f.confluence) f.confluence = Number(raw.confluence) || 60;
  if (!f.p_success) f.p_success = Number(raw.pSuccess ?? raw.p_success) || 0.5;
  if (!f.atr_pct) f.atr_pct = Number(raw.atrPct ?? raw.atr_pct) || 0.02;
  if (!f.approx_stop_pct) f.approx_stop_pct = f.atr_pct * 1.5;
  return f;
}

function labelOf(raw: SampleRow): 0 | 1 {
  if (raw.label === 0 || raw.label === 1) return raw.label;
  const ret = Number(raw.fwdRet ?? raw.fwd_ret);
  return ret > 0 ? 1 : 0;
}

export async function loadArtefactFromDisk(): Promise<ArtefactStatus> {
  try {
    const txt = await readFile(ARTEFACT_PATH, "utf8");
    const parsed = JSON.parse(txt) as ArtefactStatus;
    if (parsed?.coef?.length) {
      parsed.promoted = shouldPromote(parsed.n, parsed.auc, parsed.source, parsed.hitRate);
      return setArtefact(parsed);
    }
  } catch {
    /* synth default */
  }
  return getArtefact();
}

export type SampleQuality = {
  n: number;
  timeStopN: number;
  qualityHoldN: number;
  avgHoldSec: number;
};

export async function sampleQuality(jsonlPath = JSONL, excludePath = EXCLUDE_PATH): Promise<SampleQuality> {
  const excludeIds = await loadSampleExcludeIds(excludePath);
  let txt = "";
  try {
    txt = await readFile(jsonlPath, "utf8");
  } catch {
    return { n: 0, timeStopN: 0, qualityHoldN: 0, avgHoldSec: 0 };
  }
  let n = 0;
  let timeStopN = 0;
  let qualityHoldN = 0;
  let holdSum = 0;
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    let row: { id?: string; hold_sec?: number; holdSec?: number; reason_close?: string; reasonClose?: string; sleeve?: string; symbol?: string; reasonOpen?: string };
    try {
      row = JSON.parse(line) as typeof row;
    } catch {
      continue;
    }
    if (isPredSample(row)) continue;
    if (isExcludedSample(row, excludeIds)) continue;
    n += 1;
    const hold = Number(row.hold_sec ?? row.holdSec);
    if (Number.isFinite(hold)) {
      holdSum += hold;
      if (hold >= 300) qualityHoldN += 1;
    }
    const reason = String(row.reason_close ?? row.reasonClose ?? "");
    if (reason === "time_stop" || reason.includes("time_stop")) timeStopN += 1;
  }
  return { n, timeStopN, qualityHoldN, avgHoldSec: n ? holdSum / n : 0 };
}

export async function retrainFromJsonl(jsonlPath = JSONL, excludePath = EXCLUDE_PATH): Promise<ArtefactStatus | null> {
  const excludeIds = await loadSampleExcludeIds(excludePath);
  let txt = "";
  try {
    txt = await readFile(jsonlPath, "utf8");
  } catch {
    return null;
  }
  const rows: SampleRow[] = [];
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as SampleRow;
      if (isPredSample(row)) continue;
      // IMP-38: short-root option rows + exclude-list ids never reach the fit (gates unchanged).
      if (isExcludedSample(row, excludeIds)) continue;
      rows.push(row);
    } catch {
      /* skip */
    }
  }
  if (rows.length < FIT_MIN_N) return null;
  const X: number[][] = [];
  const y: number[] = [];
  for (const r of rows) {
    X.push(packFeatures(featureRow(r)));
    y.push(labelOf(r));
  }
  const { train, test } = timeSplit(X.length);
  const Xtr = train.map((i) => X[i]!);
  const ytr = train.map((i) => y[i]!);
  const fit = fitLogistic(Xtr, ytr);
  const pte = test.map((i) => predictRow(X[i]!, fit));
  const yte = test.map((i) => y[i]!);
  const auc = rocAuc(yte, pte);
  const hr = hitRate(yte);
  const next = artefactFromFit(fit, { n: rows.length, auc, hitRate: hr, features: [...FEATURE_KEYS] });
  setArtefact(next);
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(ARTEFACT_PATH, JSON.stringify(next, null, 2));
  } catch {
    /* ignore */
  }
  return next;
}
