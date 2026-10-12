import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export function readData(name) {
  return JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8'));
}

export const systems = readData('systems.json').systems;
export const system = name => structuredClone(systems.find(s => s.name === name).state);

export function close(actual, expected, tolerance = 1e-8, label = '') {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} != ${expected} (tolerance ${tolerance})`);
}

export function closeMatrix(actual, expected, tolerance = 1e-8) {
  assert.equal(actual.length, expected.length);
  actual.forEach((row, i) => {
    assert.equal(row.length, expected[i].length);
    row.forEach((x, j) => close(x, expected[i][j], tolerance, `[${i}, ${j}]`));
  });
}

export function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

// Rodrigues rotation about a non-axis-aligned unit vector (proper rotation).
export function rotateState(state, angle = 0.73, offset = [0.5, -0.9, 1.2]) {
  const axis = [1 / Math.sqrt(14), 2 / Math.sqrt(14), 3 / Math.sqrt(14)];
  return { ...state, atoms: state.atoms.map(atom => {
    const p = atom.position, c = Math.cos(angle), s = Math.sin(angle);
    const projection = axis.reduce((sum, x, i) => sum + x * p[i], 0);
    const cross = [axis[1] * p[2] - axis[2] * p[1], axis[2] * p[0] - axis[0] * p[2], axis[0] * p[1] - axis[1] * p[0]];
    return { ...atom, position: p.map((x, i) => c * x + s * cross[i] + (1 - c) * projection * axis[i] + offset[i]) };
  }) };
}
