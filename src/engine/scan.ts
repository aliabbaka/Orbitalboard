import { solve, SOLVER_VERSION } from './eht.js';
import { PARAMETER_VERSION } from '../data/parameters.js';
import { validateState } from './validation.js';
import type { SystemState, Vec3, Warning } from './types.js';
import { dot } from './linalg.js';

export interface AngleScan {
  readonly centerId: string;
  readonly fixedId: string;
  readonly movingId: string;
  /** Only this atom moves; no inferred bonded fragment moves with it. */
  readonly anglesDegrees: readonly number[];
  readonly tinyGainThresholdEV?: number;
}

/** A rigid-radius angle sweep, not geometry optimization or a prediction of experimental equilibrium. */
export function scanAngle(state: SystemState, options: AngleScan) {
  validateState(state);
  if (!options || typeof options !== 'object' || !Array.isArray(options.anglesDegrees)) throw new Error('Angle scan requires an options object with an angle array.');
  const angles = options.anglesDegrees;
  const threshold = options.tinyGainThresholdEV ?? 0.2;
  if (!angles.length || angles.length > 361 || angles.some(x => !Number.isFinite(x) || x <= 0 || x > 180) || new Set(angles).size !== angles.length) {
    throw new Error('Supply 1–361 distinct angles in (0, 180] degrees.');
  }
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('Tiny-gain threshold must be finite and nonnegative.');
  const ids = [options.centerId, options.fixedId, options.movingId];
  if (ids.some(id => typeof id !== 'string') || new Set(ids).size !== 3) throw new Error('Angle handles must refer to three different atoms.');
  const c = state.atoms.find(a => a.id === options.centerId);
  const a = state.atoms.find(a => a.id === options.fixedId);
  const b = state.atoms.find(a => a.id === options.movingId);
  if (!c || !a || !b) throw new Error('Angle handle references an unknown atom.');
  const r = a.position.map((x, d) => x - c.position[d]);
  const moving = b.position.map((x, d) => x - c.position[d]);
  const length = Math.hypot(...moving);
  const u = r.map(x => x / Math.hypot(...r));
  const parallel = dot(moving, u);
  let perpendicular = moving.map((x, d) => x - parallel * u[d]);
  if (Math.hypot(...perpendicular) < 1e-10) {
    const least = u.map(Math.abs).indexOf(Math.min(...u.map(Math.abs)));
    perpendicular = u.map((_, d) => (d === least ? 1 : 0) - u[least] * u[d]);
  }
  const norm = Math.hypot(...perpendicular);
  const v = perpendicular.map(x => x / norm);
  const points = angles.map(angleDegrees => {
    const angle = angleDegrees * Math.PI / 180;
    const position = u.map((x, d) => c.position[d] + length * (Math.cos(angle) * x + Math.sin(angle) * v[d])) as unknown as Vec3;
    const result = solve({ ...state, atoms: state.atoms.map(atom => atom.id === b.id ? { ...atom, position } : atom) });
    return { angleDegrees, orbitalEnergySumEV: result.orbitalEnergySumEV, energiesEV: result.orbitals.map(o => o.energyEV), warnings: result.warnings };
  });
  const min = Math.min(...points.map(p => p.orbitalEnergySumEV));
  const sampledMinimumAnglesDegrees = points.filter(p => Math.abs(p.orbitalEnergySumEV - min) < 1e-8).map(p => p.angleDegrees);
  // Energy gain must be relative to a supplied reference, not the worst sampled geometry.
  const linear = points.find(p => p.angleDegrees === 180);
  const gainFromLinearEV = linear ? Math.max(0, linear.orbitalEnergySumEV - min) : null;
  const warnings: Warning[] = [
    { code: 'D5', message: 'This scan minimizes an orbital-energy sum at fixed radii, not physical total energy. Bond-length optimization is not supported.', cites: ['points'] },
    { code: 'SAMPLED_MINIMUM', message: 'The reported minimum is over supplied angle samples only; no continuous equilibrium geometry is inferred. Curves are energy-sorted, not overlap-tracked through crossings.', cites: ['sampledMinimumAnglesDegrees', 'points'] },
  ];
  if (gainFromLinearEV !== null && gainFromLinearEV < threshold && sampledMinimumAnglesDegrees.some(x => x < 180)) {
    warnings.push({ code: 'D4', message: 'The sampled bend gives only a small energy-sum gain relative to the linear sample. It may be a model artifact; the warning threshold is a configurable heuristic, not a measured constant.', cites: ['gainFromLinearEV', 'tinyGainThresholdEV'] });
  }
  return {
    trust: 'Computed' as const, solverVersion: SOLVER_VERSION, parameterVersion: PARAMETER_VERSION,
    input: structuredClone(state), options: structuredClone(options), points, sampledMinimumAnglesDegrees,
    gainFromLinearEV, tinyGainThresholdEV: threshold, warnings,
  };
}
