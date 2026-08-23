import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { artefactFromFit, getArtefact, setArtefact, type ArtefactStatus } from "@/lib/meridian/artefact";
import { shouldPromote } from "@/lib/meridian/kelly";
import { FEATURE_KEYS, emptyFeatures, packFeatures, type FeatureVec } from "@/lib/meridian/features";
import { FIT_MIN_N } from "@/lib/meridian/kelly";
import { fitLogistic, hitRate, predictRow, rocAuc, timeSplit } from "@/lib/meridian/logistic";

const DATA_DIR = path.join(process.cwd(), "data");
const JSONL = path.join(DATA_DIR, "paper-samples.jsonl");
const ARTEFACT_PATH = path.join(DATA_DIR, "meta-artefact.json");

type SampleRow = {
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

export async function sampleQuality(jsonlPath = JSONL): Promise<SampleQuality> {
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
    let row: { hold_sec?: number; holdSec?: number; reason_close?: string; reasonClose?: string };
    try {
      row = JSON.parse(line) as typeof row;
    } catch {
      continue;
    }
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

export async function retrainFromJsonl(jsonlPath = JSONL): Promise<ArtefactStatus | null> {
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
      rows.push(JSON.parse(line) as SampleRow);
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
  const hr = hitRate(y);
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
