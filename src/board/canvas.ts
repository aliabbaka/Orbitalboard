import type { BoardDocument, BoardObject } from './types.js';
import { objectSVG, selectionBounds } from './render.js';

export type Tool = 'select' | 'pen' | 'text' | 'eraser';
export function movedObject(object: BoardObject, dx: number, dy: number): BoardObject {
  const copy = structuredClone(object); copy.x += dx; copy.y += dy;
  if (copy.type === 'ink') copy.points = copy.points.map(p => [p[0] + dx, p[1] + dy]); return copy;
}
export class BoardCanvas {
  selected = new Set<string>();
  tool: Tool = 'select';
  private drag: { start: [number, number]; current: [number, number]; kind: 'move' | 'box' | 'pen' | 'pan'; before: BoardObject[]; shift: boolean; points: [number, number][]; view: [number, number, number, number]; client?: [number, number]; scale?: number } | null = null;
  constructor(readonly svg: SVGSVGElement, readonly doc: () => BoardDocument, readonly editable: () => boolean,
    readonly change: (kind: string, before: BoardObject[], after: BoardObject[]) => void,
    readonly selectedChanged: () => void, readonly placeText: (x: number, y: number) => void) {
    svg.onpointerdown = event => this.down(event); svg.onpointermove = event => this.move(event); svg.onpointerup = () => this.up();
    svg.onpointercancel = () => { this.drag = null; this.render(); };
    svg.ondblclick = event => { if (this.editable() && this.tool === 'select' && !(event.target as Element).closest('[data-object]')) { const [x, y] = this.point(event); placeText(x, y); } };
  }
  objects(): BoardObject[] { return this.doc().objects.filter(o => this.selected.has(o.id)); }
  select(id: string, additive = false): void { if (!additive) this.selected.clear(); this.selected.add(id); this.render(); this.selectedChanged(); }
  point(event: PointerEvent | MouseEvent): [number, number] {
    const point = this.svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const world = point.matrixTransform(this.svg.getScreenCTM()!.inverse()); return [world.x, world.y];
  }
  screen(x: number, y: number): [number, number] {
    const p = this.svg.createSVGPoint(); p.x = x; p.y = y; const screen = p.matrixTransform(this.svg.getScreenCTM()!); const r = this.svg.getBoundingClientRect(); return [screen.x - r.left, screen.y - r.top];
  }
  render(): void {
    const doc = this.doc(), dark = document.documentElement.dataset.theme !== 'light';
    this.svg.setAttribute('viewBox', doc.viewBox.join(' ')); this.svg.style.cursor = this.tool === 'pen' ? 'crosshair' : this.tool === 'text' ? 'text' : 'default';
    let objects = doc.objects;
    if (this.drag?.kind === 'move') { const dx = this.drag.current[0] - this.drag.start[0], dy = this.drag.current[1] - this.drag.start[1]; objects = objects.map(o => this.selected.has(o.id) ? movedObject(o, dx, dy) : o); }
    let content = `<defs><pattern id="board-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="${dark ? '#303030' : '#d3d3d3'}"/></pattern></defs><rect x="${doc.viewBox[0]}" y="${doc.viewBox[1]}" width="${doc.viewBox[2]}" height="${doc.viewBox[3]}" fill="url(#board-grid)"/>`;
    content += objects.map(o => objectSVG(o, doc, dark ? 'dark' : 'light')).join('');
    for (const o of objects.filter(o => this.selected.has(o.id))) content += `<rect x="${o.x - 5}" y="${o.y - 5}" width="${o.width + 10}" height="${o.height + 10}" fill="none" stroke="${dark ? '#fff' : '#000'}" stroke-dasharray="5 4" pointer-events="none"/>`;
    if (this.drag?.kind === 'box') { const [x, y] = this.drag.start, [xx, yy] = this.drag.current; content += `<rect x="${Math.min(x, xx)}" y="${Math.min(y, yy)}" width="${Math.abs(xx - x)}" height="${Math.abs(yy - y)}" fill="none" stroke="${dark ? '#fff' : '#000'}" stroke-dasharray="4 4"/>`; }
    if (this.drag?.kind === 'pen') content += `<polyline points="${this.drag.points.map(p => p.join(',')).join(' ')}" stroke="${dark ? '#fff' : '#000'}" stroke-width="2" fill="none"/>`;
    this.svg.innerHTML = content;
    this.svg.setAttribute('aria-label', `${doc.objects.length} board objects. Select with the keyboard object list, or drag a rectangle around content. Nothing new is solved until an action is chosen.`);
  }
  private down(event: PointerEvent): void {
    const point = this.point(event); const id = (event.target as Element).closest('[data-object]')?.getAttribute('data-object');
    if (event.button === 1 || event.altKey) { event.preventDefault(); this.drag = { start: point, current: point, kind: 'pan', before: [], shift: false, points: [], view: [...this.doc().viewBox], client: [event.clientX, event.clientY], scale: 1 / this.svg.getScreenCTM()!.a }; }
    else if (this.tool === 'text' && this.editable()) { this.placeText(...point); return; }
    else if (this.tool === 'eraser' && this.editable()) { if (id) { const object = this.doc().objects.find(o => o.id === id)!; this.change('object_erased', [object], []); this.selected.delete(id); } return; }
    else if (this.tool === 'pen' && this.editable()) { this.drag = { start: point, current: point, kind: 'pen', before: [], shift: false, points: [point], view: [...this.doc().viewBox] }; }
    else if (this.tool === 'select') {
      if (id) { if (!event.shiftKey && !this.selected.has(id)) this.selected.clear(); if (event.shiftKey && this.selected.has(id)) this.selected.delete(id); else this.selected.add(id); }
      else if (!event.shiftKey) this.selected.clear();
      this.drag = { start: point, current: point, kind: id && this.editable() ? 'move' : 'box', before: structuredClone(this.objects()), shift: event.shiftKey, points: [], view: [...this.doc().viewBox] };
      this.selectedChanged(); this.render();
    } else return;
    this.svg.setPointerCapture(event.pointerId);
  }
  private move(event: PointerEvent): void {
    if (!this.drag) return;
    const point = this.point(event); this.drag.current = point;
    if (this.drag.kind === 'pen') { const last = this.drag.points.at(-1)!; if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 2 && this.drag.points.length < 2000) this.drag.points.push(point); }
    if (this.drag.kind === 'pan') { const [x, y, w, h] = this.drag.view, [cx, cy] = this.drag.client!; this.doc().viewBox = [Math.max(-10000, Math.min(10000, x - (event.clientX - cx) * this.drag.scale!)), Math.max(-10000, Math.min(10000, y - (event.clientY - cy) * this.drag.scale!)), w, h]; }
    this.render();
  }
  private up(): void {
    const drag = this.drag; if (!drag) return; this.drag = null;
    if (drag.kind === 'pen') {
      const xs = drag.points.map(p => p[0]), ys = drag.points.map(p => p[1]);
      this.change('ink_created', [], [{ id: crypto.randomUUID(), type: 'ink', x: Math.min(...xs), y: Math.min(...ys), width: Math.max(1, Math.max(...xs) - Math.min(...xs)), height: Math.max(1, Math.max(...ys) - Math.min(...ys)), points: drag.points, token: 'ink', strokeWidth: 2 }]);
    } else if (drag.kind === 'move') {
      let dx = drag.current[0] - drag.start[0], dy = drag.current[1] - drag.start[1];
      if ((document.getElementById('board-snap') as HTMLInputElement).checked) { dx = Math.round(dx / 20) * 20; dy = Math.round(dy / 20) * 20; }
      if (dx || dy) this.change('objects_moved', drag.before, drag.before.map(o => movedObject(o, dx, dy)));
    } else if (drag.kind === 'box') {
      const left = Math.min(drag.start[0], drag.current[0]), right = Math.max(drag.start[0], drag.current[0]), top = Math.min(drag.start[1], drag.current[1]), bottom = Math.max(drag.start[1], drag.current[1]);
      if (!drag.shift) this.selected.clear();
      if (right - left > 3 && bottom - top > 3) this.doc().objects.filter(o => o.x <= right && o.x + o.width >= left && o.y <= bottom && o.y + o.height >= top).forEach(o => this.selected.add(o.id));
    }
    this.render(); this.selectedChanged();
  }
  fit(): void { const b = selectionBounds(this.doc().objects); const ratio = this.svg.clientWidth / Math.max(1, this.svg.clientHeight); const width = Math.max(700, b.width + 80, (b.height + 80) * ratio); this.doc().viewBox = [b.x - 40, b.y - 40, width, width / ratio]; this.render(); }
  zoom(factor: number): void { const [x, y, w, h] = this.doc().viewBox; const nw = Math.max(200, Math.min(15000, w * factor)), nh = h * nw / w; this.doc().viewBox = [x + (w - nw) / 2, y + (h - nh) / 2, nw, nh]; this.render(); this.selectedChanged(); }
}
