import { SOLVER_VERSION } from '../engine/eht.js';
import { PARAMETER_VERSION } from '../data/parameters.js';
import { validateState } from '../engine/validation.js';
import { buildBasis } from '../engine/basis.js';
import { fillElectrons } from '../engine/occupation.js';
import { requireVerifiedElement } from '../data/parameters.js';
import { parseFormula } from './formula.js';
import type { BoardDocument, BoardObject, ModelSnapshot, Pin } from './types.js';

export const MAX_BOARD_BYTES = 4 * 1024 * 1024;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
  return value as Record<string, unknown>;
};
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error('Unknown document fields are not allowed.');
}
function text(value: unknown, max: number, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${name} must be text under ${max} characters.`);
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error('Invalid object identifier.');
}
function number(value: unknown, min: number, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('A coordinate or setting is outside its permitted range.');
}
function date(value: unknown): void { text(value, 40, 'Date'); if (!Number.isFinite(Date.parse(value))) throw new Error('Invalid date.'); }
function array(value: unknown, max: number): asserts value is unknown[] { if (!Array.isArray(value) || value.length > max) throw new Error(`List exceeds the ${max}-item limit.`); }
function point(value: unknown): void { array(value, 3); if (value.length !== 3) throw new Error('A 3D vector needs three coordinates.'); value.forEach(v => number(v, -100000, 100000)); }

export function validateSnapshot(value: unknown): ModelSnapshot {
  const s = record(value); keys(s, ['version', 'solverVersion', 'parameterVersion', 'state', 'view']);
  if (s.version !== 1 || s.solverVersion !== SOLVER_VERSION || s.parameterVersion !== PARAMETER_VERSION) throw new Error('The pinned solver/parameter version is unavailable. This state will not be silently upgraded.');
  const state = record(s.state); keys(state, ['atoms', 'units', 'charge', 'multiplicity', 'k']);
  array(state.atoms, 30); state.atoms.forEach(a => keys(record(a), ['id', 'element', 'position']));
  validateState(s.state as ModelSnapshot['state']);
  const typed = s.state as ModelSnapshot['state'];
  const count = typed.atoms.reduce((sum, atom) => sum + requireVerifiedElement(atom.element).valenceElectrons, 0) - (typed.charge ?? 0);
  fillElectrons(Array.from({ length: buildBasis(typed).length }, (_, i) => i), count, typed.multiplicity);
  const view = record(s.view); keys(view, ['orbital', 'mode', 'isovalue', 'resolution', 'camera']);
  number(view.orbital, 0, buildBasis(typed).length - 1); if (!Number.isInteger(view.orbital)) throw new Error('Invalid orbital index.');
  if (!['surface', 'cloud', 'molecule'].includes(String(view.mode))) throw new Error('Invalid view mode.');
  number(view.isovalue, 0.005, 0.2); number(view.resolution, 16, 40); if (!Number.isInteger(view.resolution)) throw new Error('Invalid grid resolution.');
  if (view.camera !== null) { const camera = record(view.camera); keys(camera, ['position', 'target']); point(camera.position); point(camera.target); }
  return structuredClone(value) as ModelSnapshot;
}

export function emptyBoard(): BoardDocument {
  return { schemaVersion: 1, engines: { eht: SOLVER_VERSION, parameters: PARAMETER_VERSION, formula: '1.0.0' }, id: crypto.randomUUID(), title: 'Untitled board', viewBox: [0, 0, 1100, 700], objects: [], systems: {}, media: {}, pins: [], events: [], cursor: 0 };
}

export function parseBoard(value: unknown): BoardDocument {
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_BOARD_BYTES) throw new Error('Board exceeds the 4 MiB limit. Export some pins separately or start another board.');
  const doc = record(value); keys(doc, ['schemaVersion', 'engines', 'id', 'title', 'viewBox', 'objects', 'systems', 'media', 'pins', 'events', 'cursor']);
  if (doc.schemaVersion !== 1) throw new Error('Unsupported board schema. No migration exists for this version.');
  const engines = record(doc.engines); keys(engines, ['eht', 'parameters', 'formula']);
  if (engines.eht !== SOLVER_VERSION || engines.parameters !== PARAMETER_VERSION || engines.formula !== '1.0.0') throw new Error('Pinned board solvers are unavailable. No silent version upgrade is permitted.');
  id(doc.id); text(doc.title, 160, 'Title');
  array(doc.viewBox, 4); if (doc.viewBox.length !== 4) throw new Error('Invalid board viewport.'); doc.viewBox.forEach((v, i) => number(v, i < 2 ? -10000 : 100, i < 2 ? 10000 : 25000));
  const systems = record(doc.systems); if (Object.keys(systems).length > 80) throw new Error('Too many saved systems.');
  for (const [key, snapshot] of Object.entries(systems)) { id(key); validateSnapshot(snapshot); }
  const media = record(doc.media); if (Object.keys(media).length > 80) throw new Error('Too many snapshot images.');
  for (const [key, image] of Object.entries(media)) {
    id(key); text(image, 800000, 'Image');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image)) throw new Error('Only embedded PNG snapshots are permitted, never SVG/HTML or remote image URLs.');
    const bytes = atob(image.slice('data:image/png;base64,'.length));
    if (!bytes.startsWith('\x89PNG\r\n\x1a\n') || bytes.length < 24) throw new Error('Invalid PNG snapshot.');
    const dimension = (at: number) => [...bytes.slice(at, at + 4)].reduce((sum, c) => sum * 256 + c.charCodeAt(0), 0);
    if (dimension(16) < 1 || dimension(20) < 1 || dimension(16) > 1600 || dimension(20) > 1200) throw new Error('Snapshot dimensions exceed the image cap.');
  }
  const validateObject = (raw: unknown): BoardObject => {
    const o = record(raw); id(o.id); number(o.x, -10000, 10000); number(o.y, -10000, 10000); number(o.width, 1, 5000); number(o.height, 1, 5000);
    const base = ['id', 'type', 'x', 'y', 'width', 'height'];
    if (o.type === 'text') { keys(o, [...base, 'text']); text(o.text, 4000, 'Board text'); }
    else if (o.type === 'ink') {
      keys(o, [...base, 'points', 'token', 'strokeWidth']); array(o.points, 2000);
      if (o.points.length < 1 || !['ink', 'muted'].includes(String(o.token))) throw new Error('Invalid ink stroke.');
      number(o.strokeWidth, 1, 12); o.points.forEach(p => { array(p, 2); if (p.length !== 2) throw new Error('Ink point needs two coordinates.'); p.forEach(v => number(v, -10000, 10000)); });
    } else if (o.type === 'answer') { keys(o, [...base, 'formula']); text(o.formula, 80, 'Formula'); parseFormula(o.formula); }
    else if (['molecule', 'orbitals', 'ladder', 'check', 'scan'].includes(String(o.type))) {
      id(o.systemId); if (!Object.hasOwn(systems, o.systemId)) throw new Error('Object references a missing system.');
      const n = buildBasis((systems[o.systemId] as ModelSnapshot).state).length;
      if (o.type === 'ladder' || o.type === 'check') {
        keys(o, [...base, 'systemId', 'levels']); array(o.levels, n);
        const seen = new Set<number>(); o.levels.forEach(rawLevel => {
          const level = record(rawLevel); keys(level, ['orbital', 'arrows']); number(level.orbital, 0, n - 1);
          if (!Number.isInteger(level.orbital) || seen.has(level.orbital)) throw new Error('Each diagram orbital index must be unique.'); seen.add(level.orbital);
          array(level.arrows, 2); if (new Set(level.arrows).size !== level.arrows.length || level.arrows.some(a => a !== 'up' && a !== 'down')) throw new Error('Pauli: each level has at most one up and one down electron.');
        });
      } else if (o.type === 'scan') {
        keys(o, [...base, 'systemId', 'centerId', 'fixedId', 'movingId', 'angles']);
        const handles = [o.centerId, o.fixedId, o.movingId]; const atoms = (systems[o.systemId] as ModelSnapshot).state.atoms;
        if (new Set(handles).size !== 3 || handles.some(h => !atoms.some(a => a.id === h))) throw new Error('Invalid scan handles.');
        array(o.angles, 181); if (!o.angles.length || new Set(o.angles).size !== o.angles.length) throw new Error('Invalid scan samples.'); o.angles.forEach(a => number(a, 1, 180));
      } else keys(o, [...base, 'systemId']);
    } else throw new Error('Unknown board object type.');
    return raw as BoardObject;
  };
  const objects = (raw: unknown): BoardObject[] => {
    array(raw, 200); const ids = new Set<string>(); let points = 0;
    for (const item of raw) { const o = validateObject(item); if (ids.has(o.id)) throw new Error('Duplicate object ID.'); ids.add(o.id); if (o.type === 'ink') points += o.points.length; }
    if (points > 20000) throw new Error('Board ink exceeds 20000 points.'); return raw as BoardObject[];
  };
  const pins = (raw: unknown): Pin[] => {
    array(raw, 20); const ids = new Set<string>();
    raw.forEach(p => {
      const pin = record(p); keys(pin, ['id', 'title', 'caption', 'captionSource', 'tags', 'date', 'alt', 'darkMedia', 'lightMedia', 'systemId', 'region']);
      id(pin.id); if (ids.has(pin.id)) throw new Error('Duplicate pin ID.'); ids.add(pin.id);
      text(pin.title, 160, 'Pin title'); text(pin.caption, 4000, 'Caption'); text(pin.alt, 800, 'Alt text'); date(pin.date);
      if (!['student', 'ai-unverified'].includes(String(pin.captionSource))) throw new Error('Invalid caption source.');
      array(pin.tags, 12); pin.tags.forEach(t => text(t, 40, 'Tag'));
      for (const key of ['darkMedia', 'lightMedia']) { id(pin[key]); if (!Object.hasOwn(media, pin[key])) throw new Error('Missing pin image.'); }
      if (pin.systemId !== null) { id(pin.systemId); if (!Object.hasOwn(systems, pin.systemId)) throw new Error('Missing pin system.'); }
      if (pin.region !== null) objects(pin.region);
    }); return raw as Pin[];
  };
  objects(doc.objects); pins(doc.pins); array(doc.events, 100); const eventIds = new Set<string>();
  doc.events.forEach(raw => {
    const event = record(raw); keys(event, ['id', 'date', 'kind', 'before', 'after', 'pinsBefore', 'pinsAfter']);
    id(event.id); if (eventIds.has(event.id)) throw new Error('Duplicate event ID.'); eventIds.add(event.id); date(event.date); text(event.kind, 80, 'Event kind'); objects(event.before); objects(event.after);
    if ((event.pinsBefore === null) !== (event.pinsAfter === null)) throw new Error('Incomplete pin history.');
    if (event.pinsBefore !== null) { pins(event.pinsBefore); pins(event.pinsAfter); }
  });
  number(doc.cursor, 0, doc.events.length); if (!Number.isInteger(doc.cursor)) throw new Error('Invalid replay cursor.');
  return structuredClone(value) as BoardDocument;
}
