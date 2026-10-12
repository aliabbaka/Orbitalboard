import test from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../dist/index.js';
import { evaluateOrbital } from '../dist/engine/basis.js';
import { sampleOrbitalField } from '../dist/engine/field.js';
import { PRESETS, changeAngle, changeDistance, coordinateAngle, coordinateDistance, sliderToValue, valueToSlider } from '../dist/lab/model.js';
import { DIATOMIC_REFERENCES } from '../dist/data/chemistry-references.js';
import { close, system, readData, freezeDeep } from './helpers.mjs';

test('separable orbital grids match direct wavefunction evaluation, including s/p phases', () => {
  for (const name of ['H2', 'NH3', 'O2']) {
    const result = solve(system(name));
    for (const index of [0, result.homoIndices[0]]) {
      const grid = sampleOrbitalField(result, index, 24), n = grid.resolution;
      for (const cell of [0, 12, 57, 1680, 7021, 11022]) {
        const cells = [cell % n, Math.floor(cell / n) % n, Math.floor(cell / n ** 2)];
        const point = cells.map((i, d) => grid.centerBohr[d] + grid.extentBohr * (i / n - 0.5));
        close(grid.values[cell], evaluateOrbital(result.basis, result.orbitals[index].coefficients, point), 1e-7);
      }
      assert.ok(grid.maxAbs > 0);
      assert.ok(grid.boundaryMax < 0.005);
      assert.equal(grid.solverVersion, result.provenance.solverVersion);
      assert.throws(() => sampleOrbitalField(result, index, 100), /16–40/);
      assert.throws(() => sampleOrbitalField(result, 999), /existing/);
    }
  }
});

test('log controls round-trip across their range', () => {
  for (const raw of [0, 250, 500, 750, 1000]) close(valueToSlider(sliderToValue(raw, 0.2, 5), 0.2, 5), raw, 1e-10);
});

test('geometry controls preserve input and fixed radii, with explicit handle identities', () => {
  const state = freezeDeep(system('CO2'));
  const bent = changeAngle(state, 'c', 'o1', 'o2', 125);
  close(coordinateAngle(bent, 'c', 'o1', 'o2'), 125);
  close(coordinateDistance(bent, 'c', 'o2'), 1.16);
  const stretched = changeDistance(bent, 'c', 'o2', 2);
  close(coordinateDistance(stretched, 'c', 'o2'), 2);
  close(coordinateAngle(stretched, 'c', 'o1', 'o2'), 125);
  assert.deepEqual(state, system('CO2'));
});

test('all UI presets use validated elements and agree with Stage 0.1 fixtures', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    assert.deepEqual(preset.state, system(name));
    assert.equal(solve(preset.state).provenance.trust, 'Computed');
  }
});

test('displayed chemistry references reproduce the cited reference fixture', () => {
  for (const reference of readData('chemistry-references.json').diatomics) {
    const element = reference.name.replace(/2$/, '');
    assert.deepEqual(DIATOMIC_REFERENCES[element], { bondOrder: reference.bondOrder, unpaired: reference.unpaired, piBelowSigma: reference.piBelowUpperBondingSigma, sourceId: 'openstax-mo' });
  }
});
