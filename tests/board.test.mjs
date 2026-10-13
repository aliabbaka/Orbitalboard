import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard, parseBoard, validateSnapshot } from '../dist/board/schema.js';
import { BoardHistory } from '../dist/board/history.js';
import { encodeSnapshot, decodeSnapshot, makeSnapshot, encodeFragment, decodeFragment } from '../dist/board/snapshot.js';
import { parseFormula, formulaElectrons } from '../dist/board/formula.js';
import { boardSVG, checkDiagram, resolved } from '../dist/board/render.js';
import { portableBoard, regionBoard, qrSVG } from '../dist/board/export.js';
import { movedObject } from '../dist/board/canvas.js';
import { system } from './helpers.mjs';

function moleculeBoard() { const doc = emptyBoard(); doc.systems.model = makeSnapshot(system('O2')); doc.objects.push({ id: 'mol', type: 'molecule', systemId: 'model', x: 80, y: 80, width: 320, height: 175 }); return doc; }

test('formula grammar and valence counts are deterministic, verified and versioned', () => {
  for (const [formula, count] of [['NH3', 8], ['CO₂', 16], ['H2O', 8], ['CH4', 8], ['C6H6', 30], ['He2', 4], ['N2', 10], ['O2', 12], ['F2', 14]]) {
    assert.equal(formulaElectrons(formula).electrons, count); assert.equal(formulaElectrons(formula).version, '1.0.0');
  }
  assert.deepEqual(parseFormula('CH3CH3'), { C: 2, H: 6 });
  for (const formula of ['NaCl', 'B2', 'C31', 'H0', '2H2', '<script>', 'Ca(OH)2']) assert.throws(() => parseFormula(formula));
});

test('versioned board round-trip rejects forged results, unsafe assets and unavailable versions', () => {
  const doc = moleculeBoard(); assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(doc))), doc);
  for (const mutation of [d => { d.schemaVersion = 99; }, d => { d.engines.eht = '99'; }, d => { d.objects[0].value = 999; }, d => { d.systems.model.solverVersion = 'other'; }, d => { d.objects[0].systemId = 'missing'; }, d => { d.objects[0].x = NaN; }, d => { d.objects[0].id = '__proto__'; }, d => { d.media.bad = 'data:image/svg+xml,<svg onload="evil()"/>'; }, d => { d.media.bad = 'https://attacker.invalid/pixel.png'; }]) {
    const bad = structuredClone(doc); mutation(bad); assert.throws(() => parseBoard(bad));
  }
  const snapshot = makeSnapshot(system('O2')); snapshot.view.orbital = 999; assert.throws(() => validateSnapshot(snapshot));
});

test('undo/redo and replay preserve object moves, ink tokens and pins without executing side effects', () => {
  const history = new BoardHistory(emptyBoard());
  const ink = { id: 'ink', type: 'ink', x: 10, y: 10, width: 20, height: 20, points: [[10, 10], [30, 30]], token: 'ink', strokeWidth: 2 };
  history.commit('ink_created', [], [ink]); history.commit('objects_moved', [ink], [movedObject(ink, 40, 20)]);
  assert.deepEqual(history.document.objects[0].points, [[50, 30], [70, 50]]);
  history.undo(); assert.deepEqual(history.document.objects[0], ink); history.undo(); assert.equal(history.document.objects.length, 0);
  history.redo(); history.redo(); assert.equal(history.document.objects[0].x, 50);
  history.seek(0); assert.equal(history.document.cursor, 0); history.seek(2); assert.equal(history.document.cursor, 2);
  const before = structuredClone(history.document); assert.throws(() => history.commit('malformed', [], [{ ...ink, id: 'other', points: [[Infinity, 0]] }])); assert.deepEqual(history.document, before);
});

test('safe sharing omits erased content and prunes unreferenced systems/media by default', () => {
  const history = new BoardHistory(moleculeBoard()); const secret = { id: 'secret', type: 'text', text: 'private erased note', x: 500, y: 60, width: 300, height: 90 };
  history.commit('created', [], [secret]); history.commit('erased', [secret], []); history.document.systems.unreferenced = makeSnapshot(system('NH3'));
  const safe = portableBoard(history.document); assert.equal(safe.events.length, 0); assert.equal('unreferenced' in safe.systems, false); assert.ok(!JSON.stringify(safe).includes('private erased note'));
  const withHistory = portableBoard(history.document, true); assert.ok(JSON.stringify(withHistory).includes('private erased note')); assert.equal(withHistory.events.length, 2);
});

test('SVG exports escape board text, flip semantic ink and include only selected provenance', () => {
  const doc = moleculeBoard(); doc.systems.other = makeSnapshot(system('NH3'));
  const text = { id: 'text', type: 'text', text: '<script>alert(1)</script>', x: 20, y: 20, width: 300, height: 90 };
  doc.objects.push(text); const svg = boardSVG(doc, [text], 'light'); assert.ok(svg.includes('&lt;script&gt;')); assert.ok(!svg.includes('<script>')); assert.ok(!svg.includes('NH3'));
  const ink = { id: 'ink', type: 'ink', x: 10, y: 10, width: 20, height: 20, points: [[10, 10], [30, 30]], token: 'ink', strokeWidth: 2 }; doc.objects.push(ink);
  assert.ok(boardSVG(doc, [ink], 'dark').includes('stroke="#f2f2f2"')); assert.ok(boardSVG(doc, [ink], 'light').includes('stroke="#171717"'));
});

test('diagram comparison checks occupations and low-high order, with Pauli enforced on input', () => {
  const doc = moleculeBoard(), result = resolved(doc.systems.model);
  const levels = result.orbitals.map(o => ({ orbital: o.index, arrows: [...(o.occupation.up ? ['up'] : []), ...(o.occupation.down ? ['down'] : [])] }));
  assert.deepEqual(checkDiagram(result, levels), []); const wrong = structuredClone(levels); wrong[5].arrows = ['up', 'down']; wrong[6].arrows = [];
  assert.ok(checkDiagram(result, wrong).length >= 2);
  const bad = structuredClone(doc); bad.objects.push({ id: 'lad', type: 'ladder', systemId: 'model', x: 0, y: 0, width: 300, height: 300, levels: [{ orbital: 0, arrows: ['up', 'up'] }] }); assert.throws(() => parseBoard(bad), /Pauli/);
});

test('compressed snapshot and region links preserve exact source state and view settings', async () => {
  const snapshot = makeSnapshot(system('NH3')); snapshot.view.orbital = 3; snapshot.view.camera = { position: [4, 2, 8], target: [0, 0, 0] };
  assert.deepEqual(await decodeSnapshot(await encodeSnapshot(snapshot)), snapshot);
  const doc = moleculeBoard(); const decoded = await decodeFragment(await encodeFragment(doc)); assert.deepEqual(parseBoard(decoded), doc);
  await assert.rejects(() => decodeSnapshot('z.not-valid!!'));
  const bad = structuredClone(snapshot); bad.solverVersion = 'future'; await assert.rejects(() => encodeSnapshot(bad));
});

test('QR exports are actual monochrome matrix codes with a quiet zone and useful size cap', () => {
  const svg = qrSVG('https://example.org/b/123456789012345678901234'); assert.match(svg, /<svg/); assert.match(svg, /viewBox/); assert.match(svg, /path/); assert.throws(() => qrSVG('x'.repeat(2400)), /too long/);
});

test('frozen note regions survive source deletion and keep exactly their referenced systems', () => {
  const doc = moleculeBoard(); doc.systems.other = makeSnapshot(system('CH4'));
  const pin = { id: 'p', title: 'Captured', region: structuredClone(doc.objects) }; doc.objects = [];
  const reopened = regionBoard(pin, doc); assert.equal(reopened.objects[0].id, 'mol'); assert.equal(Object.keys(reopened.systems).length, 1); assert.equal(reopened.systems.model.state.atoms[0].element, 'O');
});
