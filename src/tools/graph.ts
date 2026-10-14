import type { SolverResult } from '../solvers/types.js';
export function renderGraph(container: HTMLElement, graph: NonNullable<SolverResult['graph']>): void {
  const NS = 'http://www.w3.org/2000/svg'; const create = (tag: string, attrs: Record<string, string | number>, text = '') => { const node = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v))); node.textContent = text; return node; };
  const valid = graph.points.filter(p => p.y !== null), xs = valid.map(p => p.x), ys = valid.map(p => p.y!);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const x = (v: number) => 50 + (v - minX) / Math.max(1e-12, maxX - minX) * 430, y = (v: number) => 18 + (maxY - v) / Math.max(1e-12, maxY - minY) * 160;
  const svg = create('svg', { viewBox: '0 0 500 220', role: 'img', 'aria-label': `Computed sampled ${graph.yLabel} versus ${graph.xLabel}; domain gaps are omitted.` });
  for (let i = 0; i < 4; i++) { const value = minY + (maxY - minY) * i / 3; svg.append(create('line', { x1: 50, x2: 480, y1: y(value), y2: y(value), class: 'grid' }), create('text', { x: 2, y: y(value) + 4 }, value.toPrecision(3))); }
  let path = '', open = false; for (const point of graph.points) { if (point.y === null) { open = false; continue; } path += `${open ? 'L' : 'M'}${x(point.x)},${y(point.y)} `; open = true; }
  svg.append(create('path', { d: path, class: 'curve' }), create('text', { x: 50, y: 201 }, `${graph.xLabel}: ${minX.toPrecision(4)} → ${maxX.toPrecision(4)}`)); container.replaceChildren(svg);
}
