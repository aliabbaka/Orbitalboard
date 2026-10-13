import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { sampleOrbitalField } from '../engine/field.js';
import { BOHR_ANGSTROM, requireVerifiedElement } from '../data/parameters.js';
import type { Derived } from '../engine/types.js';
import type { ModelSnapshot } from '../board/types.js';

export type ModelFormat = 'glb' | 'obj' | 'ply' | 'stl' | 'cube' | 'xyz';
export interface ExportOptions { phase: 'both' | 'positive' | 'negative'; includeAtoms: boolean; millimetersPerAngstrom: number }
export function xyzText(snapshot: ModelSnapshot): string {
  return `${snapshot.state.atoms.length}\nOrbitalBoard EHT ${snapshot.solverVersion}; parameters ${snapshot.parameterVersion}; positions in angstrom\n${snapshot.state.atoms.map(a => `${a.element} ${a.position.map(x => (snapshot.state.units === 'bohr' ? x * BOHR_ANGSTROM : x).toPrecision(12)).join(' ')}`).join('\n')}\n`;
}
export function plyText(root: THREE.Object3D, link: string): string {
  const vertices: string[] = [], faces: string[] = []; root.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  root.traverse(object => {
    const mesh = object as THREE.Mesh; if (!mesh.isMesh && !(object as THREE.Points).isPoints) return;
    const geometry = mesh.geometry, attr = geometry.getAttribute('position'), offset = vertices.length;
    const phase = object.userData.phase ?? (object.parent?.name === 'phase_positive' ? 1 : object.parent?.name === 'phase_negative' ? -1 : 0);
    for (let i = 0; i < attr.count; i++) { point.fromBufferAttribute(attr as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld); vertices.push(`${point.toArray().map(x => x.toPrecision(10)).join(' ')} ${phase}`); }
    if (mesh.isMesh) { const index = geometry.index, count = index?.count ?? attr.count; for (let i = 0; i < count; i += 3) faces.push(`3 ${[0, 1, 2].map(j => offset + (index ? index.getX(i + j) : i + j)).join(' ')}`); }
  });
  return `ply\nformat ascii 1.0\ncomment OrbitalBoard; coordinates angstrom; phase +1/-1, atoms 0\ncomment source ${link}\nelement vertex ${vertices.length}\nproperty float x\nproperty float y\nproperty float z\nproperty char phase\nelement face ${faces.length}\nproperty list uchar int vertex_indices\nend_header\n${vertices.join('\n')}\n${faces.join('\n')}\n`;
}
export function cubeText(result: Derived, snapshot: ModelSnapshot, link: string): string {
  const grid = sampleOrbitalField(result, snapshot.view.orbital, snapshot.view.resolution), n = grid.resolution;
  const origin = grid.centerBohr.map(x => x - grid.extentBohr / 2), step = grid.extentBohr / n;
  const lines = [`OrbitalBoard MO ${snapshot.view.orbital + 1}; EHT ${snapshot.solverVersion}; ${snapshot.parameterVersion}; psi in bohr^(-3/2)`, `Reopen ${link}`,
    `${snapshot.state.atoms.length} ${origin.join(' ')}`, `${n} ${step} 0 0`, `${n} 0 ${step} 0`, `${n} 0 0 ${step}`];
  for (const atom of snapshot.state.atoms) {
    const z = requireVerifiedElement(atom.element).atomicNumber;
    lines.push(`${z} ${z} ${atom.position.map(x => snapshot.state.units === 'angstrom' ? x / BOHR_ANGSTROM : x).join(' ')}`);
  }
  // Gaussian cube requires x outermost and z innermost; the on-screen field uses x-fastest.
  let row: string[] = [];
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
    row.push(grid.values[x + n * (y + n * z)].toExponential(7));
    if (row.length === 6) { lines.push(row.join(' ')); row = []; }
  }
  if (row.length) lines.push(row.join(' ')); return lines.join('\n') + '\n';
}

/** Quantized welding + edge incidence, not a full self-intersection or printer certification. */
export function weldedMesh(root: THREE.Object3D, tolerance = 1e-5): { mesh: THREE.Mesh; closed: boolean; edges: number; invalidEdges: number } {
  root.updateMatrixWorld(true);
  const ids = new Map<string, number>(), positions: number[] = [], triangles: number[] = [];
  const point = new THREE.Vector3();
  root.traverse(object => {
    const mesh = object as THREE.Mesh; if (!mesh.isMesh) return;
    const attr = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const count = index?.count ?? attr.count;
    for (let at = 0; at < count; at += 3) {
      const face: number[] = [];
      for (let corner = 0; corner < 3; corner++) {
        point.fromBufferAttribute(attr as THREE.BufferAttribute, index ? index.getX(at + corner) : at + corner).applyMatrix4(mesh.matrixWorld);
        const key = point.toArray().map(x => Math.round(x / tolerance)).join(',');
        if (!ids.has(key)) { ids.set(key, positions.length / 3); positions.push(...point.toArray()); }
        face.push(ids.get(key)!);
      }
      if (new Set(face).size === 3) triangles.push(...face);
    }
  });
  const edges = new Map<string, { count: number; orientation: number }>();
  for (let i = 0; i < triangles.length; i += 3) {
    for (let edge = 0; edge < 3; edge++) {
      const a = triangles[i + edge], b = triangles[i + (edge + 1) % 3], key = `${Math.min(a, b)},${Math.max(a, b)}`;
      const item = edges.get(key) ?? { count: 0, orientation: 0 }; item.count++; item.orientation += a < b ? 1 : -1; edges.set(key, item);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(triangles); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const invalidEdges = [...edges.values()].filter(e => e.count !== 2 || e.orientation !== 0).length;
  return { mesh, closed: triangles.length > 0 && invalidEdges === 0, edges: edges.size, invalidEdges };
}

export async function exportModel(format: ModelFormat, root: THREE.Group | null, result: Derived, snapshot: ModelSnapshot, link: string, options: ExportOptions): Promise<Blob> {
  if (format === 'xyz') return new Blob([xyzText(snapshot)], { type: 'chemical/x-xyz' });
  if (format === 'cube') return new Blob([cubeText(result, snapshot, link)], { type: 'text/plain' });
  if (!root) throw new Error('3D mesh export requires a working 3D viewer. XYZ and cube work without one.');
  const scene = root.clone(true);
  for (const group of [...scene.children]) {
    if ((group.name === 'atoms_and_proximity_connectors' && !options.includeAtoms) || (group.name === 'phase_positive' && options.phase === 'negative') || (group.name === 'phase_negative' && options.phase === 'positive')) scene.remove(group);
  }
  const metadata = { system: snapshot.state, solverVersion: snapshot.solverVersion, parameterVersion: snapshot.parameterVersion, selectedOrbital: snapshot.view.orbital,
    isovalue: snapshot.view.isovalue, gridResolution: snapshot.view.resolution, source: link, phase: options.phase, warnings: result.warnings,
    physicalCoordinates: 'angstrom', displayScale: 'Educational enlarged model: 1 glTF meter represents 1 angstrom; NOT physical scale. OBJ/PLY coordinates use angstrom.', phaseEncoding: 'named positive/negative objects; wireframe style metadata, not hue' };
  scene.userData = metadata;
  let renderables = 0; scene.traverse(object => { if ((object as THREE.Mesh).isMesh || (object as THREE.Points).isPoints) renderables++; });
  if (!renderables) throw new Error('No selected meshes/points are available. Switch to surface/cloud mode or include atoms.');
  if (format === 'glb') {
    const buffer = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true });
    return new Blob([buffer as ArrayBuffer], { type: 'model/gltf-binary' });
  }
  if (format === 'stl') {
    if (options.includeAtoms || options.phase === 'both' || snapshot.view.mode !== 'surface') throw new Error('STL is restricted to one orbital phase, surface mode, and no atoms/connectors. Intersecting assemblies are not a boolean union.');
    const field = sampleOrbitalField(result, snapshot.view.orbital, snapshot.view.resolution);
    if (field.boundaryMax >= snapshot.view.isovalue) throw new Error('The grid clips this surface; STL is disabled. Increase the isovalue.');
    if (!Number.isFinite(options.millimetersPerAngstrom) || options.millimetersPerAngstrom < 1 || options.millimetersPerAngstrom > 100) throw new Error('Print scale must be 1–100 mm per angstrom.');
    scene.scale.setScalar(options.millimetersPerAngstrom);
    const welded = weldedMesh(scene);
    try {
      if (!welded.closed) throw new Error(`STL disabled: ${welded.invalidEdges} boundary/nonmanifold edges. Use GLB, OBJ, PLY or a different grid/isovalue.`);
      welded.mesh.name = `OrbitalBoard_${snapshot.solverVersion}_${snapshot.parameterVersion}_scaled_mm_per_angstrom_${options.millimetersPerAngstrom}`;
      return new Blob([new STLExporter().parse(welded.mesh, { binary: false })], { type: 'model/stl' });
    } finally { welded.mesh.geometry.dispose(); (welded.mesh.material as THREE.Material).dispose(); }
  }
  if (format === 'obj') {
    if (snapshot.view.mode === 'cloud') throw new Error('OBJ does not carry this probability cloud. Use PLY or GLB, or switch to surface mode.');
    return new Blob([`# ${JSON.stringify(metadata)}\n${new OBJExporter().parse(scene)}`], { type: 'text/plain' });
  }
  return new Blob([plyText(scene, link).replace('format ascii 1.0', `format ascii 1.0\ncomment EHT ${snapshot.solverVersion}; parameters ${snapshot.parameterVersion}; isovalue ${snapshot.view.isovalue}; grid ${snapshot.view.resolution}`)], { type: 'application/octet-stream' });
}
