import { CALCULATORS } from './calculators.js';
import { SOLVER_DATA_VERSION, SOLVER_SOURCES } from './sources.js';
import { fields, numeric, object, text } from './validation.js';
import { formatNumber, inputPrecision, unit } from './units.js';
import type { Calculation, InputData, RegisteredSolver, SolverResult } from './types.js';

function freeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export const SOLVERS: readonly RegisteredSolver[] = freeze(CALCULATORS);
export const DISABLED_TOPICS = freeze([
  { title: 'Thermochemistry, kinetics, redox and nuclear', reason: 'Tier 3: no enabled solver/known-answer suite yet.' },
  { title: 'Polyprotic/weak-acid titration, coupled equilibria', reason: 'Not verified by this first breadth release.' },
  { title: 'General symbolic integration / arbitrary equation systems', reason: 'Restricted polynomial/elementary AST only; unsupported tasks are refused.' },
]);
export function getSolver(id: string): RegisteredSolver {
  const solver = SOLVERS.find(s => s.id === id); if (!solver || !solver.enabled || !solver.verification) throw new Error(`Solver ${id} is unavailable or not verified.`); return solver;
}
function safeJSON(value: unknown, depth = 0): void {
  if (depth > 12) throw new Error('Input nesting exceeds its cap.');
  if (value === null || typeof value === 'boolean') throw new Error('Null/boolean inputs are not numerical solver data.');
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Non-finite input.'); return; }
  if (typeof value === 'string') { if (value.length > 4000) throw new Error('Input text exceeds its cap.'); return; }
  if (Array.isArray(value)) { if (value.length > 201) throw new Error('Input list exceeds its cap.'); value.forEach(v => safeJSON(v, depth + 1)); return; }
  const data = object(value); Object.values(data).forEach(v => safeJSON(v, depth + 1));
}
export function validateInputs(solver: RegisteredSolver, raw: unknown): InputData {
  const inputs = object(raw); safeJSON(inputs); if (JSON.stringify(inputs).length > 16000) throw new Error('Solver inputs exceed 16000 characters.');
  fields(inputs, [...solver.fields.map(f => f.key), 'significantFigures']);
  for (const field of solver.fields) {
    const value = inputs[field.key]; if (value === undefined) { if (!field.optional) throw new Error(`Missing input: ${field.label}.`); continue; }
    if (field.type === 'text') text(value, field.label, 1000);
    else if (field.type === 'number') numeric(value, field.label);
    else if (field.type === 'select') { if (typeof value !== 'string' || !field.choices?.includes(value)) throw new Error(`Invalid choice: ${field.label}.`); }
    else if (field.type === 'quantity') { const q = object(value); fields(q, ['value', 'unit']); numeric(q.value, field.label); unit(text(q.unit, `${field.label} units`, 40)); }
  }
  if (inputs.significantFigures !== undefined && (!Number.isInteger(Number(inputs.significantFigures)) || Number(inputs.significantFigures) < 1 || Number(inputs.significantFigures) > 12)) throw new Error('Significant figures must be 1–12.');
  return structuredClone(inputs);
}
export function validateCalculation(value: unknown): Calculation {
  const c = object(value); fields(c, ['solverId', 'solverVersion', 'dataVersion', 'inputs']);
  const solver = getSolver(text(c.solverId, 'Solver ID', 80));
  if (c.solverVersion !== solver.version || c.dataVersion !== SOLVER_DATA_VERSION) throw new Error('Pinned calculator/data version is unavailable. No silent result upgrade.');
  return { solverId: solver.id, solverVersion: solver.version, dataVersion: SOLVER_DATA_VERSION, inputs: validateInputs(solver, c.inputs) };
}
export function makeCalculation(id: string, inputs: InputData): Calculation { const solver = getSolver(id); return validateCalculation({ solverId: id, solverVersion: solver.version, dataVersion: SOLVER_DATA_VERSION, inputs }); }
export function runCalculation(calculation: Calculation): SolverResult {
  const checked = validateCalculation(calculation), solver = getSolver(checked.solverId), derived = solver.solve(checked.inputs);
  const significantFigures = checked.inputs.significantFigures === undefined ? Math.min(inputPrecision(checked.inputs), solver.sources.includes('ciaaw-2024') ? 5 : 12) : Number(checked.inputs.significantFigures);
  for (const output of derived.outputs) {
    if (typeof output.value === 'number') { if (!Number.isFinite(output.value)) throw new Error('Solver returned a non-finite result.'); output.display = output.unit === 'integer' ? String(output.value) : solver.id === 'chem.acid-base' && ['pH', 'pOH'].includes(output.key) ? output.value.toFixed(significantFigures) : formatNumber(output.value, significantFigures); }
    else { if (output.value.length > 4000) throw new Error('Symbolic result exceeds its display cap.'); output.display = output.value; }
  }
  if (derived.graph?.points.some(p => !Number.isFinite(p.x) || (p.y !== null && !Number.isFinite(p.y)))) throw new Error('Graph returned a non-finite value.');
  const sources = Object.fromEntries(solver.sources.map(id => { if (!SOLVER_SOURCES[id]) throw new Error('Missing solver citation.'); return [id, SOLVER_SOURCES[id]]; }));
  return { ...derived, trust: 'Computed', solverId: solver.id, solverVersion: solver.version, dataVersion: SOLVER_DATA_VERSION, inputs: checked.inputs, sources,
    warnings: [...derived.warnings, `Display uses ${significantFigures} significant figures; raw values are preserved. Input trailing-zero notation can be ambiguous. This is not uncertainty propagation.`] };
}
