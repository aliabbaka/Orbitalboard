import { PERIODIC_ELEMENTS } from '../data/periodic.js';

const ORDER = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1]] as const;
export function configuration(z: number, charge: number) {
  if (!Number.isInteger(z) || z < 1 || z > 36 || !Number.isInteger(charge) || charge > z || charge < -2) throw new Error('Atomic calculator supports H–Kr and charge -2 through Z, with nonnegative electron count.');
  if (charge < 0 && z > 18) throw new Error('Transition-element anions are not verified; use a cited reference rather than a guessed rearrangement.');
  const fill = (electrons: number) => { let remaining = electrons; return ORDER.map(([n, l]) => { const count = Math.min(remaining, 2 * (2 * l + 1)); remaining -= count; return { n, l, count }; }); };
  const shells = fill(charge < 0 ? z - charge : z);
  if (charge >= 0 && (z === 24 || z === 29)) { shells[5].count--; shells[6].count++; }
  let remove = Math.max(0, charge);
  for (const shell of [...shells].sort((a, b) => b.n - a.n || b.l - a.l)) { const count = Math.min(remove, shell.count); shell.count -= count; remove -= count; }
  const occupied = shells.filter(s => s.count > 0);
  const orbitals = occupied.flatMap(shell => Array.from({ length: 2 * shell.l + 1 }, (_, i) => ({ n: shell.n, l: shell.l, m: i - shell.l, up: shell.count > i, down: shell.count > 2 * shell.l + 1 + i })));
  return { electrons: z - charge, configuration: occupied.map(s => `${s.n}${'spd'[s.l]}${s.count}`).join(' '),
    unpaired: orbitals.filter(o => o.up !== o.down).length, orbitals, symbol: PERIODIC_ELEMENTS.find(e => e.z === z)!.symbol };
}
