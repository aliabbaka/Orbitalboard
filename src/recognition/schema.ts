import { classifyTyped } from '../solvers/classify.js';
import type { Level } from '../board/types.js';

export const RECOGNITION_VERSION = 'ink-grammar-1.0.0';
export const KINDS = ['chemical-formula', 'chemical-equation', 'math-expression', 'math-equation', 'energy-diagram', 'question', 'unknown'] as const;
export type ReadingKind = typeof KINDS[number];
export interface ReadLevel { orbital: number | null; relativeY: number; arrows: ('up' | 'down')[] }
export interface Reading {
  schemaVersion: 1;
  kind: ReadingKind;
  text: string;
  levels: ReadLevel[] | null;
  confidence: number;
  ambiguities: string[];
}
const record = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Reading must be an object.'); return value as Record<string, unknown>; };
const keys = (value: Record<string, unknown>, allowed: string[]) => { if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error('Unexpected recognition fields, answers or tool calls are rejected.'); };
export function levelsText(levels: ReadLevel[]): string {
  return levels.map((level, i) => `${(level.orbital ?? i) + 1}:${level.arrows.length ? ' ' + level.arrows.map(a => a === 'up' ? '↑' : '↓').join('') : ''}`).join('\n');
}
export function validateReading(raw: unknown): Reading {
  const value = record(raw); keys(value, ['schemaVersion', 'kind', 'text', 'levels', 'confidence', 'ambiguities']);
  if (value.schemaVersion !== 1 || !KINDS.includes(value.kind as ReadingKind)) throw new Error('Unsupported recognition schema/kind.');
  if (typeof value.text !== 'string' || value.text.length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value.text)) throw new Error('Invalid transcription text.');
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new Error('Invalid uncalibrated confidence score.');
  if (!Array.isArray(value.ambiguities) || value.ambiguities.length > 8 || value.ambiguities.some(s => typeof s !== 'string' || s.length > 240)) throw new Error('Invalid ambiguity list.');
  const kind = value.kind as ReadingKind;
  if (kind === 'energy-diagram') {
    if (!Array.isArray(value.levels) || !value.levels.length || value.levels.length > 120) throw new Error('Energy diagrams need 1–120 input levels.');
    const seen = new Set<number>();
    for (const rawLevel of value.levels) {
      const level = record(rawLevel); keys(level, ['orbital', 'relativeY', 'arrows']);
      if (level.orbital !== null) { if (typeof level.orbital !== 'number' || !Number.isInteger(level.orbital) || level.orbital < 0 || level.orbital > 119 || seen.has(level.orbital)) throw new Error('Diagram orbital numbers must be unique zero-based indices.'); seen.add(level.orbital); }
      if (typeof level.relativeY !== 'number' || !Number.isFinite(level.relativeY) || level.relativeY < 0 || level.relativeY > 1) throw new Error('Invalid relative level position.');
      if (!Array.isArray(level.arrows) || level.arrows.length > 2 || new Set(level.arrows).size !== level.arrows.length || level.arrows.some(a => a !== 'up' && a !== 'down')) throw new Error('Pauli: at most one up and one down arrow per level.');
    }
    const levels = value.levels as ReadLevel[];
    if (value.text.trim() !== levelsText(levels)) throw new Error('Diagram transcription must exactly match its input level/arrow schema. No energies or extra answers.');
  } else {
    if (value.levels !== null) throw new Error('Only diagrams may contain levels.');
    if (kind !== 'unknown' && !value.text.trim()) throw new Error('Empty recognition is not an interpretation.');
    if (kind !== 'question' && kind !== 'unknown' && classifyTyped(value.text) !== kind) throw new Error('Transcription does not match its claimed supported grammar. Correct it before computing.');
  }
  return structuredClone(value) as unknown as Reading;
}

/** Manual correction is input data only; this parser never calls a solver. */
export function correctedReading(kind: ReadingKind, text: string, score = 1): Reading {
  let levels: ReadLevel[] | null = null;
  if (kind === 'energy-diagram') {
    const lines = text.trim().split('\n').filter(s => s.trim());
    levels = lines.map((line, i) => { const match = /^(\d+)\s*:\s*([↑↓]*)\s*$/.exec(line); if (!match) throw new Error('Diagram grammar: one low-to-high line such as 1: ↑↓. No energies are inferred.'); return { orbital: Number(match[1]) - 1, relativeY: 1 - i / Math.max(1, lines.length - 1), arrows: [...match[2]].map(a => a === '↑' ? 'up' : 'down') }; });
    text = levelsText(levels);
  }
  return validateReading({ schemaVersion: 1, kind, text: text.trim(), levels, confidence: score, ambiguities: [] });
}
export function confirmedLevels(reading: Reading): Level[] {
  if (reading.kind !== 'energy-diagram' || !reading.levels) throw new Error('Not an energy diagram.');
  const levels = reading.levels.map((l, i) => ({ orbital: l.orbital ?? i, arrows: [...l.arrows] }));
  if (new Set(levels.map(l => l.orbital)).size !== levels.length) throw new Error('Correct the ordinal/explicit MO-number mapping before using this diagram.'); return levels;
}
