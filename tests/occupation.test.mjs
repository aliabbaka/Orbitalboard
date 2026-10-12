import test from 'node:test';
import assert from 'node:assert/strict';
import { fillElectrons, groupDegeneracies } from '../dist/engine/occupation.js';

test('Hund fills each degenerate orbital once before pairing', () => {
  assert.deepEqual(fillElectrons([-20, -10, -10, -5], 4).occupations.map(o => o.count), [2, 1, 1, 0]);
  assert.equal(fillElectrons([-20, -10, -10, -5], 4).unpaired, 2);
  assert.deepEqual(fillElectrons([-20, -10, -10, -5], 5).occupations.map(o => o.count), [2, 2, 1, 0]);
});

test('all occupations obey Pauli and conserve integer electron count', () => {
  for (let count = 0; count <= 12; count++) {
    const result = fillElectrons([-20, -10, -10, -10, -5, -1], count);
    assert.equal(result.occupations.reduce((sum, o) => sum + o.count, 0), count);
    for (const o of result.occupations) {
      assert.ok(o.count >= 0 && o.count <= 2);
      assert.equal(o.count, o.up + o.down);
    }
    assert.equal(result.multiplicity, result.unpaired + 1);
  }
});

test('degeneracy uses energy tolerance, without chaining', () => {
  assert.deepEqual(groupDegeneracies([0, 0.9e-6, 1.8e-6]).map(g => g.indices), [[0, 1], [2]]);
  assert.deepEqual(groupDegeneracies([-20, -20 + 1e-9, -10]).map(g => g.indices), [[0, 1], [2]]);
  assert.throws(() => groupDegeneracies([2, 1]), /sorted/);
  assert.throws(() => groupDegeneracies([NaN]), /finite/);
  assert.throws(() => groupDegeneracies([0], -1), /tolerance/);
});

test('explicit multiplicity gives fixed-spin filling and rejects impossible spin', () => {
  const energies = [-20, -10, -10, -5];
  assert.deepEqual(fillElectrons(energies, 4, 1).occupations.map(o => o.count), [2, 2, 0, 0]);
  assert.deepEqual(fillElectrons(energies, 4, 3).occupations.map(o => o.count), [2, 1, 1, 0]);
  assert.deepEqual(fillElectrons(energies, 4, 5).occupations.map(o => o.count), [1, 1, 1, 1]);
  for (const multiplicity of [0, 2, 7, 1.5, NaN, null]) assert.throws(() => fillElectrons(energies, 4, multiplicity), /multiplicity/);
  assert.throws(() => fillElectrons(energies, 8, 3), /multiplicity/);
  for (const count of [-1, 9, 2.5, NaN]) assert.throws(() => fillElectrons(energies, count), /Electron count/);
});
