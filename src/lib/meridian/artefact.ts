/** V4 M2 logistic artefact (research/artefacts/meta_label_v4.json). Scaffolding — not promotion-eligible. */
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
    0.560149371263024, 73.42190305206465, 0.6760413482027815, 0.022500771261813466,
    0.03375115689272023, 550.45960502693, 32.32829274808534,
  ],
  scalerScale: [
    0.05629482131846835, 0.7336155059220605, 0.001921510337778692, 0.004120848199459609,
    0.006181272299189416, 37.46165822314648, 35.59984647369348,
  ],
  coef: [
    0.04083829894147982, -0.09613362514159211, -0.13987532447400486, -0.07535723361105678,
    -0.07535723361106968, -0.9886622640015418, -0.6601300423018558,
  ],
  intercept: -0.11359297278373853,
  threshold: 0.55,
};

export type MetaFeatures = {
  confidence: number;
  confluence: number;
  p_success: number;
  atr_pct: number;
  approx_stop_pct: number;
  minutes_since_midnight: number;
  minutes_to_eod_flatten: number;
};

function sigmoid(z: number) {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

export function predictMetaProb(raw: Partial<MetaFeatures>): number {
  const a = META_ARTEFACT;
  let z = a.intercept;
  a.features.forEach((key, i) => {
    const x = Number(raw[key] ?? a.scalerMean[i]);
    const scale = a.scalerScale[i] || 1;
    z += a.coef[i] * ((x - a.scalerMean[i]) / scale);
  });
  const p = sigmoid(z);
  return Math.min(1, Math.max(0, p));
}
