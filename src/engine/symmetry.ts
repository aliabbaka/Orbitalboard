import type { BasisFunction, Matrix, SystemState, Vec3 } from './types.js';
import { dot, matVec } from './linalg.js';
import { toBohr } from './basis.js';

export function linearAxis(state: SystemState): Vec3 | null {
  if (state.atoms.length < 2) return null;
  const origin = toBohr(state.atoms[0].position, state.units);
  const last = toBohr(state.atoms.at(-1)!.position, state.units);
  const delta = last.map((x, d) => x - origin[d]);
  const length = Math.hypot(...delta);
  const axis = delta.map(x => x / length) as unknown as Vec3;
  for (const atom of state.atoms) {
    const r = toBohr(atom.position, state.units).map((x, d) => x - origin[d]);
    const along = dot(r, axis);
    if (Math.hypot(...r.map((x, d) => x - along * axis[d])) > 1e-7) return null;
  }
  return axis;
}

/** Spatial inversion exists only when every atom maps to an identical element. Linear does not imply g/u. */
function inversionMap(state: SystemState): number[] | null {
  const points = state.atoms.map(a => toBohr(a.position, state.units));
  const center = [0, 1, 2].map(d => points.reduce((sum, p) => sum + p[d], 0) / points.length);
  const map = points.map((point, i) => points.findIndex((q, j) =>
    state.atoms[i].element === state.atoms[j].element &&
    Math.hypot(...q.map((x, d) => x + point[d] - 2 * center[d])) < 1e-7));
  return map.some(i => i < 0) ? null : map;
}

export function orbitalSymmetry(
  state: SystemState, basis: readonly BasisFunction[], coefficients: readonly number[], amplitudes: readonly number[], overlap: Matrix,
): { kind: 'sigma' | 'pi' | null; parity: 'g' | 'u' | null } {
  const axis = linearAxis(state);
  if (!axis) return { kind: null, parity: null };
  let sigmaWeight = 0, piWeight = 0;
  for (let atom = 0; atom < state.atoms.length; atom++) {
    let s2 = 0;
    const p = [0, 0, 0];
    basis.forEach((ao, i) => {
      if (ao.atomIndex !== atom) return;
      if (ao.angular === 's') s2 += amplitudes[i] ** 2;
      else p[['px', 'py', 'pz'].indexOf(ao.angular)] = amplitudes[i];
    });
    const parallel = dot(p, axis) ** 2;
    sigmaWeight += s2 + parallel;
    piWeight += dot(p, p) - parallel;
  }
  const kind = piWeight < 1e-7 ? 'sigma' : sigmaWeight < 1e-7 ? 'pi' : null;
  const map = inversionMap(state);
  let parity: 'g' | 'u' | null = null;
  if (map) {
    const inverted = basis.map(ao => {
      const other = basis.findIndex(b => b.atomIndex === map[ao.atomIndex] && b.angular === ao.angular);
      return coefficients[other] * (ao.angular === 's' ? 1 : -1);
    });
    const expectation = dot(coefficients, matVec(overlap, inverted));
    if (Math.abs(expectation - 1) < 1e-6) parity = 'g';
    if (Math.abs(expectation + 1) < 1e-6) parity = 'u';
  }
  return { kind, parity };
}
