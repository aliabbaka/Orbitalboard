import type { SystemState, Vec3 } from '../engine/types.js';
import { BOHR_ANGSTROM } from '../data/parameters.js';

/** Illustrative starting inputs, not reference bond lengths or optimized structures. */
export const PRESETS: Readonly<Record<string, { label: string; state: SystemState }>> = {
  NH3: { label: 'NH₃ · ammonia', state: { units: 'angstrom', atoms: [
    { id: 'n', element: 'N', position: [0, 0, 0] },
    { id: 'h1', element: 'H', position: [0.94, 0, -0.38] },
    { id: 'h2', element: 'H', position: [-0.47, 0.8140638796, -0.38] },
    { id: 'h3', element: 'H', position: [-0.47, -0.8140638796, -0.38] },
  ] } },
  H2: { label: 'H₂ · hydrogen', state: { units: 'angstrom', atoms: [
    { id: 'h1', element: 'H', position: [0, 0, -0.37] }, { id: 'h2', element: 'H', position: [0, 0, 0.37] },
  ] } },
  He2: { label: 'He₂ · hypothetical', state: { units: 'angstrom', atoms: [
    { id: 'he1', element: 'He', position: [0, 0, -0.5] }, { id: 'he2', element: 'He', position: [0, 0, 0.5] },
  ] } },
  C2: { label: 'C₂ · carbon', state: { units: 'angstrom', atoms: [
    { id: 'c1', element: 'C', position: [0, 0, -0.62] }, { id: 'c2', element: 'C', position: [0, 0, 0.62] },
  ] } },
  N2: { label: 'N₂ · nitrogen', state: { units: 'angstrom', atoms: [
    { id: 'n1', element: 'N', position: [0, 0, -0.55] }, { id: 'n2', element: 'N', position: [0, 0, 0.55] },
  ] } },
  O2: { label: 'O₂ · oxygen', state: { units: 'angstrom', atoms: [
    { id: 'o1', element: 'O', position: [0, 0, -0.605] }, { id: 'o2', element: 'O', position: [0, 0, 0.605] },
  ] } },
  F2: { label: 'F₂ · fluorine', state: { units: 'angstrom', atoms: [
    { id: 'f1', element: 'F', position: [0, 0, -0.71] }, { id: 'f2', element: 'F', position: [0, 0, 0.71] },
  ] } },
  CO2: { label: 'CO₂ · carbon dioxide', state: { units: 'angstrom', atoms: [
    { id: 'c', element: 'C', position: [0, 0, 0] }, { id: 'o1', element: 'O', position: [0, 0, 1.16] }, { id: 'o2', element: 'O', position: [0, 0, -1.16] },
  ] } },
  H2O: { label: 'H₂O · water', state: { units: 'angstrom', atoms: [
    { id: 'o', element: 'O', position: [0, 0, 0] }, { id: 'h1', element: 'H', position: [0.76, 0, 0.59] }, { id: 'h2', element: 'H', position: [-0.76, 0, 0.59] },
  ] } },
  CH4: { label: 'CH₄ · methane', state: { units: 'angstrom', atoms: [
    { id: 'c', element: 'C', position: [0, 0, 0] }, { id: 'h1', element: 'H', position: [0.63, 0.63, 0.63] },
    { id: 'h2', element: 'H', position: [0.63, -0.63, -0.63] }, { id: 'h3', element: 'H', position: [-0.63, 0.63, -0.63] }, { id: 'h4', element: 'H', position: [-0.63, -0.63, 0.63] },
  ] } },
};

export function sliderToValue(raw: number, min: number, max: number): number {
  return min * (max / min) ** (raw / 1000);
}

export function valueToSlider(value: number, min: number, max: number): number {
  return Math.log(Math.max(min, Math.min(max, value)) / min) / Math.log(max / min) * 1000;
}

export function positionsAngstrom(state: SystemState): Vec3[] {
  return state.atoms.map(a => a.position.map(x => state.units === 'bohr' ? x * BOHR_ANGSTROM : x) as unknown as Vec3);
}

export function coordinateDistance(state: SystemState, centerId: string, movingId: string): number {
  const positions = positionsAngstrom(state);
  const c = state.atoms.findIndex(a => a.id === centerId), b = state.atoms.findIndex(a => a.id === movingId);
  return c >= 0 && b >= 0 && c !== b ? Math.hypot(...positions[b].map((x, d) => x - positions[c][d])) : NaN;
}

export function coordinateAngle(state: SystemState, centerId: string, fixedId: string, movingId: string): number {
  const positions = positionsAngstrom(state);
  const ids = [centerId, fixedId, movingId].map(id => state.atoms.findIndex(a => a.id === id));
  if (ids.some(i => i < 0) || new Set(ids).size !== 3) return NaN;
  const a = positions[ids[1]].map((x, d) => x - positions[ids[0]][d]);
  const b = positions[ids[2]].map((x, d) => x - positions[ids[0]][d]);
  const cosine = a.reduce((sum, x, d) => sum + x * b[d], 0) / (Math.hypot(...a) * Math.hypot(...b));
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

export function changeDistance(state: SystemState, centerId: string, movingId: string, angstrom: number): SystemState {
  const c = state.atoms.find(a => a.id === centerId), b = state.atoms.find(a => a.id === movingId);
  if (!c || !b || c === b || !Number.isFinite(angstrom) || angstrom <= 0) throw new Error('Choose different atoms and a positive distance.');
  const r = b.position.map((x, d) => x - c.position[d]);
  const length = Math.hypot(...r);
  const target = state.units === 'bohr' ? angstrom / BOHR_ANGSTROM : angstrom;
  const position = r.map((x, d) => c.position[d] + x * target / length) as unknown as Vec3;
  return { ...state, atoms: state.atoms.map(a => a.id === b.id ? { ...a, position } : a) };
}

export function changeAngle(state: SystemState, centerId: string, fixedId: string, movingId: string, degrees: number): SystemState {
  if (!Number.isFinite(degrees) || degrees <= 0 || degrees > 180) throw new Error('Angle must be in (0, 180] degrees.');
  const c = state.atoms.find(a => a.id === centerId), a = state.atoms.find(a => a.id === fixedId), b = state.atoms.find(a => a.id === movingId);
  if (!c || !a || !b || new Set([centerId, fixedId, movingId]).size !== 3) throw new Error('Choose three different angle atoms.');
  const r = a.position.map((x, d) => x - c.position[d]), moving = b.position.map((x, d) => x - c.position[d]);
  const u = r.map(x => x / Math.hypot(...r));
  const projection = moving.reduce((sum, x, d) => sum + x * u[d], 0);
  let v = moving.map((x, d) => x - projection * u[d]);
  if (Math.hypot(...v) < 1e-10) {
    const least = u.map(Math.abs).indexOf(Math.min(...u.map(Math.abs)));
    v = u.map((_, d) => (d === least ? 1 : 0) - u[least] * u[d]);
  }
  const norm = Math.hypot(...v), radius = Math.hypot(...moving), angle = degrees * Math.PI / 180;
  const position = u.map((x, d) => c.position[d] + radius * (Math.cos(angle) * x + Math.sin(angle) * v[d] / norm)) as unknown as Vec3;
  return { ...state, atoms: state.atoms.map(atom => atom.id === b.id ? { ...atom, position } : atom) };
}
