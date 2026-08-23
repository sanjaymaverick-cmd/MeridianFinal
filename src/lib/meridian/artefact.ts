/** Meta-label artefact. Synth scaffold until paper fills promote a fit. */

import { FEATURE_KEYS, packFeatures, type FeatureVec } from "./features";
import { predictRow, type LogisticFit } from "./logistic";
import { shouldPromote } from "./kelly";

export const META_ARTEFACT = {
  model: "LogisticRegression",
  version: "m2_tbm_v1",
  features: [
    "confidence",
    "confluence",
    "p_success",
    "atr_pct",
    "approx_stop_pct",
    "minutes_since_midnight",
    "minutes_to_eod_flatten",
  ] as const,
  scalerMean: [
    0.560149371263024, 73.42190305206465, 0.6760413482027815, 0.022500771261813466, 0.03375115689272023, 550.45960502693,
    32.32829274808534,
  ],
  scalerScale: [
    0.05629482131846835, 0.7336155059220605, 0.001921510337778692, 0.004120848199459609, 0.006181272299189416,
    37.46165822314648, 35.59984647369348,
  ],
  coef: [
    0.04083829894147982, -0.09613362514159211, -0.13987532447400486, -0.07535723361105678, -0.07535723361106968,
    -0.9886622640015418, -0.6601300423018558,
  ],
  intercept: -0.11359297278373853,
  threshold: 0.55,
};

export type MetaFeatures = Partial<FeatureVec> & {
  confidence?: number;
  confluence?: number;
  p_success?: number;
  atr_pct?: number;
  approx_stop_pct?: number;
  minutes_since_midnight?: number;
  minutes_to_eod_flatten?: number;
};

export type ArtefactStatus = {
  model: string;
  version: string;
  features: string[];
  scalerMean: number[];
  scalerScale: number[];
  coef: number[];
  intercept: number;
  threshold: number;
  source: "synth" | "paper";
  n: number;
  auc: number;
  hitRate: number;
  promoted: boolean;
  fittedAt: number | null;
};

function fromSynth(): ArtefactStatus {
  return {
    model: META_ARTEFACT.model,
    version: META_ARTEFACT.version,
    features: [...META_ARTEFACT.features],
    scalerMean: [...META_ARTEFACT.scalerMean],
    scalerScale: [...META_ARTEFACT.scalerScale],
    coef: [...META_ARTEFACT.coef],
    intercept: META_ARTEFACT.intercept,
    threshold: META_ARTEFACT.threshold,
    source: "synth",
    n: 0,
    auc: 0,
    hitRate: 0,
    promoted: false,
    fittedAt: null,
  };
}

const g = globalThis as typeof globalThis & { __meridianArtefact?: ArtefactStatus };

export function getArtefact(): ArtefactStatus {
  g.__meridianArtefact ??= fromSynth();
  return g.__meridianArtefact;
}

export function setArtefact(next: ArtefactStatus) {
  g.__meridianArtefact = next;
  return next;
}

export function artefactFromFit(fit: LogisticFit, meta: { n: number; auc: number; hitRate: number; features?: string[] }): ArtefactStatus {
  const source = "paper" as const;
  const n = meta.n;
  const auc = meta.auc;
  return {
    model: "LogisticRegression",
    version: "paper_tbm_v1",
    features: meta.features ?? [...FEATURE_KEYS],
    scalerMean: fit.mean,
    scalerScale: fit.scale,
    coef: fit.coef,
    intercept: fit.intercept,
    threshold: 0.55,
    source,
    n,
    auc,
    hitRate: meta.hitRate,
    promoted: shouldPromote(n, auc, source, meta.hitRate),
    fittedAt: Date.now(),
  };
}

export function predictMetaProb(raw: MetaFeatures): number {
  const a = getArtefact();
  const row = packFeatures(raw as FeatureVec, a.features);
  const p = predictRow(row, {
    coef: a.coef,
    intercept: a.intercept,
    mean: a.scalerMean,
    scale: a.scalerScale,
  });
  return Math.min(1, Math.max(0, p));
}
