export type Expr = { type: 'number'; value: number } | { type: 'x' } | { type: 'neg'; child: Expr } | { type: 'call'; name: 'sin' | 'cos' | 'exp' | 'ln' | 'sqrt'; child: Expr } | { type: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Expr; right: Expr };
const n = (value: number): Expr => ({ type: 'number', value });
const b = (op: '+' | '-' | '*' | '/' | '^', left: Expr, right: Expr): Expr => ({ type: 'binary', op, left, right });
const call = (name: 'sin' | 'cos' | 'exp' | 'ln' | 'sqrt', child: Expr): Expr => ({ type: 'call', name, child });

/** Small real-expression AST. No eval, assignment, property access, JS functions or arbitrary names. */
export function parseExpression(source: string): Expr {
  if (!source || source.length > 500) throw new Error('Expression must be 1–500 characters.');
  source = source.replaceAll('−', '-').replaceAll('×', '*').replaceAll('÷', '/').replaceAll('π', 'pi');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-z]+|[+\-*/^()]/g) ?? [];
  if (tokens.join('') !== source.replace(/\s/g, '') || tokens.length > 200) throw new Error('Unsupported expression syntax. Use x, numbers, + - * / ^ and sin/cos/exp/ln/sqrt.');
  let at = 0, depth = 0;
  const atom = (): Expr => {
    if (++depth > 32) throw new Error('Expression nesting exceeds its cap.');
    const token = tokens[at++]; let answer: Expr;
    if (token === '(') { answer = add(); if (tokens[at++] !== ')') throw new Error('Unclosed parenthesis.'); }
    else if (token === 'x') answer = { type: 'x' };
    else if (token === 'pi' || token === 'e') answer = n(token === 'pi' ? Math.PI : Math.E);
    else if (['sin', 'cos', 'exp', 'ln', 'sqrt'].includes(token)) { if (tokens[at++] !== '(') throw new Error('Functions need parentheses.'); answer = call(token as 'sin', add()); if (tokens[at++] !== ')') throw new Error('Unclosed function.'); }
    else if (token && /^(?:\d|\.)/.test(token)) { const value = Number(token); if (!Number.isFinite(value) || value > 1e12) throw new Error('Numeric literal exceeds its cap.'); answer = n(value); }
    else throw new Error('Expected a number, x or supported function.');
    depth--; return answer;
  };
  const power = (): Expr => { const left = atom(); return tokens[at] === '^' ? (at++, b('^', left, unary())) : left; };
  const unary = (): Expr => tokens[at] === '-' ? (at++, { type: 'neg', child: unary() }) : tokens[at] === '+' ? (at++, unary()) : power();
  const product = (): Expr => {
    let left = unary();
    while (tokens[at] === '*' || tokens[at] === '/' || (tokens[at] && (tokens[at] === '(' || /^[a-z]/.test(tokens[at]) || /^\d/.test(tokens[at])))) {
      const op = tokens[at] === '/' ? (at++, '/' as const) : tokens[at] === '*' ? (at++, '*' as const) : '*' as const;
      left = b(op, left, unary());
    } return left;
  };
  const add = (): Expr => { let left = product(); while (tokens[at] === '+' || tokens[at] === '-') { const op = tokens[at++] as '+' | '-'; left = b(op, left, product()); } return left; };
  const expression = add(); if (at !== tokens.length) throw new Error('Unexpected expression token.'); return expression;
}
export function evaluate(expr: Expr, x = 0): number {
  let value: number;
  if (expr.type === 'number') value = expr.value;
  else if (expr.type === 'x') value = x;
  else if (expr.type === 'neg') value = -evaluate(expr.child, x);
  else if (expr.type === 'call') { const v = evaluate(expr.child, x); value = ({ sin: Math.sin, cos: Math.cos, exp: Math.exp, ln: Math.log, sqrt: Math.sqrt })[expr.name](v); }
  else { const l = evaluate(expr.left, x), r = evaluate(expr.right, x); value = expr.op === '+' ? l + r : expr.op === '-' ? l - r : expr.op === '*' ? l * r : expr.op === '/' ? l / r : l ** r; }
  if (!Number.isFinite(value)) throw new Error('Expression is outside its real domain or overflows.'); return value;
}
export function simplify(expr: Expr): Expr {
  if (expr.type === 'number' || expr.type === 'x') return expr;
  if (expr.type === 'neg') { const child = simplify(expr.child); return child.type === 'number' ? n(-child.value) : { type: 'neg', child }; }
  if (expr.type === 'call') return { ...expr, child: simplify(expr.child) };
  const left = simplify(expr.left), right = simplify(expr.right);
  if (left.type === 'number' && right.type === 'number') { try { return n(evaluate({ ...expr, left, right })); } catch { /* keep domain-restricted AST */ } }
  if ((expr.op === '+' || expr.op === '-') && right.type === 'number' && right.value === 0) return left;
  if (expr.op === '+' && left.type === 'number' && left.value === 0) return right;
  if (expr.op === '*') {
    if ((left.type === 'number' && left.value === 0) || (right.type === 'number' && right.value === 0)) return n(0);
    if (left.type === 'number' && left.value === 1) return right; if (right.type === 'number' && right.value === 1) return left;
  }
  if ((expr.op === '/' || expr.op === '^') && right.type === 'number' && right.value === 1) return left;
  if (expr.op === '^' && right.type === 'number' && right.value === 0) return n(1);
  return { ...expr, left, right };
}
export function derivative(expr: Expr): Expr {
  if (expr.type === 'number') return n(0); if (expr.type === 'x') return n(1); if (expr.type === 'neg') return { type: 'neg', child: derivative(expr.child) };
  if (expr.type === 'call') {
    const u = expr.child, du = derivative(u);
    const outer = expr.name === 'sin' ? call('cos', u) : expr.name === 'cos' ? { type: 'neg' as const, child: call('sin', u) } : expr.name === 'exp' ? call('exp', u) : expr.name === 'ln' ? b('/', n(1), u) : b('/', n(1), b('*', n(2), call('sqrt', u)));
    return simplify(b('*', outer, du));
  }
  const u = expr.left, v = expr.right, du = derivative(u), dv = derivative(v);
  if (expr.op === '+' || expr.op === '-') return simplify(b(expr.op, du, dv));
  if (expr.op === '*') return simplify(b('+', b('*', du, v), b('*', u, dv)));
  if (expr.op === '/') return simplify(b('/', b('-', b('*', du, v), b('*', u, dv)), b('^', v, n(2))));
  if (v.type === 'number') return simplify(b('*', b('*', v, b('^', u, n(v.value - 1))), du));
  return simplify(b('*', expr, b('+', b('*', dv, call('ln', u)), b('*', v, b('/', du, u)))));
}
export function expressionText(expr: Expr): string {
  if (expr.type === 'number') return String(expr.value); if (expr.type === 'x') return 'x'; if (expr.type === 'neg') return `(-${expressionText(expr.child)})`; if (expr.type === 'call') return `${expr.name}(${expressionText(expr.child)})`;
  return `(${expressionText(expr.left)} ${expr.op} ${expressionText(expr.right)})`;
}
export function polynomial(expr: Expr, maxDegree = 12): number[] {
  const trim = (a: number[]) => { while (a.length > 1 && a.at(-1) === 0) a.pop(); if (a.length > maxDegree + 1 || a.some(x => !Number.isFinite(x) || Math.abs(x) > 1e12)) throw new Error('Polynomial exceeds degree/coefficient caps.'); return a; };
  const sum = (a: number[], c: number[], sign = 1) => trim(Array.from({ length: Math.max(a.length, c.length) }, (_, i) => (a[i] ?? 0) + sign * (c[i] ?? 0)));
  const product = (a: number[], c: number[]) => { const out = Array(a.length + c.length - 1).fill(0); a.forEach((x, i) => c.forEach((y, j) => { out[i + j] += x * y; })); return trim(out); };
  const parse = (e: Expr): number[] => {
    if (e.type === 'number') return [e.value]; if (e.type === 'x') return [0, 1]; if (e.type === 'neg') return parse(e.child).map(x => -x);
    if (e.type !== 'binary') throw new Error('This operation supports polynomials only; no guessed general integral/solution.');
    const a = parse(e.left);
    if (e.op === '^') { if (e.right.type !== 'number' || !Number.isInteger(e.right.value) || e.right.value < 0 || e.right.value > maxDegree) throw new Error('Polynomial powers must be nonnegative integers within the degree cap.'); let out = [1]; for (let i = 0; i < e.right.value; i++) out = product(out, a); return out; }
    const c = parse(e.right); if (e.op === '+') return sum(a, c); if (e.op === '-') return sum(a, c, -1); if (e.op === '*') return product(a, c);
    if (c.length !== 1 || c[0] === 0) throw new Error('Polynomial division requires a nonzero constant denominator.'); return trim(a.map(x => x / c[0]));
  }; return trim(parse(expr));
}
export function polynomialText(coefficients: number[]): string {
  const parts = coefficients.flatMap((value, power) => value === 0 ? [] : [`${value}${power ? `*x${power === 1 ? '' : `^${power}`}` : ''}`]); return parts.join(' + ').replaceAll('+ -', '- ') || '0';
}
export function integralPolynomial(expr: Expr): number[] { return [0, ...polynomial(expr).map((value, degree) => value / (degree + 1))]; }
export function polynomialValue(coefficients: number[], x: number): number { const value = coefficients.reduceRight((sum, c) => sum * x + c, 0); if (!Number.isFinite(value)) throw new Error('Polynomial evaluation overflow.'); return value; }
export function solvePolynomialEquation(source: string) {
  const sides = source.split('='); if (sides.length !== 2) throw new Error('Use one equality sign.');
  const coefficients = polynomial(b('-', parseExpression(sides[0]), parseExpression(sides[1])), 2), [c, bb = 0, a = 0] = coefficients;
  if (coefficients.length === 1) return { coefficients, roots: [] as number[], message: c === 0 ? 'Every real x satisfies this identity.' : 'No solution: nonzero constant cannot equal zero.', imaginary: null as number | null };
  if (a === 0) return { coefficients, roots: [-c / bb], message: 'Linear equation', imaginary: null };
  const discriminant = bb * bb - 4 * a * c;
  if (discriminant < 0) return { coefficients, roots: [-bb / (2 * a)], message: 'Complex conjugate roots: real part ± imaginary part·i', imaginary: Math.sqrt(-discriminant) / (2 * Math.abs(a)) };
  if (discriminant === 0) return { coefficients, roots: [-bb / (2 * a)], message: 'Repeated real root', imaginary: null };
  const q = -0.5 * (bb + (bb >= 0 ? 1 : -1) * Math.sqrt(discriminant));
  return { coefficients, roots: [q / a, c / q].sort((x, y) => x - y), message: 'Two real roots', imaginary: null };
}
