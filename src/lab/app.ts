import { parseXYZ } from '../engine/xyz.js';
import { validateState } from '../engine/validation.js';
import type { Derived, SystemState, Vec3 } from '../engine/types.js';
import type { OrbitalField } from '../engine/field.js';
import type { scanAngle } from '../engine/scan.js';
import { BOHR_ANGSTROM, SOURCES } from '../data/parameters.js';
import { DIATOMIC_REFERENCES } from '../data/chemistry-references.js';
import { PRESETS, changeAngle, changeDistance, coordinateAngle, coordinateDistance, positionsAngstrom, sliderToValue, valueToSlider } from './model.js';
import { MolecularViewer } from './viewer.js';
import { installBoardBridge } from './board-bridge.js';
import { makeSnapshot } from '../board/snapshot.js';
import type { ModelSnapshot } from '../board/types.js';
import { installOffline } from '../offline/client.js';

type Scan = ReturnType<typeof scanAngle>;
const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const input = (id: string): HTMLInputElement => el<HTMLInputElement>(id);
const select = (id: string): HTMLSelectElement => el<HTMLSelectElement>(id);
const button = (id: string): HTMLButtonElement => el<HTMLButtonElement>(id);
const fmt = (value: number | null | undefined, places = 3): string => value == null ? '—' : value.toFixed(places).replace(/\.?0+$/, '') || '0';
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag); n.textContent = text; n.className = className; return n;
}

class EngineClient {
  private readonly worker = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
  private sequence = 0;
  private pending = new Map<string, { resolve: (result: unknown) => void; reject: (error: Error) => void; timer: number }>();
  constructor() {
    this.worker.onmessage = ({ data }) => {
      const task = this.pending.get(data.id); if (!task) return;
      clearTimeout(task.timer); this.pending.delete(data.id);
      if (data.ok) task.resolve(data.result); else task.reject(new Error(data.error));
    };
    this.worker.onerror = () => {
      for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error('Engine worker could not start. Reload the page after building the project.')); }
      this.pending.clear();
    };
  }
  request<T>(payload: object): Promise<T> {
    const id = `task-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { this.pending.delete(id); reject(new Error('The calculation timed out. Try a smaller system.')); }, 30000);
      this.pending.set(id, { resolve: result => resolve(result as T), reject, timer });
      this.worker.postMessage({ ...payload, id });
    });
  }
}

const engine = new EngineClient(), surfaceEngine = new EngineClient();
let state: SystemState = structuredClone(PRESETS.NH3.state);
let result: Derived | null = null, field: OrbitalField | null = null, lastScan: Scan | null = null;
let revision = 0, resultRevision = -1, selectedOrbital = 0, authorized = false;
let solveBusy = false, surfaceBusy = false, surfaceWanted = 0, surfaceRendered = -1;
let solveWanted = false;
let solveFrame = 0, scanTimer = 0, scanRequested = false, scanSequence = 0;
let tutorAvailable = false, viewer: MolecularViewer | null = null;
let lockedSnapshot = false, restoredView: ModelSnapshot['view'] | null = null;
document.body.dataset.solveCount = '0';
if (window.parent === window) installOffline();

let theme: string;
try { theme = localStorage.getItem('orbitalboard-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); }
catch { theme = 'dark'; }
function setTheme(value: string): void {
  theme = value === 'light' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme;
  button('theme').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  button('theme').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  try { localStorage.setItem('orbitalboard-theme', theme); } catch { /* storage may be disabled */ }
  viewer?.setTheme(theme === 'dark');
}

try {
  viewer = new MolecularViewer(el('viewport'), (id, position) => {
    const p = position.map(x => state.units === 'bohr' ? x / BOHR_ANGSTROM : x) as unknown as Vec3;
    state = { ...state, atoms: state.atoms.map(a => a.id === id ? { ...a, position: p } : a) }; touch();
  });
} catch { el('viewer-unavailable').hidden = false; }
if (viewer) viewer.onPlace = position => {
  if (lockedSnapshot || state.atoms.length >= 30) { el('status').textContent = 'Remix a locked snapshot first; systems are capped at 30 atoms.'; return; }
  const p = position.map(x => state.units === 'bohr' ? x / BOHR_ANGSTROM : x) as unknown as Vec3;
  state = { ...state, atoms: [...state.atoms, { id: `atom-${crypto.randomUUID().slice(0, 8)}`, element: select('place-element').value, position: p }] }; populateAtoms(); touch();
};
button('place-atoms').onclick = () => { const enabled = button('place-atoms').getAttribute('aria-pressed') !== 'true'; button('place-atoms').setAttribute('aria-pressed', String(enabled)); viewer?.setPlaceEnabled(enabled); el('status').textContent = enabled ? 'Click in the 3D view to place an atom in the camera-target plane. Coordinate fields provide precise/keyboard placement.' : 'Atom placement off.'; };
setTheme(theme);
button('theme').onclick = () => setTheme(theme === 'dark' ? 'light' : 'dark');
window.addEventListener('storage', event => { if (event.key === 'orbitalboard-theme' && event.newValue) setTheme(event.newValue); });
button('reset-camera').onclick = () => viewer?.resetCamera();
button('drag-atoms').onclick = () => {
  const enabled = button('drag-atoms').getAttribute('aria-pressed') !== 'true';
  button('drag-atoms').setAttribute('aria-pressed', String(enabled)); viewer?.setMoveEnabled(enabled);
};

function selectedIds(): [string, string, string] { return [select('center-atom').value, select('fixed-atom').value, select('moving-atom').value]; }
function fresh(): boolean { return result !== null && resultRevision === revision; }
function actions(): void {
  button('homo').disabled = !fresh() || !result!.homoIndices.length;
  button('lumo').disabled = !fresh() || !result!.lumoIndices.length;
  button('scan').disabled = !fresh() || state.atoms.length < 3 || new Set(selectedIds()).size < 3;
  button('copy-state').disabled = !fresh(); button('explain').disabled = !fresh() || !tutorAvailable || !navigator.onLine;
  const surfaceReady = fresh() && (!viewer || select('view-mode').value === 'molecule' || (field !== null && field.orbitalIndex === selectedOrbital));
  button('pin-lab').disabled = !surfaceReady; button('export-model').disabled = !fresh();
}
function clearNote(): void { el('tutor-response').replaceChildren(); }
function populateAtoms(): void {
  for (const [id, index] of [['center-atom', 0], ['fixed-atom', 1], ['moving-atom', state.atoms.length >= 3 ? 2 : 1]] as const) {
    select(id).replaceChildren(...state.atoms.map(a => { const option = node('option', `${a.element} · ${a.id}`); option.value = a.id; return option; }));
    select(id).selectedIndex = Math.min(index, state.atoms.length - 1);
  }
  el('coordinates').replaceChildren(...state.atoms.map(atom => {
    const row = node('div', '', 'coordinate-row'); row.append(node('span', atom.id));
    for (let d = 0; d < 3; d++) {
      const coordinate = node('input'); coordinate.type = 'number'; coordinate.step = '0.01';
      coordinate.setAttribute('aria-label', `${atom.id} ${['x', 'y', 'z'][d]} in angstrom`);
      coordinate.dataset.atom = atom.id; coordinate.dataset.axis = String(d);
      coordinate.onchange = () => {
        const number = Number(coordinate.value), value = state.units === 'bohr' ? number / BOHR_ANGSTROM : number;
        state = { ...state, atoms: state.atoms.map(a => { if (a.id !== atom.id) return a; const position = [...a.position] as [number, number, number]; position[d] = value; return { ...a, position }; }) }; touch();
      };
      row.append(coordinate);
    }
    return row;
  }));
  syncGeometry();
}
function syncGeometry(): void {
  const [center, fixed, moving] = selectedIds();
  const distance = coordinateDistance(state, center, moving), angle = coordinateAngle(state, center, fixed, moving);
  input('distance').disabled = input('distance-value').disabled = !Number.isFinite(distance);
  input('angle').disabled = input('angle-value').disabled = !Number.isFinite(angle);
  if (Number.isFinite(distance)) { input('distance').value = String(valueToSlider(distance, 0.2, 5)); if (document.activeElement !== input('distance-value')) input('distance-value').value = distance.toFixed(3); }
  if (Number.isFinite(angle)) { input('angle').value = String(angle); if (document.activeElement !== input('angle-value')) input('angle-value').value = angle.toFixed(1); }
  const positions = positionsAngstrom(state);
  for (const element of el('coordinates').querySelectorAll<HTMLInputElement>('input')) {
    const i = state.atoms.findIndex(a => a.id === element.dataset.atom);
    if (document.activeElement !== element) element.value = positions[i][Number(element.dataset.axis)].toFixed(3);
  }
  actions();
}
function touch(): void {
  revision++; clearNote(); field = null; viewer?.clearField(); actions();
  el('view-trust').textContent = result ? 'OUTDATED · INPUT CHANGED' : 'INPUT GEOMETRY';
  el('ladder-trust').textContent = result ? 'OUTDATED' : 'NOT SOLVED';
  el('provenance').textContent = result ? 'Outdated · input changed. Solve to refresh these values.' : 'Input geometry · not yet solved.';
  el('surface-status').textContent = 'Input changed. The previous surface is hidden until the new solve completes.';
  try { validateState(state); viewer?.setGeometry(state); syncGeometry(); }
  catch (error) { el('status').textContent = `Input error: ${(error as Error).message}`; return; }
  if (authorized && input('live').checked) scheduleSolve();
  else el('status').textContent = 'Inputs changed. Press Solve to update the result.';
  if (lastScan) el('scan-status').textContent = 'Scan belongs to the previous solved state. Run it again to update.';
}
function resetSystem(next: SystemState): void {
  if (solveFrame) cancelAnimationFrame(solveFrame);
  solveFrame = 0; solveWanted = false;
  state = structuredClone(next); revision++; authorized = false; result = null; field = null; lastScan = null; scanRequested = false; scanSequence++;
  clearTimeout(scanTimer); clearNote(); viewer?.clearField(); populateAtoms(); viewer?.setGeometry(state, true);
  input('charge').value = String(state.charge ?? 0); input('k').value = String(state.k ?? 1.75); select('spin').value = String(state.multiplicity ?? 0);
  el('initial-overlay').hidden = false; el('view-trust').textContent = 'INPUT GEOMETRY'; el('ladder-trust').textContent = 'NOT SOLVED';
  el('orbital-name').textContent = 'A starting point.'; el('orbital-description').textContent = 'No orbital has been calculated yet.';
  el('ladder').replaceChildren(node('div', 'Press Solve to reveal the levels.', 'empty-state')); el('orbital-detail').hidden = true;
  for (const id of ['electron-count', 'unpaired', 'bond-order', 'gap']) el(id).textContent = '—';
  el('reality').replaceChildren(node('p', 'Solve this system to see its model limits and reference checks.', 'fine'));
  el('matrix').replaceChildren(); el('state-json').textContent = 'No solved state yet.'; el('scan-chart').replaceChildren(); el('scan-table').replaceChildren();
  el('scan-status').textContent = 'The scan only runs after you choose it.';
  el('status').textContent = 'Geometry loaded. Press Solve when you are ready.'; el('surface-status').textContent = 'Surfaces use the solved wavefunction, never stock orbital pictures.'; actions();
  el('provenance').textContent = 'A source behind every value. No solved state yet.';
}

select('preset').replaceChildren(...Object.entries(PRESETS).map(([id, preset]) => { const option = node('option', preset.label); option.value = id; return option; }));
select('preset').value = 'NH3'; select('preset').onchange = () => resetSystem(PRESETS[select('preset').value].state);
button('load-xyz').onclick = () => {
  try { const next = parseXYZ(el<HTMLTextAreaElement>('xyz').value); resetSystem(next); }
  catch (error) { el('status').textContent = `XYZ error: ${(error as Error).message}`; }
};
input('charge').onchange = () => { state = { ...state, charge: Number(input('charge').value) }; touch(); };
input('k').onchange = () => { state = { ...state, k: Number(input('k').value) }; touch(); };
select('spin').onchange = () => { const { multiplicity: _old, ...rest } = state; const m = Number(select('spin').value); state = m ? { ...rest, multiplicity: m } : rest; touch(); };
for (const id of ['center-atom', 'fixed-atom', 'moving-atom']) select(id).onchange = () => { syncGeometry(); lastScan = null; scanRequested = false; scanSequence++; clearTimeout(scanTimer); el('scan-chart').replaceChildren(); el('scan-table').replaceChildren(); el('scan-status').textContent = 'New angle handle selected. Run a new scan.'; };
for (const id of ['distance', 'distance-value']) input(id).addEventListener(id === 'distance' ? 'input' : 'change', () => {
  try { const [c, , m] = selectedIds(); state = changeDistance(state, c, m, id === 'distance' ? sliderToValue(Number(input(id).value), 0.2, 5) : Number(input(id).value)); touch(); }
  catch (error) { el('status').textContent = (error as Error).message; }
});
for (const id of ['angle', 'angle-value']) input(id).addEventListener(id === 'angle' ? 'input' : 'change', () => {
  try { const [c, f, m] = selectedIds(); state = changeAngle(state, c, f, m, Number(input(id).value)); touch(); }
  catch (error) { el('status').textContent = (error as Error).message; }
});
input('live').onchange = () => { if (input('live').checked && authorized && !fresh()) scheduleSolve(); };
button('solve').onclick = () => { authorized = true; scheduleSolve(); };

function scheduleSolve(): void {
  solveWanted = true;
  if (solveFrame) return;
  solveFrame = requestAnimationFrame(() => { solveFrame = 0; void runSolve(); });
}
async function runSolve(): Promise<void> {
  if (!authorized) return;
  if (solveBusy) return;
  solveWanted = false;
  solveBusy = true; const requestedRevision = revision, snapshot = structuredClone(state), start = performance.now();
  const previousSelection = result ? selectedOrbital : null;
  el('status').textContent = 'Solving in the worker…';
  document.body.dataset.solveCount = String(Number(document.body.dataset.solveCount) + 1);
  try {
    const next = await engine.request<Derived>({ action: 'solve', state: snapshot });
    if (requestedRevision !== revision) return;
    result = next; resultRevision = revision; selectedOrbital = previousSelection === null ? (next.homoIndices[0] ?? 0) : Math.min(previousSelection, next.orbitals.length - 1);
    document.body.dataset.solveTime = String(performance.now() - start);
    el('status').textContent = `Computed · EHT ${next.provenance.solverVersion} · ${fmt(performance.now() - start, 1)} ms including worker transfer.`;
    el('view-trust').textContent = '✓ COMPUTED'; el('ladder-trust').textContent = '✓ COMPUTED'; el('initial-overlay').hidden = true;
    el('electron-count').textContent = String(next.electronCount); el('unpaired').textContent = String(next.unpairedElectrons);
    el('bond-order').textContent = fmt(next.textbookBondOrder, 2); el('gap').textContent = fmt(next.frontierGapEV);
    el('provenance').textContent = `Computed · EHT ${next.provenance.solverVersion} · ${next.provenance.parameterVersion}`;
    if (restoredView) { selectedOrbital = restoredView.orbital; restoredView = null; }
    renderLadder(); renderReality(); renderMatrix(); renderState(); chooseOrbital(selectedOrbital); actions();
    if (lockedSnapshot) setSnapshotLock(true);
    if (scanRequested && input('live').checked) { clearTimeout(scanTimer); scanTimer = window.setTimeout(() => void runScan(), 180); }
  } catch (error) { if (requestedRevision === revision) { el('status').textContent = `Could not solve: ${(error as Error).message}`; actions(); } }
  finally { solveBusy = false; if (solveWanted || (requestedRevision !== revision && authorized && input('live').checked)) scheduleSolve(); }
}

function renderLadder(): void {
  if (!result) return;
  el('ladder').replaceChildren(...[...result.degeneracyGroups].reverse().map(group => {
    const row = node('div', '', 'level-group');
    group.indices.forEach(index => {
      const orbital = result!.orbitals[index], level = node('button', '', 'level');
      level.dataset.orbital = String(index); level.setAttribute('aria-pressed', String(index === selectedOrbital));
      level.setAttribute('aria-label', `MO ${index + 1}, ${orbital.label}, ${orbital.energyEV.toFixed(3)} eV, ${orbital.occupation.count} electrons`);
      level.append(node('span', `${orbital.occupation.up ? '↑' : ''}${orbital.occupation.down ? '↓' : ''}`, 'arrows'), node('span', `${index + 1} · ${orbital.label}${orbital.homo ? ' · H' : ''}${orbital.lumo ? ' · L' : ''}`, 'level-label'));
      level.onclick = () => { if (fresh()) chooseOrbital(index); }; row.append(level);
    });
    row.append(node('span', group.energyEV.toFixed(2), 'level-energy')); return row;
  }));
}
function chooseOrbital(index: number): void {
  if (!result) return;
  selectedOrbital = index; clearNote();
  const orbital = result.orbitals[index];
  el('orbital-name').textContent = `${orbital.label.startsWith('MO ') ? orbital.label : `MO ${index + 1} · ${orbital.label}`}${orbital.homo ? ' · HOMO' : ''}${orbital.lumo ? ' · LUMO' : ''}`;
  el('orbital-description').textContent = `${orbital.energyEV.toFixed(3)} eV · ${orbital.occupation.count} electrons · ${orbital.character}. Relative phase, not charge.`;
  el('viewport').setAttribute('aria-label', `Molecular orbital ${index + 1}, ${orbital.energyEV.toFixed(3)} electron volts, ${orbital.character}, ${orbital.occupation.count} electrons. Positive phase solid, negative phase wire or hollow.`);
  el('orbital-detail').hidden = false; el('selected-energy').textContent = `${orbital.energyEV.toFixed(3)} eV`;
  el('selected-character').textContent = `${orbital.character} · ${result.magnetism} · ${orbital.degeneracy}-fold energy group`;
  el('composition').replaceChildren(...orbital.composition.byAtom.map((atom, i) => {
    const wrapper = node('div'), row = node('div', '', 'composition-row');
    const value = node('span', `${atom.percent.toFixed(1)}%`); value.dataset.cite = `selected.composition.${i}.percent`;
    row.append(node('span', atom.atomId), value); const bar = node('div', '', 'composition-bar'), fill = node('span'); fill.style.width = `${atom.percent}%`; bar.append(fill); wrapper.append(row, bar); return wrapper;
  }));
  for (const level of el('ladder').querySelectorAll('button')) level.setAttribute('aria-pressed', String(Number(level.dataset.orbital) === index));
  field = null; viewer?.clearField(); surfaceWanted++; void renderSurface();
  actions();
}
button('homo').onclick = () => { if (fresh()) chooseOrbital(result!.homoIndices[0]); };
button('lumo').onclick = () => { if (fresh()) chooseOrbital(result!.lumoIndices[0]); };

function isovalue(): number { return sliderToValue(Number(input('isovalue').value), 0.005, 0.2); }
el('iso-value').textContent = isovalue().toFixed(3);
input('isovalue').oninput = () => { el('iso-value').textContent = isovalue().toFixed(3); if (field) showField(); };
select('view-mode').onchange = () => { input('isovalue').disabled = select('view-mode').value !== 'surface'; actions(); if (field) showField(); else if (fresh()) { surfaceWanted++; void renderSurface(); } };
select('resolution').onchange = () => { field = null; surfaceWanted++; actions(); if (fresh()) void renderSurface(); };
async function renderSurface(): Promise<void> {
  if (surfaceBusy || !fresh() || !viewer) return;
  if (select('view-mode').value === 'molecule') { viewer.clearField(); return; }
  surfaceBusy = true; const ticket = surfaceWanted, r = revision, orbital = selectedOrbital, start = performance.now();
  el('surface-status').textContent = 'Sampling the actual solved wavefunction…';
  try {
    const sampled = await surfaceEngine.request<OrbitalField>({ action: 'sample-orbital', state: result!.provenance.input, orbitalIndex: orbital, resolution: Number(select('resolution').value) });
    if (ticket !== surfaceWanted || r !== revision || !fresh()) return;
    field = sampled; surfaceRendered = ticket; showField();
    document.body.dataset.surfaceTime = String(performance.now() - start);
    el('viewport').dataset.surfaceOrbital = String(orbital);
    actions();
  } catch (error) { if (ticket === surfaceWanted) el('surface-status').textContent = `Surface unavailable: ${(error as Error).message}`; }
  finally { surfaceBusy = false; if (surfaceWanted !== ticket && surfaceRendered !== surfaceWanted && fresh()) void renderSurface(); }
}
function showField(): void {
  if (!field || !viewer || !fresh()) return;
  const drawn = viewer.setField(field, isovalue(), select('view-mode').value);
  const cloud = select('view-mode').value === 'cloud';
  el('surface-status').textContent = select('view-mode').value === 'molecule' ? 'Molecule-only view. Connectors are proximity drawing heuristics, not computed bonds.' : `${field.resolution}³ grid · ${cloud ? 'probability proportional to |ψ|²' : `|ψ| threshold ${isovalue().toFixed(3)} bohr⁻³ᐟ²`} · ${drawn.vertices} ${cloud ? 'sampled points' : 'surface vertices'}${drawn.clipped && !cloud ? ' · Warning: surface reaches the grid boundary.' : ''}${drawn.vertices === 0 ? ' · No samples/surface at these settings.' : ''}`;
}

function sourceLink(id: string): HTMLElement {
  const source = SOURCES[id];
  if (!source) return node('span', `Source: ${id}`, 'fine');
  const link = node('a', `${source.title} ↗`, 'source-link'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
function renderReality(): void {
  if (!result) return;
  const grid = node('div', '', 'warning-grid');
  for (const warning of result.warnings) {
    const card = node('article', '', 'warning'); card.dataset.warning = warning.code;
    card.append(node('h4', `! ${warning.code.replaceAll('_', ' ')}`), node('p', warning.message));
    for (const cite of warning.cites.filter(c => SOURCES[c])) card.append(sourceLink(cite)); grid.append(card);
  }
  el('reality').replaceChildren(grid);
  const atoms = result.provenance.input.atoms;
  const reference = atoms.length === 2 && atoms[0].element === atoms[1].element ? DIATOMIC_REFERENCES[atoms[0].element] : undefined;
  if (reference) {
    const section = node('div', '', 'reference-table'); section.append(node('p', 'Looked up · OpenStax Chemistry 2e §8.4 · textbook reference, not EHT energies', 'fine'));
    const table = node('table'), header = node('tr'); for (const label of ['Property', 'Computed model', 'Cited textbook']) header.append(node('th', label)); table.append(header);
    const pi = result.orbitals.find(o => o.symmetry.kind === 'pi' && o.character === 'bonding');
    const sigma = result.orbitals.filter(o => o.symmetry.kind === 'sigma' && o.character === 'bonding').at(-1);
    const computedOrdering = pi && sigma ? (pi.energyEV < sigma.energyEV ? 'π below σ' : 'σ below π') : 'Not applicable';
    for (const row of [['Bond order', fmt(result.textbookBondOrder, 2), String(reference.bondOrder)], ['Unpaired electrons', String(result.unpairedElectrons), String(reference.unpaired)], ['Bonding p-level ordering', computedOrdering, reference.piBelowSigma === null ? 'Not applicable' : reference.piBelowSigma ? 'π below σ' : 'σ below π']]) {
      const tr = node('tr'); row.forEach(text => tr.append(node('td', text))); table.append(tr);
    }
    section.append(table, sourceLink(reference.sourceId)); el('reality').append(section);
  }
}
function renderMatrix(): void {
  if (!result) return;
  const kind = select('matrix-kind').value as 'overlap' | 'hamiltonianEV';
  const matrix = result[kind], size = Math.min(32, matrix.length), table = node('table');
  table.setAttribute('aria-label', kind === 'overlap' ? 'Computed overlap matrix S' : 'Computed Hamiltonian H in eV');
  const header = node('tr'); header.append(node('th', 'AO'));
  for (let j = 0; j < size; j++) header.append(node('th', `${result.basis[j].atomId} ${result.basis[j].angular}`)); table.append(header);
  for (let i = 0; i < size; i++) {
    const row = node('tr'); row.append(node('th', `${result.basis[i].atomId} ${result.basis[i].angular}`));
    for (let j = 0; j < size; j++) {
      const cell = node('td'), b = node('button', matrix[i][j].toFixed(3));
      b.setAttribute('aria-label', `${kind} row ${i + 1}, column ${j + 1}, ${matrix[i][j]}`);
      b.onclick = () => { el('matrix').querySelector('.selected')?.classList.remove('selected'); b.classList.add('selected'); el('matrix-readout').textContent = `Computed · ${kind}[${i}][${j}] = ${matrix[i][j].toPrecision(9)}${kind === 'hamiltonianEV' ? ' eV' : ''} · ${result!.basis[i].atomId}/${result!.basis[j].atomId} · EHT ${result!.provenance.solverVersion}`; };
      cell.append(b); row.append(cell);
    }
    table.append(row);
  }
  el('matrix').replaceChildren(table);
  el('matrix-readout').textContent = matrix.length > size ? `First ${size} AOs shown; full ${matrix.length}×${matrix.length} matrix is in Live state.` : 'Computed from this solved geometry. Select a cell for its full value and source path.';
}
select('matrix-kind').onchange = renderMatrix;
function renderState(): void { if (result) { const json = JSON.stringify(result, null, 2); el('state-json').textContent = json.length > 200000 ? `${json.slice(0, 200000)}\nPreview truncated; Copy JSON copies the complete state.` : json; } }
button('copy-state').onclick = async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); button('copy-state').textContent = 'Copied'; }
  catch { el('status').textContent = 'Clipboard permission denied. You can select and copy the live JSON manually.'; }
};

const tabs = ['reality', 'matrix', 'scan', 'state'];
function showTab(name: string): void {
  for (const tab of tabs) { const active = tab === name; el(`view-${tab}`).hidden = !active; button(`tab-${tab}`).setAttribute('aria-selected', String(active)); button(`tab-${tab}`).tabIndex = active ? 0 : -1; }
}
tabs.forEach((tab, i) => {
  button(`tab-${tab}`).onclick = () => showTab(tab);
  button(`tab-${tab}`).onkeydown = event => {
    const index = event.key === 'ArrowRight' ? (i + 1) % tabs.length : event.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (index >= 0) { event.preventDefault(); showTab(tabs[index]); button(`tab-${tabs[index]}`).focus(); }
  };
});

button('scan').onclick = () => { scanRequested = true; void runScan(); };
async function runScan(): Promise<void> {
  if (!fresh()) return;
  const ticket = ++scanSequence, r = revision;
  const min = Number(input('scan-min').value), step = Number(input('scan-step').value);
  if (!Number.isFinite(min) || min < 10 || min >= 180 || !Number.isFinite(step) || step < 1 || step > 30) { el('scan-status').textContent = 'Use a starting angle in [10, 180) and a step in [1, 30].'; return; }
  const angles = []; for (let angle = min; angle < 180; angle += step) angles.push(angle); angles.push(180);
  const [centerId, fixedId, movingId] = selectedIds(); el('scan-status').textContent = 'Computing fixed-radius angle samples in the worker…';
  try {
    const scanned = await engine.request<Scan>({ action: 'scan-angle', state: result!.provenance.input, options: { centerId, fixedId, movingId, anglesDegrees: angles } });
    if (ticket !== scanSequence || r !== revision) return;
    lastScan = scanned;
    el('scan-status').textContent = `Computed · sampled minimum ${scanned.sampledMinimumAnglesDegrees.map(x => fmt(x, 1)).join(', ')}° · gain from linear ${fmt(scanned.gainFromLinearEV, 4)} eV. Orbital-energy sum, NOT total energy or a measured equilibrium.`;
    renderScan(scanned);
  } catch (error) { if (ticket === scanSequence) el('scan-status').textContent = `Scan unavailable: ${(error as Error).message}`; }
}
function svgNode(name: string, attrs: Record<string, string | number>, text = ''): SVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value)); element.textContent = text; return element;
}
function renderScan(scan: Scan): void {
  const width = 950, height = 230, left = 58, right = 15, top = 17, bottom = 35;
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, class: 'scan-svg', role: 'img', 'aria-label': 'Computed orbital energies versus sampled angle. Lines are energy-sorted, not orbital tracked through crossings.' });
  const minAngle = Math.min(...scan.points.map(p => p.angleDegrees));
  const energies = scan.points.flatMap(p => p.energiesEV), min = Math.min(...energies), max = Math.max(...energies);
  const x = (angle: number) => left + (angle - minAngle) / Math.max(1, 180 - minAngle) * (width - left - right);
  const y = (energy: number) => top + (max - energy) / Math.max(1, max - min) * (height - top - bottom);
  for (let i = 0; i <= 4; i++) {
    const energy = min + (max - min) * i / 4; svg.append(svgNode('line', { x1: left, y1: y(energy), x2: width - right, y2: y(energy), class: 'grid' }), svgNode('text', { x: 3, y: y(energy) + 4 }, energy.toFixed(1)));
    const angle = minAngle + (180 - minAngle) * i / 4; svg.append(svgNode('text', { x: x(angle) - 9, y: height - 12 }, `${fmt(angle, 1)}°`));
  }
  for (let orbital = 0; orbital < scan.points[0].energiesEV.length; orbital++) {
    const path = scan.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.angleDegrees)},${y(p.energiesEV[orbital])}`).join(' ');
    svg.append(svgNode('path', { d: path, class: 'curve', 'stroke-dasharray': ['', '5 3', '1 3'][orbital % 3] }));
  }
  const angle = coordinateAngle(state, ...selectedIds());
  if (Number.isFinite(angle)) svg.append(svgNode('line', { x1: x(angle), y1: top, x2: x(angle), y2: height - bottom, class: 'marker' }));
  svg.append(svgNode('text', { x: 3, y: height - 12 }, 'eV'));
  el('scan-chart').replaceChildren(svg);
  const table = node('table'), header = node('tr'); for (const label of ['Angle °', 'Orbital-energy sum eV', ...scan.points[0].energiesEV.map((_, i) => `MO ${i + 1} eV`)]) header.append(node('th', label)); table.append(header);
  scan.points.forEach(p => { const row = node('tr'); [p.angleDegrees, p.orbitalEnergySumEV, ...p.energiesEV].forEach(value => row.append(node('td', value.toFixed(6)))); table.append(row); });
  const warnings = node('p', scan.warnings.map(w => `${w.code}: ${w.message}`).join('\n'), 'fine'); el('scan-table').replaceChildren(warnings, table);
}

button('explain').onclick = async () => {
  if (!fresh()) return;
  const key = `${revision}-${selectedOrbital}`; button('explain').disabled = true; clearNote(); el('tutor-status').textContent = 'Re-solving on the server, then checking the explanation before showing it…';
  try {
    const response = await fetch('/api/tutor/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: result!.provenance.input, orbitalIndex: selectedOrbital, question: input('question').value || 'Explain the selected orbital and the model limits.' }) });
    const data = await response.json(); if (key !== `${revision}-${selectedOrbital}` || !fresh()) return;
    if (!response.ok) throw new Error(data.error || 'Explanation unavailable.');
    const note = node('div', '', 'tutor-note'); note.append(node('span', 'Explained by AI · unverified', 'tag'));
    for (const segment of data.segments) {
      const paragraph = node('p', segment.text);
      for (const cite of segment.cites) {
        const fact = data.facts[cite], b = node('button', `${fmt(fact.value, 3)} ${fact.unit}`);
        b.onclick = () => {
          const value = [...document.querySelectorAll<HTMLElement>('[data-cite]')].find(e => e.dataset.cite === cite);
          if (value) { value.classList.add('citation-highlight'); value.scrollIntoView({ block: 'nearest' }); window.setTimeout(() => value.classList.remove('citation-highlight'), 3500); }
        };
        paragraph.append(b);
      }
      note.append(paragraph);
    }
    el('tutor-response').replaceChildren(note); el('tutor-status').textContent = 'Numeric citations checked; explanation correctness is not guaranteed. No changes were made to your system.';
  } catch (error) { if (key === `${revision}-${selectedOrbital}`) el('tutor-status').textContent = (error as Error).message; }
  finally { actions(); }
};

resetSystem(state);
window.addEventListener('offline', () => { actions(); el('tutor-status').textContent = 'Offline: AI explanations are unavailable; browser solvers and local exports still work.'; });
window.addEventListener('online', actions);
installBoardBridge({
  current: () => {
    if (!fresh()) return null;
    const snapshot = makeSnapshot(result!.provenance.input);
    snapshot.view = { orbital: selectedOrbital, mode: select('view-mode').value as ModelSnapshot['view']['mode'], isovalue: isovalue(), resolution: Number(select('resolution').value), camera: viewer?.cameraState() ?? null };
    return { result: result!, snapshot, viewer };
  },
  ready: () => !button('pin-lab').disabled,
  load: (snapshot, locked, defaultHomo) => {
    lockedSnapshot = false; resetSystem(snapshot.state); restoredView = defaultHomo ? null : snapshot.view;
    select('view-mode').value = snapshot.view.mode; select('resolution').value = String(snapshot.view.resolution);
    input('isovalue').value = String(valueToSlider(snapshot.view.isovalue, 0.005, 0.2)); el('iso-value').textContent = snapshot.view.isovalue.toFixed(3);
    if (snapshot.view.camera) viewer?.restoreCamera(snapshot.view.camera);
    lockedSnapshot = locked; setSnapshotLock(locked); authorized = true; scheduleSolve();
  },
});
function setSnapshotLock(locked: boolean): void {
  for (const id of ['preset', 'load-xyz', 'charge', 'spin', 'k', 'distance', 'distance-value', 'angle', 'angle-value', 'center-atom', 'fixed-atom', 'moving-atom', 'drag-atoms', 'place-atoms', 'place-element']) (el(id) as HTMLInputElement).disabled = locked;
  el('coordinates').querySelectorAll<HTMLInputElement>('input').forEach(i => { i.disabled = locked; });
  button('snapshot-remix').hidden = !locked;
  if (locked) { viewer?.setMoveEnabled(false); viewer?.setPlaceEnabled(false); button('drag-atoms').setAttribute('aria-pressed', 'false'); button('place-atoms').setAttribute('aria-pressed', 'false'); }
  else syncGeometry();
}
button('snapshot-remix').onclick = () => { lockedSnapshot = false; setSnapshotLock(false); el('status').textContent = 'Remix: you can now edit this local snapshot. The original saved state is unchanged.'; };
void fetch('/api/health').then(response => response.json()).then(data => {
  tutorAvailable = data.tutorAvailable === true; el('tutor-status').textContent = tutorAvailable ? 'Ready after you solve a system. Explanation runs only when you request it.' : 'AI not configured · set GROQ_API_KEY on the server to enable it. All lab features work without AI.'; actions();
}).catch(() => { el('tutor-status').textContent = 'Tutor backend unavailable. The browser engine still works.'; });
