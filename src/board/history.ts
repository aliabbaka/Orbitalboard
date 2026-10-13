import { parseBoard } from './schema.js';
import type { BoardDocument, BoardObject, Pin } from './types.js';

/** Replay changes data only. Events never execute downloads, network requests, AI or arbitrary code. */
export class BoardHistory {
  constructor(public document: BoardDocument) {}
  commit(kind: string, before: BoardObject[], after: BoardObject[], pins: Pin[] | null = null): void {
    const previous = structuredClone(this.document);
    const event = { id: crypto.randomUUID(), date: new Date().toISOString(), kind, before: structuredClone(before), after: structuredClone(after),
      pinsBefore: pins === null ? null : structuredClone(this.document.pins), pinsAfter: pins === null ? null : structuredClone(pins) };
    this.document.events = this.document.events.slice(0, this.document.cursor);
    this.document.events.push(event); this.apply(before, after, pins); this.document.cursor++;
    if (this.document.events.length > 100) { this.document.events.shift(); this.document.cursor--; }
    try { parseBoard(this.document); } catch (error) { this.document = previous; throw error; }
  }
  private apply(before: BoardObject[], after: BoardObject[], pins: Pin[] | null): void {
    const ids = new Set([...before, ...after].map(o => o.id));
    this.document.objects = this.document.objects.filter(o => !ids.has(o.id)).concat(structuredClone(after));
    if (pins !== null) this.document.pins = structuredClone(pins);
  }
  seek(cursor: number): void {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > this.document.events.length) throw new Error('Invalid history position.');
    while (this.document.cursor > cursor) { const event = this.document.events[--this.document.cursor]; this.apply(event.after, event.before, event.pinsBefore); }
    while (this.document.cursor < cursor) { const event = this.document.events[this.document.cursor++]; this.apply(event.before, event.after, event.pinsAfter); }
  }
  undo(): void { if (this.document.cursor) this.seek(this.document.cursor - 1); }
  redo(): void { if (this.document.cursor < this.document.events.length) this.seek(this.document.cursor + 1); }
}
