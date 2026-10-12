import type { DegeneracyGroup, Occupation } from './types.js';

export const DEGENERACY_TOLERANCE_EV = 1e-6;

export function groupDegeneracies(energies: readonly number[], tolerance = DEGENERACY_TOLERANCE_EV): DegeneracyGroup[] {
  if (!energies.length || energies.some((e, i) => !Number.isFinite(e) || (i > 0 && e < energies[i - 1]))) {
    throw new Error('Orbital energies must be finite, nonempty and sorted.');
  }
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('Degeneracy tolerance must be nonnegative.');
  const groups: DegeneracyGroup[] = [];
  let start = 0;
  for (let i = 1; i <= energies.length; i++) {
    // Compare to the first member, not the last: no tolerance chaining.
    if (i === energies.length || energies[i] - energies[start] > tolerance) {
      const indices = Array.from({ length: i - start }, (_, j) => start + j);
      groups.push({ indices, energyEV: indices.reduce((sum, j) => sum + energies[j], 0) / indices.length });
      start = i;
    }
  }
  return groups;
}

/** Hund's rule within each energy group; optional fixed-spin independent-electron filling. */
export function fillElectrons(energies: readonly number[], electrons: number, multiplicity?: number): {
  occupations: Occupation[]; groups: DegeneracyGroup[]; unpaired: number; multiplicity: number;
} {
  const groups = groupDegeneracies(energies);
  const n = energies.length;
  if (!Number.isInteger(electrons) || electrons < 0 || electrons > 2 * n) throw new Error('Electron count exceeds orbital capacity or is not a nonnegative integer.');
  const up = Array<number>(n).fill(0), down = Array<number>(n).fill(0);
  if (multiplicity !== undefined) {
    const excess = multiplicity - 1;
    if (!Number.isInteger(multiplicity) || multiplicity < 1 || excess > Math.min(electrons, 2 * n - electrons) || (electrons - excess) % 2 !== 0) {
      throw new Error('Spin multiplicity is incompatible with electron count and orbital capacity.');
    }
    const nUp = (electrons + excess) / 2, nDown = (electrons - excess) / 2;
    for (let i = 0; i < nUp; i++) up[i] = 1;
    for (let i = 0; i < nDown; i++) down[i] = 1;
  } else {
    let remaining = electrons;
    for (const group of groups) {
      for (const i of group.indices) if (remaining > 0) { up[i] = 1; remaining--; }
      for (const i of group.indices) if (remaining > 0) { down[i] = 1; remaining--; }
    }
  }
  const occupations = up.map((u, i) => ({ up: u as 0 | 1, down: down[i] as 0 | 1, count: u + down[i] }));
  const unpaired = occupations.filter(o => o.count === 1).length;
  return { occupations, groups, unpaired, multiplicity: unpaired + 1 };
}
