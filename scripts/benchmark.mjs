import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import { solve } from '../dist/index.js';
import { buildBasis, overlapMatrix } from '../dist/engine/basis.js';
import { readFileSync } from 'node:fs';

const { systems } = JSON.parse(await readFile(new URL('../tests/data/systems.json', import.meta.url), 'utf8'));
const oracle = JSON.parse(readFileSync(new URL('../tests/data/oracle.json', import.meta.url), 'utf8'));
let maxOverlapError = 0;
for (const fixture of oracle.cases) {
  const actual = overlapMatrix(buildBasis(fixture.state));
  actual.forEach((row, i) => row.forEach((x, j) => { maxOverlapError = Math.max(maxOverlapError, Math.abs(x - fixture.overlap[i][j])); }));
}
const large = { name: '30-carbon-chain', state: { units: 'angstrom', atoms: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, element: 'C', position: [i * 1.4, 0, 0] })) } };
const rows = [];
for (const { name, state } of [...systems.filter(s => ['CO2', 'O2', 'H2O', 'NH3', 'CH4', 'asymmetric-mixed'].includes(s.name)), large]) {
  for (let i = 0; i < 15; i++) solve(state);
  const times = [];
  const samples = name === large.name ? 30 : 100;
  let result;
  for (let i = 0; i < samples; i++) {
    const start = performance.now(); result = solve(state); times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  rows.push({ system: name, atoms: state.atoms.length, basis: result.basis.length, samples, p50ms: +times[Math.floor(samples * 0.5)].toFixed(3), p95ms: +times[Math.ceil(samples * 0.95) - 1].toFixed(3), under16ms: times[Math.ceil(samples * 0.95) - 1] < 16 });
}
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, maxOverlapError, scope: 'Warm Node timings, NOT browser, worker-transfer, rendering or low-power-device latency.', results: rows }, null, 2));
