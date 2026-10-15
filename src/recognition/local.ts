import { levelsText, validateReading, type ReadLevel, type Reading } from './schema.js';
import type { SelectionInput, Stroke } from './selection.js';
import { classifyTyped } from '../solvers/classify.js';

type Point = [number, number];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pathLength = (s: Stroke) => s.points.slice(1).reduce((sum, p, i) => sum + distance(s.points[i], p), 0);

/** Conservative geometric helper, not handwritten character OCR. All strokes must be accounted for. */
export function readLocal(input: SelectionInput): Reading | null {
  if (!input.strokes.length && input.typed.length === 1) {
    const text = input.typed[0].text.trim(), kind = classifyTyped(text);
    return kind ? validateReading({ schemaVersion: 1, kind, text, levels: null, confidence: 1, ambiguities: [] }) : null;
  }
  if (input.typed.length || input.strokes.length > 100) return null;
  const used = new Set<string>();
  const lines = input.strokes.flatMap(s => {
    if (s.points.length < 2) return [];
    const first = s.points[0], last = s.points.at(-1)!, dx = Math.abs(last[0] - first[0]), dy = Math.abs(last[1] - first[1]);
    const ys = s.points.map(p => p[1]);
    if (dx < 24 || dy > Math.max(3, dx * .06) || Math.max(...ys) - Math.min(...ys) > Math.max(4, dx * .08) || distance(first, last) / Math.max(1, pathLength(s)) < .95) return [];
    used.add(s.id); return [{ id: s.id, x1: Math.min(first[0], last[0]), x2: Math.max(first[0], last[0]), y: (first[1] + last[1]) / 2, arrows: [] as ('up' | 'down')[] }];
  });
  if (lines.length < 2 || lines.length > 30) return null;
  const remaining = input.strokes.filter(s => !used.has(s.id));
  for (const shaft of remaining) {
    if (used.has(shaft.id) || shaft.points.length < 2) continue;
    // A shaft must be straight and vertical; arrowheads are separate strokes in this local grammar.
    const a = shaft.points[0], b = shaft.points.at(-1)!;
    if (Math.abs(a[1] - b[1]) < 12 || Math.abs(a[0] - b[0]) > 4 || distance(a, b) / Math.max(1, pathLength(shaft)) < .95) continue;
    const top: Point = a[1] < b[1] ? a : b, bottom: Point = a[1] < b[1] ? b : a;
    let direction: 'up' | 'down' | null = null, head: Stroke | null = null;
    for (const candidate of remaining) {
      if (candidate.id === shaft.id || used.has(candidate.id) || candidate.points.length < 3) continue;
      for (const [tip, sign, name] of [[top, 1, 'up'], [bottom, -1, 'down']] as const) {
        const first = candidate.points[0], last = candidate.points.at(-1)!;
        const attached = candidate.points.some(p => distance(p, tip) <= 4);
        if (attached && first[0] < tip[0] - 2 && last[0] > tip[0] + 2 && (first[1] - tip[1]) * sign >= 3 && (last[1] - tip[1]) * sign >= 3 && Math.max(distance(first, tip), distance(last, tip)) <= 18) { direction = name; head = candidate; break; }
      }
      if (head) break;
    }
    if (!head || !direction) continue;
    const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
    const candidates = lines.filter(l => x >= l.x1 - 3 && x <= l.x2 + 3 && Math.abs(l.y - y) <= 32).sort((u, v) => Math.abs(u.y - y) - Math.abs(v.y - y));
    if (!candidates.length || (candidates.length > 1 && Math.abs(candidates[0].y - y) === Math.abs(candidates[1].y - y))) return null;
    const level = candidates[0]; if (level.arrows.includes(direction) || level.arrows.length >= 2) return null;
    level.arrows.push(direction); used.add(shaft.id); used.add(head.id);
  }
  if (used.size !== input.strokes.length) return null;
  const ordered = lines.sort((a, b) => Math.abs(a.y - b.y) <= 5 ? a.x1 - b.x1 : b.y - a.y);
  const levels: ReadLevel[] = ordered.map(line => ({ orbital: null, relativeY: (line.y - input.bounds.y) / input.bounds.height, arrows: [...line.arrows].sort(a => a === 'up' ? -1 : 1) }));
  return validateReading({ schemaVersion: 1, kind: 'energy-diagram', text: levelsText(levels), levels, confidence: .75,
    ambiguities: ['Geometric proposal only: horizontal lines plus separate vertical shafts and V heads.', 'MO numbers are low-to-high ordinal defaults, not recognized symmetry/energy labels. Review every row before accepting.'] });
}
