import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBasis, overlapMatrix } from '../dist/engine/basis.js';
import { buildHamiltonian, solve } from '../dist/engine/eht.js';
import { generalizedEigen } from '../dist/engine/linalg.js';
import { ELEMENT_VERIFICATION } from '../dist/data/parameters.js';
import { scanAngle } from '../dist/index.js';
import { close, closeMatrix, readData } from './helpers.mjs';

const oracle = readData('oracle.json');
test('oracle metadata distinguishes overlaps and EHT eigenpairs from SCF physics', () => {
  assert.equal(oracle.metadata.pyscf, '2.8.0');
  assert.match(oracle.metadata.method, /NOT PySCF SCF/);
  assert.ok(oracle.cases.length >= 20);
});

for (const fixture of oracle.cases) {
  test(`PySCF valence overlaps and SciPy eigenvalues: ${fixture.name}`, () => {
    const basis = buildBasis(fixture.state);
    const overlap = overlapMatrix(basis);
    closeMatrix(overlap, fixture.overlap, 1e-6);
    basis.forEach((ao, i) => {
      close(ao.energyEV, fixture.onsiteEV[i], 0);
      assert.equal(ao.atomIndex, fixture.aoLabels[i][0]);
      const angular = fixture.aoLabels[i][2].endsWith('s') ? 's' : `p${fixture.aoLabels[i][3]}`;
      assert.equal(ao.angular, angular, 'AO ordering must match before matrix comparison');
    });
    const h = buildHamiltonian(basis, overlap, fixture.state.k ?? 1.75);
    const eigen = generalizedEigen(h, overlap);
    eigen.energies.forEach((energy, i) => close(energy, fixture.energiesEV[i], 1e-7));
    if (fixture.state.atoms.every(a => ELEMENT_VERIFICATION[a.element].enabled)) {
      const result = solve(fixture.state);
      result.orbitals.forEach((o, i) => close(o.energyEV, fixture.energiesEV[i], 1e-7));
    }
  });
}

for (const scan of oracle.scans) {
  test(`Golden PySCF/SciPy angle curve: ${scan.electrons} valence electrons`, () => {
    const result = scanAngle(scan.state, {
      centerId: 'c', fixedId: 'o1', movingId: 'o2', anglesDegrees: scan.points.map(p => p.angleDegrees),
    });
    result.points.forEach((p, i) => {
      close(p.orbitalEnergySumEV, scan.points[i].orbitalEnergySumEV, 1e-7);
      p.energiesEV.forEach((e, j) => close(e, scan.points[i].energiesEV[j], 1e-7));
    });
    const minPoint = scan.points.reduce((best, p) => p.orbitalEnergySumEV < best.orbitalEnergySumEV ? p : best);
    assert.ok(result.sampledMinimumAnglesDegrees.includes(minPoint.angleDegrees));
  });
}
