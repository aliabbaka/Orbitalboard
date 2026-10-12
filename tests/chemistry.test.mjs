import test from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../dist/index.js';
import { close, readData, system } from './helpers.mjs';

const references = readData('chemistry-references.json');
for (const reference of references.diatomics) {
  test(`cited textbook bond order and magnetism: ${reference.name}`, () => {
    const result = solve(system(reference.name));
    assert.equal(result.textbookBondOrder, reference.bondOrder);
    assert.equal(result.unpairedElectrons, reference.unpaired);
    assert.equal(result.magnetism, reference.unpaired ? 'paramagnetic' : 'diamagnetic');
    assert.ok(result.orbitals.every(o => o.characterMethod === 'homonuclear-diatomic-symmetry'));
    const pi = result.orbitals.filter(o => o.symmetry.kind === 'pi' && o.character === 'bonding');
    const upperSigma = result.orbitals.filter(o => o.symmetry.kind === 'sigma' && o.character === 'bonding').at(-1);
    if (reference.piBelowUpperBondingSigma !== null) {
      const computed = pi[0].energyEV < upperSigma.energyEV;
      if (reference.name === 'O2') {
        assert.notEqual(computed, reference.piBelowUpperBondingSigma, 'document D2 rather than changing raw eigenvalues');
        assert.ok(result.warnings.some(w => w.code === 'D2' && w.cites.includes(references.sourceId)));
      } else {
        assert.equal(computed, reference.piBelowUpperBondingSigma);
      }
    }
  });
}

test('s–p mixing exposes why population-sign classification is insufficient', () => {
  const result = solve(system('N2'));
  const orbital = result.orbitals[1];
  assert.equal(orbital.symmetry.parity, 'u');
  assert.ok(orbital.overlapPopulation > 0);
  assert.equal(orbital.character, 'antibonding');
  assert.equal(result.textbookBondOrder, 3);
});

test('O2 has two singly occupied pi-star orbitals, shared spatial frontiers and triplet filling', () => {
  const result = solve(system('O2'));
  assert.equal(result.multiplicity, 3);
  const somo = result.orbitals.filter(o => o.occupation.count === 1);
  assert.equal(somo.length, 2);
  assert.ok(somo.every(o => o.symmetry.kind === 'pi' && o.symmetry.parity === 'g' && o.character === 'antibonding'));
  assert.deepEqual(result.homoIndices, result.somoIndices);
  assert.deepEqual(result.lumoIndices, result.somoIndices);
  close(result.frontierGapEV, 0);
});

test('charge changes occupation, never the fixed-parameter eigenvalues', () => {
  const state = system('O2'), neutral = solve(state);
  const cation = solve({ ...state, charge: 1 }), anion = solve({ ...state, charge: -1 });
  assert.equal(cation.unpairedElectrons, 1);
  assert.equal(anion.unpairedElectrons, 1);
  assert.equal(cation.textbookBondOrder, 2.5);
  assert.equal(anion.textbookBondOrder, 1.5);
  neutral.orbitals.forEach((o, i) => {
    close(o.energyEV, cation.orbitals[i].energyEV, 0);
    close(o.energyEV, anion.orbitals[i].energyEV, 0);
  });
});

test('CO2 reports the unverified spectroscopy limitation, and D5 is always visible', () => {
  const result = solve(system('CO2'));
  assert.ok(result.warnings.some(w => w.code === 'D3_UNVERIFIED'));
  assert.ok(result.warnings.some(w => w.code === 'D5'));
  assert.equal('totalEnergyEV' in result, false);
  assert.equal('equilibriumBondLength' in result, false);
  assert.equal(result.electronCount, 16);
});
