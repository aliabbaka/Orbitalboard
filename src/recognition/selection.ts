import type { BoardObject } from '../board/types.js';
import { escapeXML, selectionBounds } from '../board/render.js';

export interface Stroke { id: string; points: [number, number][] }
export interface SelectionInput {
  schemaVersion: 1;
  strokes: Stroke[];
  typed: { id: string; text: string; x: number; y: number; width: number; height: number }[];
  bounds: { x: number; y: number; width: number; height: number };
}
export function selectionInput(objects: BoardObject[]): SelectionInput {
  if (!objects.length || objects.some(o => o.type !== 'ink' && o.type !== 'text')) throw new Error('Read only selected ink/typed inputs, not solver results, images or unrelated board content.');
  const strokes = objects.flatMap(o => o.type === 'ink' ? [{ id: o.id, points: structuredClone(o.points) }] : []);
  if (strokes.length > 100 || strokes.reduce((sum, s) => sum + s.points.length, 0) > 20000) throw new Error('Recognition selection exceeds 100 strokes / 20000 points. Read a smaller region.');
  return { schemaVersion: 1, strokes, typed: objects.flatMap(o => o.type === 'text' ? [{ id: o.id, text: o.text, x: o.x, y: o.y, width: o.width, height: o.height }] : []), bounds: selectionBounds(objects) };
}
export function selectionSignature(input: SelectionInput): string { return JSON.stringify(input); }
/** Only the selected inputs. No board title, output cards, source matrices or other objects leave the crop. */
export function selectionSVG(input: SelectionInput): string {
  const b = input.bounds, ratio = Math.min(1, 1200 / b.width, 900 / b.height), width = Math.max(32, Math.ceil(b.width * ratio)), height = Math.max(32, Math.ceil(b.height * ratio));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#fff"/>${input.strokes.map(s => `<polyline points="${s.points.map(p => p.join(',')).join(' ')}" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}${input.typed.map(t => `<g fill="#000" font-family="system-ui,sans-serif" font-size="12">${t.text.split('\n').map((line, i) => `<text x="${t.x + 14}" y="${t.y + 52 + i * 24}">${escapeXML(line)}</text>`).join('')}</g>`).join('')}</svg>`;
}
