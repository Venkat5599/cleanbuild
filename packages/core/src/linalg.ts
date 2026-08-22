/**
 * Minimal dense linear algebra for RATCHET.
 *
 * Everything here operates on row-major `Float64Array` matrices. The feature
 * space is d=35, so dense O(d^3) routines are irrelevant to performance and we
 * trade cleverness for auditability.
 */

export type Vec = Float64Array;
/** Row-major dense matrix. */
export type Mat = Float64Array;

export function zeros(n: number): Vec {
  return new Float64Array(n);
}

export function eye(d: number, scale = 1): Mat {
  const m = new Float64Array(d * d);
  for (let i = 0; i < d; i++) m[i * d + i] = scale;
  return m;
}

export function matVec(A: Mat, x: Vec, d: number): Vec {
  const out = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let s = 0;
    const row = i * d;
    for (let j = 0; j < d; j++) s += A[row + j]! * x[j]!;
    out[i] = s;
  }
  return out;
}

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/**
 * Cholesky factorisation `A = L Lᵀ` for symmetric positive-definite `A`.
 * Returns lower-triangular `L`, or `null` when `A` is not positive-definite —
 * callers treat null as a health event and fall back to a full recompute.
 */
export function cholesky(A: Mat, d: number): Mat | null {
  const L = new Float64Array(d * d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * d + j]!;
      for (let k = 0; k < j; k++) s -= L[i * d + k]! * L[j * d + k]!;
      if (i === j) {
        if (s <= 0) return null;
        L[i * d + j] = Math.sqrt(s);
      } else {
        L[i * d + j] = s / L[j * d + j]!;
      }
    }
  }
  return L;
}

/** Solve `L y = b` for lower-triangular `L`. */
export function forwardSubst(L: Mat, b: Vec, d: number): Vec {
  const y = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= L[i * d + k]! * y[k]!;
    y[i] = s / L[i * d + i]!;
  }
  return y;
}

/** Solve `Lᵀ x = y` for lower-triangular `L`. */
export function backSubstT(L: Mat, y: Vec, d: number): Vec {
  const x = new Float64Array(d);
  for (let i = d - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < d; k++) s -= L[k * d + i]! * x[k]!;
    x[i] = s / L[i * d + i]!;
  }
  return x;
}

/** Solve `A x = b` for symmetric positive-definite `A`. Null if not SPD. */
export function solveSPD(A: Mat, b: Vec, d: number): Vec | null {
  const L = cholesky(A, d);
  if (!L) return null;
  return backSubstT(L, forwardSubst(L, b, d), d);
}

/** Invert a symmetric positive-definite matrix via Cholesky. Null if not SPD. */
export function invSPD(A: Mat, d: number): Mat | null {
  const L = cholesky(A, d);
  if (!L) return null;
  const inv = new Float64Array(d * d);
  const e = new Float64Array(d);
  for (let c = 0; c < d; c++) {
    e.fill(0);
    e[c] = 1;
    const col = backSubstT(L, forwardSubst(L, e, d), d);
    for (let r = 0; r < d; r++) inv[r * d + c] = col[r]!;
  }
  // Force exact symmetry — accumulated float error otherwise fails later
  // Cholesky calls on what is mathematically a symmetric matrix.
  for (let i = 0; i < d; i++) {
    for (let j = i + 1; j < d; j++) {
      const v = 0.5 * (inv[i * d + j]! + inv[j * d + i]!);
      inv[i * d + j] = v;
      inv[j * d + i] = v;
    }
  }
  return inv;
}

/** Standard normal CDF via Abramowitz & Stegun 7.1.26 erf approximation. */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}
