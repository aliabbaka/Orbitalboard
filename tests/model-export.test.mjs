import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { solve, parseXYZ } from '../dist/index.js';
import { sampleOrbitalField } from '../dist/engine/field.js';
import { makeSnapshot } from '../dist/board/snapshot.js';
import { cubeText, exportModel, weldedMesh, xyzText } from '../dist/lab/model-export.js';
import { BOHR_ANGSTROM } from '../dist/data/parameters.js';
import { close, system } from './helpers.mjs';

function scene(snapshot) {
  const result = solve(snapshot.state), field = sampleOrbitalField(result, snapshot.view.orbital, snapshot.view.resolution), root = new Group();
  for (const sign of [1, -1]) {
    const material = new MeshStandardMaterial(), cubes = new MarchingCubes(field.resolution, material, false, false, 50000);
    cubes.field.set(field.values.map(x => x * sign)); cubes.isolation = snapshot.view.isovalue; cubes.update();
    const group = new Group(); group.name = sign > 0 ? 'phase_positive' : 'phase_negative';
    const mesh = new Mesh(cubes.geometry.clone(), material); mesh.geometry.setDrawRange(0, cubes.count);
    // Export only the populated vertices, as the viewer does.
    mesh.geometry.setAttribute('position', mesh.geometry.getAttribute('position').clone());
    const attr = mesh.geometry.getAttribute('position'); attr.array = attr.array.slice(0, cubes.count * 3); attr.count = cubes.count;
    const normal = mesh.geometry.getAttribute('normal'); normal.array = normal.array.slice(0, cubes.count * 3); normal.count = cubes.count;
    mesh.name = group.name; mesh.userData.phase = sign;
    mesh.scale.setScalar(field.extentBohr * BOHR_ANGSTROM / 2); mesh.position.set(...field.centerBohr.map(x => x * BOHR_ANGSTROM)); group.add(mesh); root.add(group); cubes.geometry.dispose();
  }
  return { root, result, field };
}
const options = { phase: 'positive', includeAtoms: false, millimetersPerAngstrom: 10 };

test('XYZ exports preserve atom positions and explicit angstrom units', () => {
  const snapshot = makeSnapshot(system('NH3')); const parsed = parseXYZ(xyzText(snapshot));
  parsed.atoms.forEach((a, i) => { assert.equal(a.element, snapshot.state.atoms[i].element); a.position.forEach((x, d) => close(x, snapshot.state.atoms[i].position[d], 1e-11)); });
});

test('cube file has correct bohr axes and x-outer/z-inner field ordering', () => {
  const snapshot = makeSnapshot(system('H2')); snapshot.view.resolution = 24;
  const result = solve(snapshot.state), field = sampleOrbitalField(result, 0, 24), lines = cubeText(result, snapshot, 'https://example.org/source').trim().split('\n');
  assert.match(lines[0], /psi in bohr/); assert.match(lines[1], /example.org/);
  const origin = lines[2].trim().split(/\s+/).slice(1).map(Number); origin.forEach((x, d) => close(x, field.centerBohr[d] - field.extentBohr / 2));
  const values = lines.slice(6 + snapshot.state.atoms.length).join(' ').trim().split(/\s+/).map(Number); assert.equal(values.length, 24 ** 3);
  for (const [x, y, z] of [[2, 3, 4], [12, 12, 12], [20, 10, 8]]) close(values[(x * 24 + y) * 24 + z], field.values[x + 24 * (y + 24 * z)], 1e-8);
});

test('OBJ and PLY re-import actual meshes with phase and source information', async () => {
  const snapshot = makeSnapshot(system('H2')), { root, result } = scene(snapshot);
  const obj = await (await exportModel('obj', root, result, snapshot, 'https://example.org/source', options)).text();
  assert.match(obj, /phase_positive/); assert.match(obj, /solverVersion/);
  const imported = new OBJLoader().parse(obj); assert.ok(imported.children.some(c => c.geometry?.getAttribute('position').count > 0));
  const ply = await (await exportModel('ply', root, result, snapshot, 'https://example.org/source', options)).text(); assert.match(ply, /property char phase/);
  const reader = new PLYLoader(); reader.setCustomPropertyNameMapping({ phase: ['phase'] }); const geometry = reader.parse(ply);
  assert.ok(geometry.getAttribute('position').count > 0); assert.ok([...geometry.getAttribute('phase').array].every(p => p === 1));
});

test('STL is gated, welded, closed and re-imports at explicit print scale', async () => {
  const snapshot = makeSnapshot(system('H2')), { root, result } = scene(snapshot);
  const positive = root.children.find(c => c.name === 'phase_positive'); const report = weldedMesh(positive); assert.equal(report.closed, true); assert.equal(report.invalidEdges, 0);
  const stl = await (await exportModel('stl', root, result, snapshot, 'source', options)).text();
  const imported = new STLLoader().parse(new TextEncoder().encode(stl).buffer); imported.computeBoundingBox(); assert.ok(imported.boundingBox.max.x - imported.boundingBox.min.x > 1);
  await assert.rejects(() => exportModel('stl', root, result, snapshot, 'source', { ...options, phase: 'both' }), /restricted/);
  await assert.rejects(() => exportModel('stl', root, result, snapshot, 'source', { ...options, includeAtoms: true }), /restricted/);
  snapshot.view.mode = 'cloud'; await assert.rejects(() => exportModel('stl', root, result, snapshot, 'source', options), /restricted/);
});
