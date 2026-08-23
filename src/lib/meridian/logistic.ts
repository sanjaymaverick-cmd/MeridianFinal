/** L2 logistic + ROC-AUC. Pure — no I/O. */

function sigmoid(z: number) {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

export type LogisticFit = {
  coef: number[];
  intercept: number;
  mean: number[];
  scale: number[];
};

export function standardize(X: number[][]): { mean: number[]; scale: number[]; Z: number[][] } {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const mean = Array(d).fill(0);
  const scale = Array(d).fill(1);
  if (!n || !d) return { mean, scale, Z: X };
  for (const row of X) {
    for (let j = 0; j < d; j++) mean[j] += row[j] ?? 0;
  }
  for (let j = 0; j < d; j++) mean[j] /= n;
  for (const row of X) {
    for (let j = 0; j < d; j++) {
      const dlt = (row[j] ?? 0) - mean[j];
      scale[j] += dlt * dlt;
    }
  }
  for (let j = 0; j < d; j++) {
    scale[j] = Math.sqrt(scale[j] / n) || 1;
  }
  const Z = X.map((row) => row.map((v, j) => ((v ?? 0) - mean[j]) / scale[j]));
  return { mean, scale, Z };
}

export function fitLogistic(
  X: number[][],
  y: number[],
  opts?: { lr?: number; epochs?: number; l2?: number },
): LogisticFit {
  const { mean, scale, Z } = standardize(X);
  const d = Z[0]?.length ?? 0;
  const n = Z.length;
  const coef = Array(d).fill(0);
  let intercept = 0;
  if (!n || !d) return { coef, intercept, mean, scale };
  const lr = opts?.lr ?? 0.15;
  const epochs = opts?.epochs ?? 250;
  const l2 = opts?.l2 ?? 0.02;
  for (let e = 0; e < epochs; e++) {
    const g = Array(d).fill(0);
    let gi = 0;
    for (let i = 0; i < n; i++) {
      let z = intercept;
      const row = Z[i]!;
      for (let j = 0; j < d; j++) z += coef[j] * row[j]!;
      const p = sigmoid(z);
      const err = p - (y[i] ?? 0);
      gi += err;
      for (let j = 0; j < d; j++) g[j] += err * row[j]!;
    }
    intercept -= (lr * gi) / n;
    for (let j = 0; j < d; j++) coef[j] -= (lr * (g[j] / n + l2 * coef[j]));
  }
  return { coef, intercept, mean, scale };
}

export function predictRow(row: number[], fit: LogisticFit): number {
  let z = fit.intercept;
  for (let j = 0; j < fit.coef.length; j++) {
    const scale = fit.scale[j] || 1;
    const x = ((row[j] ?? 0) - (fit.mean[j] ?? 0)) / scale;
    z += fit.coef[j]! * x;
  }
  return sigmoid(z);
}

export function rocAuc(y: number[], p: number[]): number {
  const n = Math.min(y.length, p.length);
  if (n < 2) return 0.5;
  const pairs = Array.from({ length: n }, (_, i) => ({ y: y[i] ?? 0, p: p[i] ?? 0 }));
  pairs.sort((a, b) => a.p - b.p);
  let pos = 0;
  let neg = 0;
  for (const r of pairs) {
    if (r.y > 0.5) pos += 1;
    else neg += 1;
  }
  if (pos === 0 || neg === 0) return 0.5;
  let rank = 1;
  let sum = 0;
  for (const r of pairs) {
    if (r.y > 0.5) sum += rank;
    rank += 1;
  }
  const u = sum - (pos * (pos + 1)) / 2;
  return u / (pos * neg);
}

export function hitRate(y: number[]): number {
  if (!y.length) return 0;
  return y.filter((v) => v > 0.5).length / y.length;
}

export function timeSplit(n: number, testFrac = 0.3): { train: number[]; test: number[] } {
  const cut = Math.max(1, Math.min(n - 1, Math.floor(n * (1 - testFrac))));
  return {
    train: Array.from({ length: cut }, (_, i) => i),
    test: Array.from({ length: n - cut }, (_, i) => i + cut),
  };
}
