import type { InputData } from './types.js';
export function object(value: unknown): InputData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Inputs must be a JSON object.');
  if (Object.keys(value).some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error('Reserved input keys are not allowed.');
  return value as InputData;
}
export function fields(inputs: InputData, allowed: string[]): void { if (Object.keys(inputs).some(k => !allowed.includes(k))) throw new Error('Unsupported input field.'); }
export function text(value: unknown, name: string, max = 500): string { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} must be nonempty text under ${max} characters.`); return value.trim(); }
export function numeric(value: unknown, name: string, min = -1e12, max = 1e12): number {
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error(`${name} must be a numeric value.`);
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new Error(`${name} is not a number.`);
  const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} is outside [${min}, ${max}].`); return number;
}
export function integer(value: unknown, name: string, min: number, max: number): number { const n = numeric(value, name, min, max); if (!Number.isInteger(n)) throw new Error(`${name} must be an integer.`); return n; }
export function choice(value: unknown, name: string, allowed: readonly string[]): string { if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`${name}: choose ${allowed.join(', ')}.`); return value; }
export function list(value: unknown, name: string, min = 1, max = 20): unknown[] { if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${name} needs ${min}–${max} entries.`); return value; }
