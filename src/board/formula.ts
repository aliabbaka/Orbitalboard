import { requireVerifiedElement, PARAMETER_VERSION } from '../data/parameters.js';

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
export function normalizeFormula(text: string): string {
  return text.trim().replace(/[₀-₉]/g, c => String(SUBSCRIPTS.indexOf(c)));
}
/** v1 typed grammar: element symbols and integer counts, no guessed structures or ink OCR. */
export function parseFormula(text: string): Record<string, number> {
  const formula = normalizeFormula(text);
  if (!formula || formula.length > 80) throw new Error('Type a short formula such as NH3. Parentheses and ionic notation are not in this grammar yet.');
  const tokens = [...formula.matchAll(/([A-Z][a-z]?)(\d*)/g)];
  if (tokens.map(t => t[0]).join('') !== formula) throw new Error('Formula grammar: element symbols followed by optional integer counts.');
  const atoms: Record<string, number> = {};
  for (const token of tokens) {
    requireVerifiedElement(token[1]);
    const count = token[2] ? Number(token[2]) : 1;
    if (!Number.isSafeInteger(count) || count < 1 || count > 30) throw new Error('Atom counts must be integers from 1 to 30.');
    atoms[token[1]] = (atoms[token[1]] ?? 0) + count;
  }
  if (Object.values(atoms).reduce((sum, n) => sum + n, 0) > 30) throw new Error('This builder is capped at 30 atoms.');
  return atoms;
}
export function formulaElectrons(formula: string) {
  const atoms = parseFormula(formula);
  const contributions = Object.entries(atoms).map(([element, count]) => ({ element, count, perAtom: requireVerifiedElement(element).valenceElectrons }));
  return { trust: 'Computed' as const, method: 'Verified-element valence electron count (neutral formula, not a geometry)', version: '1.0.0', parameterVersion: PARAMETER_VERSION,
    electrons: contributions.reduce((sum, a) => sum + a.count * a.perAtom, 0), contributions, cites: ['yaehmop'] };
}
export function systemFormula(state: { atoms: readonly { element: string }[] }): string {
  const counts: Record<string, number> = {};
  state.atoms.forEach(a => { counts[a.element] = (counts[a.element] ?? 0) + 1; });
  const keys = Object.keys(counts).sort();
  if (counts.C) { keys.splice(keys.indexOf('C'), 1); keys.unshift('C'); if (counts.H) { keys.splice(keys.indexOf('H'), 1); keys.splice(1, 0, 'H'); } }
  return keys.map(k => k + (counts[k] === 1 ? '' : counts[k])).join('');
}
