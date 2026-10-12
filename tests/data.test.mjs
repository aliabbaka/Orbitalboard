import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, ELEMENT_VERIFICATION, SOURCES, PARAMETER_VERSION, BOHR_ANGSTROM, DEFAULT_K } from '../dist/data/parameters.js';
import { solve, SOLVER_VERSION } from '../dist/index.js';
import { readData, system } from './helpers.mjs';

test('all basis parameters exactly match independently loaded pinned PySCF tables and EHT IP columns', () => {
  const expected = readData('oracle.json').basisParameters;
  assert.deepEqual(Object.keys(ELEMENTS), Object.keys(expected));
  for (const [symbol, reference] of Object.entries(expected)) {
    for (const [key, value] of Object.entries(reference)) assert.deepEqual(ELEMENTS[symbol][key], value, `${symbol}.${key}`);
    assert.equal(ELEMENTS[symbol].valenceElectrons, reference.atomicNumber <= 2 ? reference.atomicNumber : reference.atomicNumber - 2);
  }
  assert.equal(BOHR_ANGSTROM, 0.52917721092);
  assert.equal(DEFAULT_K, 1.75);
});

test('each element and chemical reference has a concrete citation', () => {
  for (const parameters of Object.values(ELEMENTS)) {
    assert.ok(parameters.cites.length >= 2);
    for (const id of parameters.cites) {
      assert.ok(SOURCES[id]?.title);
      assert.match(SOURCES[id]?.url, /^https:\/\//);
      assert.ok(SOURCES[id]?.locator);
    }
  }
  const reference = readData('chemistry-references.json');
  assert.ok(SOURCES[reference.sourceId]);
});

test('an element requires evidence before being enabled; candidates stay disabled', () => {
  const fixtureNames = new Set(readData('oracle.json').cases.map(c => c.name));
  for (const [symbol, flag] of Object.entries(ELEMENT_VERIFICATION)) {
    assert.ok(flag.reason);
    if (flag.enabled) {
      assert.ok(flag.evidence.length);
      for (const name of flag.evidence) assert.ok(fixtureNames.has(name));
    } else {
      assert.throws(() => solve({ units: 'bohr', atoms: [{ id: 'a', element: symbol, position: [0, 0, 0] }] }), /disabled/);
    }
  }
});

test('every result pins solver and parameter versions, input and numeric source paths', () => {
  const state = system('O2');
  const result = solve(state);
  assert.equal(result.provenance.trust, 'Computed');
  assert.equal(result.provenance.solverVersion, SOLVER_VERSION);
  assert.equal(result.provenance.parameterVersion, PARAMETER_VERSION);
  assert.deepEqual(result.provenance.input, state);
  assert.notEqual(result.provenance.input, state);
  assert.equal(result.provenance.kSource, 'wh-k');
  assert.equal(solve({ ...state, k: 1.8 }).provenance.kSource, 'user-input');
  for (const warning of result.warnings) {
    assert.ok(warning.cites.length);
    for (const cite of warning.cites) {
      if (Object.hasOwn(SOURCES, cite)) continue;
      const value = cite.split('.').reduce((object, key) => object?.[key], result);
      assert.notEqual(value, undefined, `Unresolvable warning citation ${cite}`);
    }
  }
});

test('source tables cannot be mutated by downstream consumers', () => {
  assert.throws(() => { ELEMENTS.C.sEnergyEV = 0; }, TypeError);
  assert.throws(() => { ELEMENTS.C.exponents[0] = 0; }, TypeError);
  assert.throws(() => { ELEMENT_VERIFICATION.B.enabled = true; }, TypeError);
  assert.throws(() => { SOURCES.sto3g.title = 'changed'; }, TypeError);
});
