import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, evaluateOrbital } from '../dist/index.js';
import { BOHR_ANGSTROM } from '../dist/data/parameters.js';
import { symmetricEigen, generalizedEigen, identity } from '../dist/engine/linalg.js';
import { close, closeMatrix, freezeDeep, rotateState, system, systems } from './helpers.mjs';

for (const fixture of systems) {
  test(`invariants, normalization and rigid transformations: ${fixture.name}`, () => {
    const state = freezeDeep(structuredClone(fixture.state));
    const result = solve(state);
    closeMatrix(result.overlap, result.overlap[0].map((_, i) => result.overlap.map(row => row[i])), 0);
    assert.ok(symmetricEigen(result.overlap).values.every(e => e > 0));
    assert.ok(result.orbitals.every((o, i) => i === 0 || o.energyEV >= result.orbitals[i - 1].energyEV));
    assert.ok(result.diagnostics.maxEigenResidualEV < 1e-7);
    assert.ok(result.diagnostics.maxOrthonormalityError < 1e-9);
    close(result.orbitals.reduce((sum, o) => sum + o.occupation.count, 0), result.electronCount, 0);
    for (const orbital of result.orbitals) {
      close(orbital.composition.byAO.reduce((sum, x) => sum + x, 0), 100);
      close(orbital.composition.byAtom.reduce((sum, x) => sum + x.percent, 0), 100);
      assert.ok(orbital.composition.byAO.every(x => x >= 0));
    }
    for (const angle of [0.17, 0.73, 2.1]) {
      const rotated = solve(rotateState(state, angle));
      rotated.orbitals.forEach((o, i) => close(o.energyEV, result.orbitals[i].energyEV, 1e-7));
      close(rotated.orbitalEnergySumEV, result.orbitalEnergySumEV, 1e-7);
      assert.equal(rotated.unpairedElectrons, result.unpairedElectrons);
      assert.equal(rotated.textbookBondOrder, result.textbookBondOrder);
      assert.deepEqual(rotated.orbitals.map(o => o.symmetry), result.orbitals.map(o => o.symmetry));
    }
    assert.deepEqual(solve(state), result, 'identical inputs must give identical values, including signs');
  });
}

test('bohr and angstrom states agree', () => {
  const state = system('H2O');
  const bohr = { ...state, units: 'bohr', atoms: state.atoms.map(a => ({ ...a, position: a.position.map(x => x / BOHR_ANGSTROM) })) };
  const a = solve(state), b = solve(bohr);
  closeMatrix(a.overlap, b.overlap, 1e-12);
  a.orbitals.forEach((o, i) => close(o.energyEV, b.orbitals[i].energyEV, 1e-10));
});

test('basis permutation preserves spectra and total populations', () => {
  const state = system('asymmetric-mixed'), a = solve(state);
  const b = solve({ ...state, atoms: [...state.atoms].reverse() });
  a.orbitals.forEach((o, i) => close(o.energyEV, b.orbitals[i].energyEV, 1e-8));
  close(a.orbitalEnergySumEV, b.orbitalEnergySumEV, 1e-8);
});

test('30-atom safety cap solves without claiming a frame-time guarantee', () => {
  const state = { units: 'angstrom', atoms: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, element: 'C', position: [1.4 * i, 0, 0] })) };
  const result = solve(state);
  assert.equal(result.basis.length, 120);
  assert.equal(result.electronCount, 120);
  assert.equal(result.orbitals.reduce((sum, o) => sum + o.occupation.count, 0), 120);
  assert.ok(result.diagnostics.minOverlapEigenvalue > 0);
  assert.ok(result.diagnostics.maxEigenResidualEV < 1e-6);
  assert.ok(result.diagnostics.maxOrthonormalityError < 1e-7);
  assert.ok(result.warnings.some(w => w.code === 'LARGE_SYSTEM'));
});

test('expected exact spatial degeneracies survive non-axis-aligned rotation', () => {
  const n2 = solve(rotateState(system('N2')));
  assert.deepEqual(n2.degeneracyGroups.map(g => g.indices.length), [1, 1, 2, 1, 2, 1]);
  assert.ok(n2.orbitals.every(o => o.symmetry.kind && o.symmetry.parity));
  assert.ok(solve(system('CH4')).degeneracyGroups.some(g => g.indices.length === 3));
});

test('linear heteronuclear molecules have no inversion parity', () => {
  const state = { units: 'angstrom', atoms: [{ id: 'c', element: 'C', position: [0, 0, 0] }, { id: 'o', element: 'O', position: [1.2, 0, 0] }] };
  assert.ok(solve(state).orbitals.every(o => o.symmetry.kind && o.symmetry.parity === null));
});

test('accidental mixed-symmetry degeneracy withholds the diatomic bond order', () => {
  const result = solve({ ...system('H2'), k: 1 });
  assert.equal(result.textbookBondOrder, null);
  assert.ok(result.warnings.some(w => w.code === 'SYMMETRY_UNRESOLVED'));
  assert.ok(result.warnings.some(w => w.code === 'CUSTOM_PARAMETER'));
});

test('nonlinear molecules do not get guessed point-group labels or a global bond order', () => {
  const result = solve(system('H2O'));
  assert.ok(result.orbitals.every(o => o.symmetry.kind === null && o.symmetry.parity === null));
  assert.equal(result.textbookBondOrder, null);
  assert.ok(result.warnings.some(w => w.code === 'SYMMETRY_UNASSIGNED'));
});

test('empty and full electron spaces have explicit missing frontiers', () => {
  const state = { units: 'bohr', atoms: [{ id: 'h', element: 'H', position: [0, 0, 0] }] };
  const empty = solve({ ...state, charge: 1 });
  assert.deepEqual(empty.homoIndices, []);
  assert.deepEqual(empty.lumoIndices, [0]);
  assert.equal(empty.frontierGapEV, null);
  const full = solve({ ...state, charge: -1 });
  assert.deepEqual(full.homoIndices, [0]);
  assert.deepEqual(full.lumoIndices, []);
  assert.equal(full.frontierGapEV, null);
});

test('normalized wavefunction evaluation supports real orbital surfaces later', () => {
  const state = { units: 'bohr', atoms: [{ id: 'h', element: 'H', position: [0, 0, 0] }] };
  const result = solve(state), orbital = result.orbitals[0];
  assert.ok(evaluateOrbital(result.basis, orbital.coefficients, [0, 0, 0]) > 0);
  close(evaluateOrbital(result.basis, orbital.coefficients, [1, 0, 0]), evaluateOrbital(result.basis, orbital.coefficients, [0, 1, 0]), 1e-12);
  // Spherical quadrature of the isolated s orbital's probability density, independent of the overlap formula.
  const dr = 0.005;
  let integral = 0;
  for (let r = dr / 2; r < 10; r += dr) {
    const psi = evaluateOrbital(result.basis, orbital.coefficients, [r, 0, 0]);
    integral += 4 * Math.PI * r * r * psi * psi * dr;
  }
  close(integral, 1, 1e-6);
  assert.throws(() => evaluateOrbital(result.basis, [], [0, 0, 0]), /coefficients/);
});

test('Jacobi handles a known matrix, degeneracy and invalid eigenproblems', () => {
  const eigen = symmetricEigen([[2, 1], [1, 2]]);
  close(eigen.values[0], 1);
  close(eigen.values[1], 3);
  assert.deepEqual(symmetricEigen(identity(3)).values, [1, 1, 1]);
  for (const matrix of [[], [[1, 2]], [[1, NaN], [NaN, 1]], [[1, 2], [3, 1]]]) assert.throws(() => symmetricEigen(matrix));
  assert.throws(() => generalizedEigen(identity(2), [[1, 1], [1, 1]]), /singular|ill-conditioned/);
});
