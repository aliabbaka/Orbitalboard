import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBasicMaterial } from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { solve } from '../dist/index.js';
import { sampleOrbitalField } from '../dist/engine/field.js';
import { close, system } from './helpers.mjs';

test('marching-cubes meshes interpolate the actual positive and negative solved fields', () => {
  const result = solve(system('H2'));
  const grid = sampleOrbitalField(result, 1, 28); // antibonding H2 has both phases
  for (const sign of [1, -1]) {
    const material = new MeshBasicMaterial();
    const mesh = new MarchingCubes(grid.resolution, material, false, false, 50000);
    mesh.field.set(grid.values.map(x => x * sign)); mesh.isolation = 0.04; mesh.update();
    assert.ok(mesh.count > 0);
    for (let vertex = 0; vertex < mesh.count; vertex += 17) {
      const cell = [0, 1, 2].map(d => (mesh.positionArray[vertex * 3 + d] + 1) * grid.resolution / 2);
      const base = cell.map(Math.floor), frac = cell.map((x, d) => x - base[d]);
      let interpolated = 0;
      for (let z = 0; z <= 1; z++) for (let y = 0; y <= 1; y++) for (let x = 0; x <= 1; x++) {
        const weight = (x ? frac[0] : 1 - frac[0]) * (y ? frac[1] : 1 - frac[1]) * (z ? frac[2] : 1 - frac[2]);
        const index = base[0] + x + grid.resolution * (base[1] + y + grid.resolution * (base[2] + z));
        interpolated += mesh.field[index] * weight;
      }
      close(interpolated, 0.04, 1e-6);
    }
    mesh.geometry.dispose(); material.dispose();
  }
});
