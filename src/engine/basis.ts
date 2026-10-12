import { BOHR_ANGSTROM, getElement } from '../data/parameters.js';
import type { Angular, BasisFunction, Primitive, SystemState, Vec3, Matrix } from './types.js';
import { zeros } from './linalg.js';

const POWERS: Record<Angular, Vec3> = { s: [0, 0, 0], px: [1, 0, 0], py: [0, 1, 0], pz: [0, 0, 1] };

export function toBohr(position: Vec3, units: SystemState['units']): Vec3 {
  return position.map(value => units === 'angstrom' ? value / BOHR_ANGSTROM : value) as unknown as Vec3;
}

/** Analytic s/p primitive overlap by the Gaussian product theorem, including angular factors. */
function primitiveOverlap(a: number, b: number, A: Vec3, B: Vec3, la: Vec3, lb: Vec3): number {
  const p = a + b;
  const mu = a * b / p;
  let out = (Math.PI / p) ** 1.5;
  for (let d = 0; d < 3; d++) {
    const delta = A[d] - B[d];
    const pa = -b * delta / p;
    const pb = a * delta / p;
    out *= Math.exp(-mu * delta * delta);
    if (la[d] && lb[d]) out *= pa * pb + 1 / (2 * p);
    else if (la[d]) out *= pa;
    else if (lb[d]) out *= pb;
  }
  return out;
}

function normalizePrimitives(exponents: readonly number[], coefficients: readonly number[], angular: Angular): Primitive[] {
  const powers = POWERS[angular];
  const raw = exponents.map((exponent, i) => ({
    exponent,
    weight: coefficients[i] * (2 * exponent / Math.PI) ** 0.75 * (angular === 's' ? 1 : Math.sqrt(4 * exponent)),
  }));
  const origin: Vec3 = [0, 0, 0];
  let normSquared = 0;
  for (const a of raw) for (const b of raw) {
    normSquared += a.weight * b.weight * primitiveOverlap(a.exponent, b.exponent, origin, origin, powers, powers);
  }
  return raw.map(p => ({ exponent: p.exponent, weight: p.weight / Math.sqrt(normSquared) }));
}

/** Low-level mathematical basis builder; public solve() separately enforces element verification. */
export function buildBasis(state: SystemState): BasisFunction[] {
  return state.atoms.flatMap((atom, atomIndex) => {
    const data = getElement(atom.element);
    const angular: Angular[] = data.pCoefficients ? ['s', 'px', 'py', 'pz'] : ['s'];
    return angular.map(kind => ({
      atomIndex, atomId: atom.id, element: atom.element, angular: kind,
      center: toBohr(atom.position, state.units),
      energyEV: kind === 's' ? data.sEnergyEV : data.pEnergyEV!,
      primitives: normalizePrimitives(data.exponents, kind === 's' ? data.sCoefficients : data.pCoefficients!, kind),
      cites: [...data.cites, 'bohr'],
    }));
  });
}

export function contractedOverlap(a: BasisFunction, b: BasisFunction): number {
  let sum = 0;
  for (const pa of a.primitives) for (const pb of b.primitives) {
    sum += pa.weight * pb.weight * primitiveOverlap(pa.exponent, pb.exponent, a.center, b.center, POWERS[a.angular], POWERS[b.angular]);
  }
  return sum;
}

export function overlapMatrix(basis: readonly BasisFunction[]): Matrix {
  const s = zeros(basis.length);
  for (let i = 0; i < basis.length; i++) {
    for (let j = 0; j <= i; j++) s[i][j] = s[j][i] = contractedOverlap(basis[i], basis[j]);
  }
  return s;
}

/** Wavefunction amplitudes have units bohr^(-3/2); coordinates must be supplied in bohr. */
export function evaluateAO(ao: BasisFunction, pointBohr: Vec3): number {
  const delta = pointBohr.map((value, i) => value - ao.center[i]);
  const r2 = delta.reduce((sum, x) => sum + x * x, 0);
  const axis = ao.angular === 's' ? -1 : ['px', 'py', 'pz'].indexOf(ao.angular);
  return ao.primitives.reduce((sum, p) => sum + p.weight * Math.exp(-p.exponent * r2), 0) * (axis < 0 ? 1 : delta[axis]);
}

export function evaluateOrbital(basis: readonly BasisFunction[], coefficients: readonly number[], pointBohr: Vec3): number {
  if (basis.length !== coefficients.length || coefficients.some(x => !Number.isFinite(x))) throw new Error('Invalid orbital coefficients.');
  if (pointBohr.length !== 3 || pointBohr.some(x => !Number.isFinite(x))) throw new Error('Point must have three finite bohr coordinates.');
  return basis.reduce((sum, ao, i) => sum + coefficients[i] * evaluateAO(ao, pointBohr), 0);
}
