import { PERIODIC_ELEMENTS } from '../data/periodic.js';
import { text } from './validation.js';

export interface ChemicalComposition { [element: string]: number }
export function chemicalFormula(raw: string): ChemicalComposition {
  const formula = text(raw, 'Formula', 160).replace(/[₀-₉]/g, c => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)));
  if (/[^A-Za-z0-9()[\]·.]/.test(formula)) throw new Error('Only neutral formula symbols/counts, groups and hydrate dots are supported. Ionic/isotopic notation requires a later solver.');
  let totalTokens = 0;
  const sum: ChemicalComposition = {};
  for (const [segmentIndex, segment] of formula.split(/[·.]/).entries()) {
    if (segmentIndex === 0 && /^\d/.test(segment)) throw new Error('Leading coefficients belong to equations, not a single-species formula. Hydrate multipliers follow a dot.');
    let position = 0;
    const count = () => { const m = /^\d+/.exec(segment.slice(position)); if (!m) return 1; position += m[0].length; const n = Number(m[0]); if (!Number.isSafeInteger(n) || n < 1 || n > 10000) throw new Error('Formula counts must be 1–10000.'); return n; };
    const multiplier = /^\d/.test(segment) ? count() : 1;
    const parse = (depth: number, end: string | null): ChemicalComposition => {
      if (depth > 6) throw new Error('Formula nesting exceeds its cap.'); const atoms: ChemicalComposition = {};
      while (position < segment.length && segment[position] !== end) {
        if (++totalTokens > 80) throw new Error('Formula is too complex.');
        let group: ChemicalComposition;
        if ('(['.includes(segment[position])) { const close = segment[position++] === '(' ? ')' : ']'; group = parse(depth + 1, close); }
        else { const match = /^[A-Z][a-z]?/.exec(segment.slice(position)); if (!match || !PERIODIC_ELEMENTS.some(e => e.symbol === match[0])) throw new Error('Unknown element or malformed formula.'); position += match[0].length; group = { [match[0]]: 1 }; }
        const n = count(); for (const [symbol, value] of Object.entries(group)) atoms[symbol] = (atoms[symbol] ?? 0) + value * n;
      }
      if (end) { if (segment[position] !== end || !Object.keys(atoms).length) throw new Error('Unclosed/empty formula group.'); position++; }
      return atoms;
    };
    const atoms = parse(0, null); if (!Object.keys(atoms).length || position !== segment.length) throw new Error('Malformed formula.');
    for (const [symbol, value] of Object.entries(atoms)) { sum[symbol] = (sum[symbol] ?? 0) + value * multiplier; if (sum[symbol] > 100000) throw new Error('Formula exceeds atom-count cap.'); }
  }
  return sum;
}
export function molarMass(formula: string) {
  const composition = chemicalFormula(formula); let value = 0, bound = 0;
  const contributions = Object.entries(composition).map(([symbol, count]) => {
    const element = PERIODIC_ELEMENTS.find(e => e.symbol === symbol)!;
    if (!element.mass) throw new Error(`${symbol} has no standard atomic weight in the cited table. Isotope-specific masses are not silently substituted.`);
    value += element.mass.weight * count; bound += element.mass.uncertainty * count;
    return { symbol, count, weight: element.mass.weight, contribution: count * element.mass.weight };
  });
  return { value, bound, contributions };
}
// Exact rational row reduction: coefficients are not floating-point guesses.
type Rational = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a || 1n; };
const r = (n: bigint | number, d = 1n): Rational => { let nn = BigInt(n); if (d < 0n) { nn = -nn; d = -d; } const g = gcd(nn, d); nn /= g; d /= g; if (nn > 10n ** 24n || nn < -(10n ** 24n) || d > 10n ** 24n) throw new Error('Balancing intermediate exceeds exact arithmetic cap.'); return { n: nn, d }; };
const sub = (a: Rational, b: Rational) => r(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Rational, b: Rational) => r(a.n * b.n, a.d * b.d);
const div = (a: Rational, b: Rational) => r(a.n * b.d, a.d * b.n);

export function balanceEquation(raw: string) {
  const equation = text(raw, 'Equation', 1000).replaceAll('→', '->'); const sides = equation.split('->');
  if (sides.length !== 2) throw new Error('Use one reaction arrow: reactants -> products.');
  const parseSide = (side: string) => side.split('+').map(s => s.trim().replace(/^\d+\s*/, ''));
  const reactants = parseSide(sides[0]), products = parseSide(sides[1]), species = [...reactants, ...products];
  if (!reactants.length || !products.length || species.length > 20 || species.some(s => !s)) throw new Error('Use 1–20 neutral species with no ionic charges.');
  if (new Set(species).size !== species.length) throw new Error('Repeated/catalytic species make this input ambiguous. Remove duplicates explicitly.');
  const atoms = species.map(chemicalFormula), elements = [...new Set(atoms.flatMap(a => Object.keys(a)))];
  if (elements.length > 20) throw new Error('Too many elements for this balancer.');
  const matrix = elements.map(e => atoms.map((a, i) => r((a[e] ?? 0) * (i < reactants.length ? 1 : -1))));
  const pivots: number[] = []; let row = 0;
  for (let col = 0; col < species.length && row < matrix.length; col++) {
    const pivot = matrix.findIndex((a, i) => i >= row && a[col].n !== 0n); if (pivot < 0) continue;
    [matrix[row], matrix[pivot]] = [matrix[pivot], matrix[row]]; const scale = matrix[row][col]; matrix[row] = matrix[row].map(x => div(x, scale));
    for (let i = 0; i < matrix.length; i++) if (i !== row && matrix[i][col].n) { const factor = matrix[i][col]; matrix[i] = matrix[i].map((x, j) => sub(x, mul(factor, matrix[row][j]))); }
    pivots.push(col); row++;
  }
  const free = species.map((_, i) => i).filter(i => !pivots.includes(i));
  if (free.length !== 1) throw new Error(free.length ? 'This equation has multiple independent balances. Supply additional constraints instead of accepting an arbitrary answer.' : 'These species cannot form the specified balanced reaction.');
  const solution = species.map(() => r(0)); solution[free[0]] = r(1);
  pivots.forEach((col, i) => { solution[col] = r(-matrix[i][free[0]].n, matrix[i][free[0]].d); });
  let denominator = 1n; solution.forEach(x => { denominator = denominator / gcd(denominator, x.d) * x.d; });
  let integers = solution.map(x => x.n * (denominator / x.d)); if (integers.every(x => x < 0n)) integers = integers.map(x => -x);
  if (integers.some(x => x <= 0n)) throw new Error('No positive balance exists with species on their declared sides.');
  let factor = integers[0]; integers.forEach(x => { factor = gcd(factor, x); }); integers = integers.map(x => x / factor);
  if (integers.some(x => x > 1000000n)) throw new Error('Balanced coefficients exceed the cap.'); const coefficients = integers.map(Number);
  for (const e of elements) {
    const sum = atoms.reduce((n, a, i) => n + (a[e] ?? 0) * coefficients[i] * (i < reactants.length ? 1 : -1), 0);
    if (sum !== 0) throw new Error('Balance failed atom conservation.');
  }
  const pretty = (values: string[], offset: number) => values.map((s, i) => `${coefficients[offset + i] === 1 ? '' : coefficients[offset + i]}${s}`).join(' + ');
  return { reactants, products, species, coefficients, elements, equation: `${pretty(reactants, 0)} → ${pretty(products, reactants.length)}` };
}
