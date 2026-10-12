import { readFileSync } from 'node:fs';
import { solve, scanAngle, SOLVER_VERSION, PARAMETER_VERSION } from '../dist/index.js';
import { buildBasis, overlapMatrix } from '../dist/engine/basis.js';
import { generalizedEigen } from '../dist/engine/linalg.js';
import { buildHamiltonian } from '../dist/engine/eht.js';

const read = name => JSON.parse(readFileSync(new URL(`../tests/data/${name}`, import.meta.url), 'utf8'));
const oracle = read('oracle.json');
const { systems } = read('systems.json');
const references = read('chemistry-references.json');
let maxOverlapError = 0, maxEigenvalueErrorEV = 0;
for (const fixture of oracle.cases) {
  const basis = buildBasis(fixture.state), overlap = overlapMatrix(basis);
  overlap.forEach((row, i) => row.forEach((x, j) => { maxOverlapError = Math.max(maxOverlapError, Math.abs(x - fixture.overlap[i][j])); }));
  const eigen = generalizedEigen(buildHamiltonian(basis, overlap, fixture.state.k ?? 1.75), overlap);
  eigen.energies.forEach((e, i) => { maxEigenvalueErrorEV = Math.max(maxEigenvalueErrorEV, Math.abs(e - fixture.energiesEV[i])); });
}
const chemistry = references.diatomics.map(reference => {
  const result = solve(systems.find(s => s.name === reference.name).state);
  const pi = result.orbitals.find(o => o.symmetry.kind === 'pi' && o.character === 'bonding');
  const sigma = result.orbitals.filter(o => o.symmetry.kind === 'sigma' && o.character === 'bonding').at(-1);
  return {
    system: reference.name, source: references.sourceId,
    expectedBondOrder: reference.bondOrder, computedBondOrder: result.textbookBondOrder,
    expectedUnpaired: reference.unpaired, computedUnpaired: result.unpairedElectrons,
    expectedPiBelowSigma: reference.piBelowUpperBondingSigma,
    computedPiBelowSigma: pi ? pi.energyEV < sigma.energyEV : null,
    limitations: result.warnings.filter(w => /^D[1-6]/.test(w.code)).map(w => w.code),
  };
});
const angleScans = oracle.scans.map(fixture => {
  const result = scanAngle(fixture.state, { centerId: 'c', fixedId: 'o1', movingId: 'o2', anglesDegrees: fixture.points.map(p => p.angleDegrees) });
  return {
    electrons: fixture.electrons, sampledMinimumAnglesDegrees: result.sampledMinimumAnglesDegrees,
    gainFromLinearEV: result.gainFromLinearEV,
    tinyGainWarning: result.warnings.some(w => w.code === 'D4'),
  };
});
console.log(JSON.stringify({
  solverVersion: SOLVER_VERSION, parameterVersion: PARAMETER_VERSION,
  fixtureSource: 'tests/data/oracle.json', cases: oracle.cases.length,
  maxOverlapError, maxEigenvalueErrorEV, chemistry, angleScans,
  scope: 'Numerical agreement for tested geometries, plus cited diatomic MO checks. Not experimental validation of arbitrary molecules or geometry optimization.',
}, null, 2));
