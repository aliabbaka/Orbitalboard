import { requireVerifiedElement } from '../data/parameters.js';
import { toBohr } from './basis.js';
import type { SystemState } from './types.js';

export const MAX_ATOMS = 30;

/** Runtime validation is mandatory even when callers use TypeScript. Shared boards are untrusted. */
export function validateState(state: SystemState): void {
  if (!state || typeof state !== 'object' || !Array.isArray(state.atoms) || !state.atoms.length || state.atoms.length > MAX_ATOMS) {
    throw new Error(`Provide between 1 and ${MAX_ATOMS} atoms.`);
  }
  if (state.units !== 'angstrom' && state.units !== 'bohr') throw new Error('Explicit coordinate units must be angstrom or bohr.');
  if (state.charge !== undefined && (!Number.isSafeInteger(state.charge))) throw new Error('Charge must be an integer.');
  if (state.k !== undefined && (!Number.isFinite(state.k) || state.k <= 0 || state.k > 5)) throw new Error('K must be finite and in (0, 5].');
  const ids = new Set<string>();
  for (const atom of state.atoms) {
    if (!atom || typeof atom.id !== 'string' || !atom.id.trim() || atom.id.length > 100 || ids.has(atom.id)) {
      throw new Error('Every atom needs a unique, nonempty id of at most 100 characters.');
    }
    ids.add(atom.id);
    if (typeof atom.element !== 'string') throw new Error('Every atom needs an element symbol.');
    requireVerifiedElement(atom.element);
    if (!Array.isArray(atom.position) || atom.position.length !== 3 || atom.position.some((x: number) => !Number.isFinite(x) || Math.abs(x) > 1e5)) {
      throw new Error('Atom positions must contain three finite coordinates with magnitude at most 100000.');
    }
  }
  for (let i = 0; i < state.atoms.length; i++) {
    const a = toBohr(state.atoms[i].position, state.units);
    for (let j = 0; j < i; j++) {
      const b = toBohr(state.atoms[j].position, state.units);
      if (Math.hypot(...a.map((x, d) => x - b[d])) < 0.1) throw new Error('Atoms are coincident or too close (less than 0.1 bohr).');
    }
  }
}
