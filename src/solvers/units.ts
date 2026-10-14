import { fields, numeric, object, text } from './validation.js';
import type { Quantity } from './types.js';

type Dimension = readonly [number, number, number, number, number]; // kg, m, s, mol, K
interface Unit { factor: number; dimension: Dimension; offset?: number }
const U: Readonly<Record<string, Unit>> = {
  '1': { factor: 1, dimension: [0, 0, 0, 0, 0] }, '%': { factor: .01, dimension: [0, 0, 0, 0, 0] },
  kg: { factor: 1, dimension: [1, 0, 0, 0, 0] }, g: { factor: .001, dimension: [1, 0, 0, 0, 0] }, mg: { factor: 1e-6, dimension: [1, 0, 0, 0, 0] },
  m: { factor: 1, dimension: [0, 1, 0, 0, 0] }, cm: { factor: .01, dimension: [0, 1, 0, 0, 0] },
  L: { factor: .001, dimension: [0, 3, 0, 0, 0] }, mL: { factor: 1e-6, dimension: [0, 3, 0, 0, 0] },
  s: { factor: 1, dimension: [0, 0, 1, 0, 0] }, min: { factor: 60, dimension: [0, 0, 1, 0, 0] }, h: { factor: 3600, dimension: [0, 0, 1, 0, 0] },
  mol: { factor: 1, dimension: [0, 0, 0, 1, 0] }, mmol: { factor: .001, dimension: [0, 0, 0, 1, 0] },
  K: { factor: 1, dimension: [0, 0, 0, 0, 1] }, '°C': { factor: 1, offset: 273.15, dimension: [0, 0, 0, 0, 1] },
  Pa: { factor: 1, dimension: [1, -1, -2, 0, 0] }, kPa: { factor: 1000, dimension: [1, -1, -2, 0, 0] },
  bar: { factor: 100000, dimension: [1, -1, -2, 0, 0] }, atm: { factor: 101325, dimension: [1, -1, -2, 0, 0] }, torr: { factor: 101325 / 760, dimension: [1, -1, -2, 0, 0] },
  J: { factor: 1, dimension: [1, 2, -2, 0, 0] }, kJ: { factor: 1000, dimension: [1, 2, -2, 0, 0] },
};
export function unit(expression: string): Unit {
  const source = expression.trim().replaceAll('M', 'mol/L').replaceAll('degC', '°C').replaceAll('³', '^3').replaceAll('²', '^2').replaceAll('·', '*').replace(/\s+/g, '*');
  if (Object.hasOwn(U, source)) return U[source];
  const parts = source.split(/([*/])/); if (!source || parts.length > 15) throw new Error('Missing/overly complex unit. Use supported units and integer powers.');
  const dim = [0, 0, 0, 0, 0]; let factor = 1, sign = 1;
  for (const part of parts) {
    if (part === '*') { sign = 1; continue; } if (part === '/') { sign = -1; continue; }
    const match = /^([A-Za-z°%]+|1)(?:\^(-?\d+))?$/.exec(part), base = match && U[match[1]];
    if (!base || base.offset !== undefined) throw new Error(`Unsupported/affine compound unit: ${expression}. Celsius is only an absolute temperature unit.`);
    const power = Number(match![2] ?? 1) * sign; if (Math.abs(power) > 6) throw new Error('Unit exponent is too large.');
    factor *= base.factor ** power; base.dimension.forEach((x, i) => { dim[i] += x * power; });
  }
  return { factor, dimension: dim as unknown as Dimension };
}
export function convert(value: number, from: string, to: string): number {
  const a = unit(from), b = unit(to); if (a.dimension.some((x, i) => x !== b.dimension[i])) throw new Error(`Inconsistent units: ${from} cannot be converted to ${to}.`);
  const answer = (value * a.factor + (a.offset ?? 0) - (b.offset ?? 0)) / b.factor;
  if (!Number.isFinite(answer)) throw new Error('Unit conversion overflow.'); return answer;
}
export function quantity(value: unknown, target: string, name: string, min = 0, max = 1e12): number {
  const q = object(value); fields(q, ['value', 'unit']); const v = numeric(q.value, name); const source = text(q.unit, `${name} unit`, 40);
  const result = convert(v, source, target); if (result < min || result > max) throw new Error(`${name} must lie in [${min}, ${max}] ${target}.`); return result;
}
export function significantFigures(value: string): number {
  const raw = value.trim().replace(/^[+-]/, ''), mantissa = raw.toLowerCase().split('e')[0];
  let digits = mantissa.replace('.', '').replace(/^0+/, '');
  if (!digits) return Math.max(1, mantissa.includes('.') ? mantissa.split('.')[1].length : 1);
  if (!mantissa.includes('.') && !raw.toLowerCase().includes('e')) digits = digits.replace(/0+$/, '');
  return Math.max(1, Math.min(12, digits.length));
}
export function inputPrecision(inputs: unknown): number {
  const sigs: number[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && 'value' in value && 'unit' in value && typeof (value as Quantity).value === 'string') { sigs.push(significantFigures((value as Quantity).value)); return; }
    Object.values(value).forEach(visit);
  }; visit(inputs); return sigs.length ? Math.min(...sigs) : 6;
}
export function formatNumber(value: number, sigs: number): string {
  if (!Number.isFinite(value)) throw new Error('A solver produced a non-finite number.');
  return value === 0 ? '0' : value.toPrecision(sigs);
}
