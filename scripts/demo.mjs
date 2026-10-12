import { readFile } from 'node:fs/promises';
import { solve } from '../dist/index.js';

const { systems } = JSON.parse(await readFile(new URL('../tests/data/systems.json', import.meta.url), 'utf8'));
for (const { name, state } of systems.filter(s => ['H2', 'N2', 'O2', 'H2O', 'CH4'].includes(s.name))) {
  const result = solve(state);
  console.log(JSON.stringify({
    system: name,
    trust: result.provenance.trust,
    solverVersion: result.provenance.solverVersion,
    electrons: result.electronCount,
    bondOrder: result.textbookBondOrder,
    unpaired: result.unpairedElectrons,
    orbitals: result.orbitals.map(o => ({ energyEV: o.energyEV, label: o.label, arrows: `${o.occupation.up ? '↑' : ''}${o.occupation.down ? '↓' : ''}` })),
    warnings: result.warnings,
  }, null, 2));
}
