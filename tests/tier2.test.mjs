import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SOLVERS, makeCalculation, runCalculation } from '../dist/solvers/registry.js';
import { SOLVER_SOURCES } from '../dist/solvers/sources.js';
import { chemicalFormula, balanceEquation, molarMass } from '../dist/solvers/chemistry.js';
import { convert, significantFigures } from '../dist/solvers/units.js';
import { parseExpression, evaluate, derivative, simplify, integralPolynomial, polynomialValue } from '../dist/solvers/math.js';
import { configuration } from '../dist/solvers/atomic.js';
import { PERIODIC_ELEMENTS, PERIODIC_METADATA } from '../dist/data/periodic.js';
import { close, readData } from './helpers.mjs';
import { emptyBoard, parseBoard } from '../dist/board/schema.js';

const fixtures = readData('tier2-known-answers.json').cases;
for (const [index, fixture] of fixtures.entries()) {
  test(`Tier 2 golden ${index + 1}: ${fixture.id}`, () => {
    assert.ok(SOLVER_SOURCES[fixture.source]);
    const calculation = makeCalculation(fixture.id, fixture.input), result = runCalculation(calculation);
    const actual = Object.fromEntries(result.outputs.map(o => [o.key, o.value]));
    for (const [key, value] of Object.entries(fixture.expected)) { if (typeof value === 'number') close(actual[key], value, fixture.tolerance ?? 1e-8, key); else assert.equal(actual[key], value); }
    assert.equal(result.trust, 'Computed'); assert.ok(result.steps.length); assert.ok(Object.keys(result.sources).length);
    assert.deepEqual(runCalculation(calculation), result);
  });
}
test('every enabled solver has cited known answers, versions and a verification gate', () => {
  for (const solver of SOLVERS) { assert.ok(solver.enabled && solver.version && solver.verification); assert.ok(fixtures.some(f => f.id === solver.id)); solver.sources.forEach(id => assert.ok(SOLVER_SOURCES[id])); }
  assert.throws(() => makeCalculation('unverified-kinetics', {}), /unavailable/);
  const calculation = makeCalculation('math.solve', { equation: 'x=2' }); assert.throws(() => runCalculation({ ...calculation, solverVersion: 'future' }), /unavailable/);
});
test('periodic data hashes and standard masses are traceable; display masses are not used as calculator weights', () => {
  const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(hash('data/reference/pubchem-periodic.json'), PERIODIC_METADATA.pubchemSHA256); assert.equal(hash('data/reference/ciaaw-2024.html'), PERIODIC_METADATA.ciaawSHA256);
  assert.equal(PERIODIC_ELEMENTS.length, 118); close(molarMass('Li').value, 6.94); close(molarMass('Ar').value, 39.95); close(molarMass('S').value, 32.06);
  assert.throws(() => molarMass('Tc'), /no standard/); assert.throws(() => molarMass('Og'), /no standard/);
});
test('formula groups/hydrates and exact balances conserve all atoms; ambiguous inputs are refused', () => {
  assert.deepEqual(chemicalFormula('Ca(OH)2'), { Ca: 1, O: 2, H: 2 }); assert.deepEqual(chemicalFormula('CuSO4·5H2O'), { Cu: 1, S: 1, O: 9, H: 10 });
  for (const source of ['H2 + O2 -> H2O', 'Al + HCl -> AlCl3 + H2', 'Ca(OH)2 + H3PO4 -> Ca3(PO4)2 + H2O']) {
    const b = balanceEquation(source), atoms = b.species.map(chemicalFormula);
    for (const e of b.elements) assert.equal(atoms.reduce((sum, a, i) => sum + (a[e] ?? 0) * b.coefficients[i] * (i < b.reactants.length ? 1 : -1), 0), 0);
    assert.ok(b.coefficients.every(x => Number.isInteger(x) && x > 0));
  }
  for (const source of ['Fe + O2 -> FeO + Fe2O3', 'H2 -> CO2', 'H+ + OH- -> H2O']) assert.throws(() => balanceEquation(source));
  for (const source of ['2H2O', 'C0', 'Na(Cl', '__proto__', '<script>', 'C1.5']) assert.throws(() => chemicalFormula(source));
});
test('units and significant figures are explicit; temperature compounds/mismatches are blocked', () => {
  close(convert(1, 'atm', 'torr'), 760); close(convert(1, 'mol/L', 'mol/m^3'), 1000); close(convert(298.15, 'K', '°C'), 25);
  for (const [value, count] of [['1.00', 3], ['0.00100', 3], ['100', 1], ['100.', 3], ['1.00e3', 3]]) assert.equal(significantFigures(value), count);
  assert.throws(() => convert(1, 'g', 'L'), /Inconsistent/); assert.throws(() => convert(1, '°C/mol', 'K/mol'), /affine/);
  assert.throws(() => makeCalculation('units.convert', { quantity: { value: '1', unit: '' }, target: 'L' }), /unit/);
  const result = runCalculation(makeCalculation('chem.acid-base', { mode: 'strong-acid', concentration: { value: '0.00100', unit: 'mol/L' } })); assert.equal(result.outputs.find(o => o.key === 'pH').display, '3.000');
});
test('neutral computed atomic configurations agree with the independent source through Kr', () => {
  const cores = { He: '1s2', Ne: '1s2 2s2 2p6', Ar: '1s2 2s2 2p6 3s2 3p6' };
  const canonical = value => [...value.matchAll(/([1-7][spdf])(\d+)/g)].map(m => `${m[1]}:${m[2]}`).sort().join(' ');
  for (const element of PERIODIC_ELEMENTS.filter(e => e.z <= 36)) {
    const expected = element.configuration.replace(/\[(He|Ne|Ar)\]/, (_, core) => `${cores[core]} `); const computed = configuration(element.z, 0);
    assert.equal(canonical(computed.configuration), canonical(expected), element.symbol); assert.equal(computed.electrons, element.z);
    assert.ok(computed.orbitals.every(o => o.n > o.l && o.m >= -o.l && o.m <= o.l));
  }
});
test('AST never executes code; derivatives match finite differences and polynomial integrals differentiate back', () => {
  for (const source of ['x^3+sin(x)', 'ln(x)', 'exp(x^2)', 'sqrt(x)', 'x/(x+1)']) {
    const expr = parseExpression(source), d = simplify(derivative(expr)), x = 1.2, h = 1e-5;
    close(evaluate(d, x), (evaluate(expr, x + h) - evaluate(expr, x - h)) / (2 * h), 1e-6);
  }
  const anti = integralPolynomial(parseExpression('3x^2+2x+1')); close(polynomialValue(anti, 1) - polynomialValue(anti, 0), 3);
  for (const source of ['globalThis', 'x.constructor', 'alert(1)', 'x=2', 'eval(1)', 'import(x)', 'process.exit()']) assert.throws(() => parseExpression(source));
  assert.throws(() => evaluate(parseExpression('ln(x)'), -1), /domain/);
  assert.throws(() => runCalculation(makeCalculation('math.integrate', { expression: 'sin(x)' })), /polynomial/);
});
test('physical domain constraints and unknown fields do not silently produce numbers', () => {
  assert.throws(() => runCalculation(makeCalculation('chem.ideal-gas', { unknown: 'pressure', volume: { value: '1', unit: 'L' }, amount: { value: '1', unit: 'mol' }, temperature: { value: '-274', unit: '°C' } })), /temperature/);
  assert.throws(() => makeCalculation('math.solve', { equation: 'x=2', execute: 'anything' }), /Unsupported/);
  assert.throws(() => makeCalculation('math.calculate', { expression: 'x', x: true }), /boolean/);
  assert.throws(() => runCalculation(makeCalculation('chem.atomic', { atomicNumber: 26, charge: -1 })), /not verified/);
});
test('schema-1 migration preserves existing EHT data and calculator snapshots pin their own versions', () => {
  const old = emptyBoard(); old.schemaVersion = 1; delete old.engines.registry;
  old.objects.push({ id: 'text', type: 'text', text: 'Original student work', x: 10, y: 20, width: 300, height: 100 });
  const before = JSON.stringify(old), migrated = parseBoard(old); assert.equal(migrated.schemaVersion, 2); assert.equal(migrated.engines.eht, old.engines.eht); assert.deepEqual(migrated.objects, old.objects); assert.equal(JSON.stringify(old), before);
  const calculation = makeCalculation('math.solve', { equation: 'x=2' }); migrated.objects.push({ id: 'calc', type: 'calculation', calculation, display: 'steps', x: 400, y: 20, width: 400, height: 350 });
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(migrated))), migrated);
  const forged = structuredClone(migrated); forged.objects[1].calculation.dataVersion = 'future'; assert.throws(() => parseBoard(forged), /unavailable/);
  forged.objects[1].calculation = calculation; forged.objects[1].answer = 999; assert.throws(() => parseBoard(forged), /Unknown/);
});
test('equilibrium, titration and graph properties are conserved independently of display formatting', () => {
  const solve = (id, inputs) => runCalculation(makeCalculation(id, inputs));
  const equilibrium = solve('chem.equilibrium', { K: 50, species: [{ label: 'H2', nu: -1, concentration: { value: '1', unit: 'mol/L' } }, { label: 'I2', nu: -1, concentration: { value: '1', unit: 'mol/L' } }, { label: 'HI', nu: 2, concentration: { value: '0', unit: 'mol/L' } }] });
  const values = Object.fromEntries(equilibrium.outputs.map(o => [o.key, o.value])); close(values.HI ** 2 / (values.H2 * values.I2), 50, 1e-7); close(values.H2 + values.HI / 2, 1); assert.ok(values.H2 > 0 && values.I2 > 0 && values.HI > 0);
  const curve = solve('chem.titration', SOLVERS.find(s => s.id === 'chem.titration').example).graph.points; close(curve[50].y, 7); assert.ok(curve[0].y < 7 && curve[100].y > 7);
  const graph = solve('math.graph', { expression: 'ln(x)', min: -1, max: 1 }).graph.points; assert.ok(graph.some(p => p.y === null)); assert.ok(graph.some(p => p.y !== null));
});
