import { solve } from '../engine/eht.js';
import { scanAngle } from '../engine/scan.js';
import { formulaElectrons, systemFormula } from './formula.js';
import type { Derived } from '../engine/types.js';
import type { BoardDocument, BoardObject, Level, ModelSnapshot } from './types.js';
import { getSolver, runCalculation } from '../solvers/registry.js';
import type { Calculation, SolverResult } from '../solvers/types.js';

export const escapeXML = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const cache = new Map<string, Derived>();
const calculationCache = new Map<string, SolverResult>();
export function resolvedCalculation(calculation: Calculation): SolverResult { const key = JSON.stringify(calculation); if (!calculationCache.has(key)) { if (calculationCache.size > 80) calculationCache.clear(); calculationCache.set(key, runCalculation(calculation)); } return calculationCache.get(key)!; }
export function resolved(snapshot: ModelSnapshot): Derived {
  const key = JSON.stringify([snapshot.solverVersion, snapshot.parameterVersion, snapshot.state]);
  if (!cache.has(key)) { if (cache.size > 80) cache.clear(); cache.set(key, solve(snapshot.state)); }
  return cache.get(key)!;
}
export function checkDiagram(result: Derived, levels: Level[]): string[] {
  const differences: string[] = [];
  if (levels.length !== result.orbitals.length) differences.push(`Expected ${result.orbitals.length} levels; you supplied ${levels.length}.`);
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i], expected = result.orbitals[level.orbital].occupation;
    if (level.arrows.includes('up') !== Boolean(expected.up) || level.arrows.includes('down') !== Boolean(expected.down)) differences.push(`MO ${level.orbital + 1}: occupation differs from the solver.`);
    if (i && result.orbitals[levels[i - 1].orbital].energyEV > result.orbitals[level.orbital].energyEV + 1e-6) differences.push(`MO ${levels[i - 1].orbital + 1} is above MO ${level.orbital + 1}; your low-to-high order is reversed.`);
  }
  return differences;
}
function lines(values: string[], y = 53, step = 22): string {
  return values.map((line, i) => `<text x="14" y="${y + i * step}" font-size="12">${escapeXML(line)}</text>`).join('');
}
function rawObjectSVG(object: BoardObject, doc: BoardDocument, theme: 'dark' | 'light' = 'light'): string {
  const ink = theme === 'dark' ? '#f2f2f2' : '#171717', bg = theme === 'dark' ? '#101010' : '#ffffff', muted = theme === 'dark' ? '#a6a6a6' : '#595959';
  let body = '', label = 'Student work';
  if (object.type === 'ink') {
    const points = object.points.map(p => `${p[0]},${p[1]}`).join(' ');
    return `<g data-object="${escapeXML(object.id)}"><polyline points="${points}" fill="none" stroke="${object.token === 'muted' ? muted : ink}" stroke-width="${object.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" pointer-events="stroke"/></g>`;
  }
  if (object.type === 'text') { body = lines(object.text.split('\n').slice(0, 12), 52, 24); if (object.text.split('\n').length > 12) label += ' · first 12 lines; full text in JSON/source metadata'; }
  else if (object.type === 'answer') {
    const answer = formulaElectrons(object.formula); label = 'Computed · formula 1.0.0';
    body = lines([`${object.formula}: ${answer.electrons} valence electrons (neutral)`, ...answer.contributions.map(a => `${a.element}: ${a.count} × ${a.perAtom} = ${a.count * a.perAtom}`), 'Source: verified atomic table / YAeHMOP', 'This does not infer geometry or bonding.']);
  } else if (object.type === 'calculation') {
    const result = resolvedCalculation(object.calculation), solver = getSolver(result.solverId); label = `Computed · ${result.solverId} ${result.solverVersion}`;
    const values = [solver.title, ...result.outputs.slice(0, 7).map(o => `${o.label}: ${o.display} ${['text', 'symbolic', '1', 'integer'].includes(o.unit) ? '' : o.unit}`)];
    body = lines((object.display === 'steps' ? [...values.slice(0, 4), 'Working:', ...result.steps] : values).map(s => s.length > 85 ? `${s.slice(0, 82)}…` : s).slice(0, 11), 52, 21);
    if (object.display === 'graph' && result.graph) {
      const points = result.graph.points.filter(p => p.y !== null), xs = points.map(p => p.x), ys = points.map(p => p.y!); const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      let drawing = '', open = false;
      for (const p of result.graph.points) { if (p.y === null) { open = false; continue; } drawing += `${open ? 'L' : 'M'}${20 + (p.x - minX) / Math.max(1e-12, maxX - minX) * (object.width - 40)},${90 + (maxY - p.y) / Math.max(1e-12, maxY - minY) * 130} `; open = true; }
      body = lines([solver.title]) + `<path d="${drawing}" fill="none" stroke="${ink}" stroke-width="2"/>` + lines([`${result.graph.xLabel}: ${minX.toPrecision(4)} → ${maxX.toPrecision(4)}`, `${result.graph.yLabel}: ${minY.toPrecision(4)} → ${maxY.toPrecision(4)}`], 245, 20);
    }
    body += lines(['Source inputs / versions frozen; reopen Tools for full steps.', ...(result.warnings.length ? [result.warnings[0].slice(0, 75)] : [])], object.height - 38, 19);
  } else if (object.type === 'molecule') {
    const state = doc.systems[object.systemId].state; label = 'Input geometry · not solved';
    body = lines([systemFormula(state), `${state.atoms.length} atoms · charge ${state.charge ?? 0}`, 'Select → 3D model / Orbitals / Answer', 'Coordinates are editable in the lab.']);
  } else if (object.type === 'orbitals') {
    const result = resolved(doc.systems[object.systemId]); label = `Computed · EHT ${result.provenance.solverVersion}`;
    body = lines([`${systemFormula(result.provenance.input)} · ${result.electronCount} valence electrons`, `${result.unpairedElectrons} unpaired · ${result.magnetism}`, ...result.orbitals.slice(0, 12).map(o => `MO ${o.index + 1}  ${o.label}  ${o.energyEV.toFixed(3)} eV  ${o.occupation.up ? '↑' : ''}${o.occupation.down ? '↓' : ''}`)], 51, 21);
    if (result.orbitals.length > 12) body += lines(['First 12 shown; complete ladder in the lab.'], 355);
  } else if (object.type === 'ladder') {
    body = lines(['Your low → high diagram (spacing schematic)', ...object.levels.slice(0, 16).map(l => `MO ${l.orbital + 1}    ──────   ${l.arrows.map(a => a === 'up' ? '↑' : '↓').join('')}`)], 51, 21);
    if (object.levels.length > 16) label += ' · first 16 levels; edit for full diagram';
  } else if (object.type === 'check') {
    label = 'Computed · diagram comparison'; const diff = checkDiagram(resolved(doc.systems[object.systemId]), object.levels);
    body = lines(diff.length ? [`✗ ${diff.length} mismatches${diff.length > 10 ? ' (first 10 shown)' : ''}:`, ...diff.slice(0, 10)] : ['✓ Ordering and occupations match the solver.', 'This checks the model, not experimental truth.']);
  } else if (object.type === 'scan') {
    label = 'Computed · fixed-radius scan';
    const scan = scanAngle(doc.systems[object.systemId].state, { centerId: object.centerId, fixedId: object.fixedId, movingId: object.movingId, anglesDegrees: object.angles });
    const min = Math.min(...scan.points.map(p => p.orbitalEnergySumEV)), max = Math.max(...scan.points.map(p => p.orbitalEnergySumEV));
    const lowAngle = Math.min(...object.angles), highAngle = Math.max(...object.angles);
    const path = scan.points.map((p, i) => `${i ? 'L' : 'M'}${20 + (p.angleDegrees - lowAngle) / Math.max(1, highAngle - lowAngle) * (object.width - 45)},${80 + (max - p.orbitalEnergySumEV) / Math.max(0.01, max - min) * 100}`).join(' ');
    body = lines([`Sampled minimum: ${scan.sampledMinimumAnglesDegrees.join(', ')}°`]) + `<path d="${path}" fill="none" stroke="${ink}" stroke-width="2"/>` + lines(['Orbital-energy sum, NOT total energy.', `${lowAngle}° → ${highAngle}° · fixed radii`, ...scan.warnings.filter(w => w.code === 'D4').map(() => 'Warning: small bending gain may be an artifact.')], 205, 20);
  }
  return `<g data-object="${escapeXML(object.id)}" transform="translate(${object.x} ${object.y})" fill="${ink}" font-family="system-ui,sans-serif"><rect width="${object.width}" height="${object.height}" rx="9" fill="${bg}" stroke="${muted}" stroke-width="1"/><text x="14" y="25" font-size="10" fill="${muted}">${escapeXML(label)}</text>${body}</g>`;
}
export function objectSVG(object: BoardObject, doc: BoardDocument, theme: 'dark' | 'light' = 'light'): string {
  try { return rawObjectSVG(object, doc, theme); }
  catch (error) { const ink = theme === 'dark' ? '#fff' : '#000'; return `<g data-object="${escapeXML(object.id)}" transform="translate(${object.x} ${object.y})" fill="${ink}"><rect width="${object.width}" height="${object.height}" fill="none" stroke="${ink}"/><text x="12" y="28" font-size="12">Unavailable · no computed values</text><text x="12" y="54" font-size="10">${escapeXML((error as Error).message.slice(0, 80))}</text></g>`; }
}
export function selectionBounds(objects: BoardObject[]): { x: number; y: number; width: number; height: number } {
  if (!objects.length) return { x: 0, y: 0, width: 900, height: 600 };
  const x = Math.min(...objects.map(o => o.x)) - 16, y = Math.min(...objects.map(o => o.y)) - 16;
  return { x, y, width: Math.max(...objects.map(o => o.x + o.width)) - x + 16, height: Math.max(...objects.map(o => o.y + o.height)) - y + 16 };
}
export function boardSVG(doc: BoardDocument, objects = doc.objects, theme: 'dark' | 'light' = 'light'): string {
  const b = selectionBounds(objects), height = b.height + 56;
  const bg = theme === 'dark' ? '#080808' : '#ffffff', ink = theme === 'dark' ? '#f2f2f2' : '#171717';
  const source = `${doc.title} · EHT ${doc.engines.eht} · parameters ${doc.engines.parameters} · ${new Date().toISOString().slice(0, 10)}`;
  const ids = new Set(objects.flatMap(o => 'systemId' in o ? [o.systemId] : []));
  const systems = Object.fromEntries(Object.entries(doc.systems).filter(([id]) => ids.has(id)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.min(1200, b.width)}" height="${Math.min(1000, height)}" viewBox="${b.x} ${b.y} ${b.width} ${height}"><title>${escapeXML(doc.title)}</title><metadata>${escapeXML(JSON.stringify({ schemaVersion: doc.schemaVersion, engines: doc.engines, systems, objects }))}</metadata><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${height}" fill="${bg}"/>${objects.map(o => objectSVG(o, doc, theme)).join('')}<text x="${b.x + 12}" y="${b.y + height - 20}" fill="${ink}" font-family="system-ui,sans-serif" font-size="10">${escapeXML(source)}</text></svg>`;
}
