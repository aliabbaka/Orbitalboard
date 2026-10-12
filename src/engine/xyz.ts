import type { SystemState } from './types.js';
import { MAX_ATOMS, validateState } from './validation.js';

/** Strict, one-frame XYZ input. XYZ convention is angstrom; extended XYZ is not guessed. */
export function parseXYZ(text: string): SystemState {
  if (typeof text !== 'string' || text.length > 100000) throw new Error('XYZ input must be text under 100000 characters.');
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (!/^\s*\d+\s*$/.test(lines[0])) throw new Error('The first XYZ line must be the atom count.');
  const count = Number(lines[0]);
  if (count < 1 || count > MAX_ATOMS) throw new Error(`XYZ supports between 1 and ${MAX_ATOMS} atoms.`);
  if (lines.length < count + 2) throw new Error('XYZ requires a comment line and the declared number of atoms.');
  const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const atoms = lines.slice(2, count + 2).map((line, i) => {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length !== 4 || !tokens.slice(1).every(t => numberPattern.test(t))) throw new Error(`XYZ atom line ${i + 3} must contain an element and three numeric coordinates.`);
    return { id: `atom-${i + 1}`, element: tokens[0], position: tokens.slice(1).map(Number) as [number, number, number] };
  });
  if (lines.slice(count + 2).some(line => line.trim())) throw new Error('Extra XYZ data found. Only one coordinate frame is supported.');
  const state: SystemState = { atoms, units: 'angstrom' };
  validateState(state);
  return state;
}
