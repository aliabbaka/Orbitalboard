import { solve } from './eht.js';
import type { Derived, SystemState, Vec3 } from './types.js';

export interface OrbitalField {
  readonly resolution: number;
  readonly values: Float32Array;
  readonly centerBohr: Vec3;
  readonly extentBohr: number;
  readonly orbitalIndex: number;
  readonly maxAbs: number;
  readonly boundaryMax: number;
  readonly units: 'bohr^(-3/2)';
  readonly solverVersion: string;
  readonly parameterVersion: string;
}

/** Separable Gaussian tables avoid millions of repeated exp() calls on a 3D grid. */
export function sampleOrbitalField(result: Derived, orbitalIndex: number, resolution = 28): OrbitalField {
  if (!Number.isInteger(resolution) || resolution < 16 || resolution > 40) throw new Error('Orbital grids must have 16–40 samples per axis.');
  const orbital = result.orbitals[orbitalIndex];
  if (!Number.isInteger(orbitalIndex) || !orbital) throw new Error('Choose an existing orbital.');
  const centers = result.basis.map(ao => ao.center);
  const min = [0, 1, 2].map(d => Math.min(...centers.map(c => c[d])));
  const max = [0, 1, 2].map(d => Math.max(...centers.map(c => c[d])));
  const centerBohr = min.map((x, d) => (x + max[d]) / 2) as unknown as Vec3;
  const extentBohr = Math.max(...max.map((x, d) => x - min[d])) + 10;
  if (extentBohr > 80) throw new Error('This geometry is too spread out for the capped orbital grid. The molecule and levels are still available.');
  const step = extentBohr / resolution;
  // MarchingCubes uses -1 + 2*i/resolution, not i/(resolution-1).
  const origin = centerBohr.map(x => x - extentBohr / 2);
  const values = new Float32Array(resolution ** 3);
  result.basis.forEach((ao, index) => {
    const coefficient = orbital.coefficients[index];
    if (Math.abs(coefficient) < 1e-12) return;
    const delta = [0, 1, 2].map(d => Array.from({ length: resolution }, (_, i) => origin[d] + step * i - ao.center[d]));
    const axis = ['px', 'py', 'pz'].indexOf(ao.angular);
    for (const primitive of ao.primitives) {
      const tables = delta.map((row, d) => row.map(x => Math.exp(-primitive.exponent * x * x) * (axis === d ? x : 1)));
      const weight = coefficient * primitive.weight;
      for (let z = 0; z < resolution; z++) for (let y = 0; y < resolution; y++) {
        const factor = weight * tables[2][z] * tables[1][y];
        const offset = resolution * (y + resolution * z);
        for (let x = 0; x < resolution; x++) values[offset + x] += factor * tables[0][x];
      }
    }
  });
  let maxAbs = 0, boundaryMax = 0;
  for (let z = 0; z < resolution; z++) for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const value = Math.abs(values[x + resolution * (y + resolution * z)]);
    maxAbs = Math.max(maxAbs, value);
    if (x < 2 || y < 2 || z < 2 || x >= resolution - 2 || y >= resolution - 2 || z >= resolution - 2) boundaryMax = Math.max(boundaryMax, value);
  }
  return { resolution, values, centerBohr, extentBohr, orbitalIndex, maxAbs, boundaryMax, units: 'bohr^(-3/2)', solverVersion: result.provenance.solverVersion, parameterVersion: result.provenance.parameterVersion };
}

export function sampleSystemOrbital(state: SystemState, orbitalIndex: number, resolution = 28): OrbitalField {
  return sampleOrbitalField(solve(state), orbitalIndex, resolution);
}
