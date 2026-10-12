import type { Matrix } from './types.js';

export function zeros(rows: number, columns = rows): Matrix {
  return Array.from({ length: rows }, () => Array<number>(columns).fill(0));
}

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
}

export function transpose(a: Matrix): Matrix {
  return a[0].map((_, j) => a.map(row => row[j]));
}

export function multiply(a: Matrix, b: Matrix): Matrix {
  if (!a.length || !b.length || a[0].length !== b.length) throw new Error('Matrix dimensions do not match.');
  const out = zeros(a.length, b[0].length);
  for (let i = 0; i < a.length; i++) {
    for (let k = 0; k < b.length; k++) {
      const aik = a[i][k];
      for (let j = 0; j < b[0].length; j++) out[i][j] += aik * b[k][j];
    }
  }
  return out;
}

export function matVec(a: Matrix, x: readonly number[]): number[] {
  return a.map(row => dot(row, x));
}

export function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, i) => sum + value * b[i], 0);
}

export interface Eigenpairs {
  values: number[];
  /** Each column is one normalized eigenvector. */
  vectors: Matrix;
}

/** Cyclic Jacobi rotations; real symmetric matrices only. Never silently return unconverged results. */
export function symmetricEigen(matrix: Matrix, tolerance = 1e-12): Eigenpairs {
  const n = matrix.length;
  if (!n || matrix.some(row => row.length !== n || row.some(x => !Number.isFinite(x)))) {
    throw new Error('Eigenproblem requires a nonempty finite square matrix.');
  }
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('Eigen tolerance must be positive.');
  const a = matrix.map(row => [...row]);
  const v = identity(n);
  const scale = Math.max(1, ...a.map(row => Math.max(...row.map(Math.abs))));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (Math.abs(a[i][j] - a[j][i]) > tolerance * scale) throw new Error('Matrix is not symmetric.');
      a[i][j] = a[j][i] = (a[i][j] + a[j][i]) / 2;
    }
  }
  let converged = false;
  for (let sweep = 0; sweep < 100; sweep++) {
    let largest = 0;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) largest = Math.max(largest, Math.abs(a[p][q]));
    }
    if (largest <= tolerance * scale) { converged = true; break; }
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (Math.abs(apq) <= tolerance * scale / n) continue;
        const tau = (a[q][q] - a[p][p]) / (2 * apq);
        const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.hypot(1, tau));
        const c = 1 / Math.hypot(1, t);
        const s = t * c;
        a[p][p] -= t * apq;
        a[q][q] += t * apq;
        a[p][q] = a[q][p] = 0;
        for (let k = 0; k < n; k++) {
          if (k !== p && k !== q) {
            const akp = a[k][p], akq = a[k][q];
            a[k][p] = a[p][k] = c * akp - s * akq;
            a[k][q] = a[q][k] = s * akp + c * akq;
          }
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  if (!converged) throw new Error('Jacobi eigensolver did not converge.');
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i][i] - a[j][j]);
  const vectors = v.map(row => order.map(j => row[j]));
  // Eigenvector sign is arbitrary; canonicalize for reproducible exported states.
  for (let j = 0; j < n; j++) {
    let pivot = 0;
    for (let i = 1; i < n; i++) if (Math.abs(vectors[i][j]) > Math.abs(vectors[pivot][j])) pivot = i;
    if (vectors[pivot][j] < 0) for (let i = 0; i < n; i++) vectors[i][j] *= -1;
  }
  return { values: order.map(i => a[i][i]), vectors };
}

function spectralMatrix(eigen: Eigenpairs, transform: (x: number) => number): Matrix {
  const weighted = eigen.vectors.map(row => row.map((x, i) => x * transform(eigen.values[i])));
  return multiply(weighted, transpose(eigen.vectors));
}

export function generalizedEigen(h: Matrix, overlap: Matrix) {
  if (h.length !== overlap.length) throw new Error('H and S dimensions do not match.');
  const se = symmetricEigen(overlap);
  const min = se.values[0], max = se.values.at(-1)!;
  if (min <= 1e-8 * max) throw new Error('Overlap matrix is singular or ill-conditioned. Separate overlapping atoms.');
  const inverseSqrt = spectralMatrix(se, x => 1 / Math.sqrt(x));
  const sqrt = spectralMatrix(se, Math.sqrt);
  const transformed = multiply(multiply(inverseSqrt, h), inverseSqrt);
  const eigen = symmetricEigen(transformed);
  return {
    energies: eigen.values,
    coefficients: multiply(inverseSqrt, eigen.vectors),
    lowdinAmplitudes: eigen.vectors,
    sqrtOverlap: sqrt,
    minOverlapEigenvalue: min,
    overlapConditionNumber: max / min,
  };
}
