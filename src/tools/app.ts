import { SOLVERS, DISABLED_TOPICS, getSolver, makeCalculation } from '../solvers/registry.js';
import type { Calculation, FieldSpec, InputData, SolverResult } from '../solvers/types.js';
import { PERIODIC_ELEMENTS } from '../data/periodic.js';
import { SOLVER_SOURCES } from '../solvers/sources.js';
import { renderGraph } from './graph.js';
import { emptyBoard } from '../board/schema.js';
import { saveLocal } from '../board/storage.js';
import { installOffline } from '../offline/client.js';

const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => { const element = document.createElement(tag); element.textContent = text; element.className = className; return element; };
let id = SOLVERS[0].id, last: { calculation: Calculation; result: SolverResult } | null = null, generation = 0;
const worker = new Worker(new URL('../solvers/worker.js', import.meta.url), { type: 'module' }); let ticket = 0;
const pending = new Map<string, { generation: number; calculation: Calculation }>();
document.body.dataset.calculationCount = '0';
if (new URLSearchParams(location.search).get('embedded') === '1') document.body.dataset.toolsEmbedded = 'true';
function theme(value: string): void { const normalized = value === 'light' ? 'light' : 'dark'; document.documentElement.dataset.theme = normalized; el('tools-theme').textContent = normalized === 'dark' ? 'Light mode' : 'Dark mode'; try { localStorage.setItem('orbitalboard-theme', normalized); } catch { /* optional */ } }
try { theme(localStorage.getItem('orbitalboard-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')); } catch { theme('dark'); }
el('tools-theme').onclick = () => theme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
window.addEventListener('storage', e => { if (e.key === 'orbitalboard-theme' && e.newValue) theme(e.newValue); });
function stale(): void { generation++; last = null; el('result-trust').textContent = 'INPUT CHANGED · NOT COMPUTED'; el<HTMLButtonElement>('add-calculation-board').disabled = true; el<HTMLButtonElement>('copy-calculation').disabled = true; el('solver-status').textContent = 'Inputs changed. Compute explicitly to update the result.'; }
function fieldElement(field: FieldSpec, value: unknown): HTMLElement {
  const wrapper = node('div', '', field.optional ? 'optional-field' : ''); wrapper.dataset.field = field.key;
  const label = node('label', field.label); label.htmlFor = `field-${field.key}`;
  if (field.optional) { const enabled = node('input'); enabled.type = 'checkbox'; enabled.dataset.optional = field.key; enabled.checked = value !== undefined; enabled.setAttribute('aria-label', `Use ${field.label}`); label.prepend(enabled); enabled.onchange = () => { wrapper.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-value]').forEach(i => { i.disabled = !enabled.checked; }); stale(); }; }
  wrapper.append(label);
  if (field.type === 'quantity') {
    const row = node('div', '', 'quantity-input'), number = node('input'), unit = node('input'); const q = value as { value?: string; unit?: string } | undefined;
    number.value = q?.value ?? ''; number.id = `field-${field.key}`; number.dataset.value = 'number'; number.setAttribute('aria-label', `${field.label} value`);
    unit.value = q?.unit ?? field.unit ?? ''; unit.dataset.value = 'unit'; unit.setAttribute('aria-label', `${field.label} unit`); row.append(number, unit); wrapper.append(row);
  } else {
    const input = field.type === 'json' ? node('textarea') : field.type === 'select' ? node('select') : node('input'); input.id = `field-${field.key}`; input.dataset.value = field.type;
    if (input instanceof HTMLSelectElement) { field.choices?.forEach(c => { const option = node('option', c); option.value = c; input.append(option); }); input.value = String(value ?? field.choices?.[0] ?? ''); }
    else if (input instanceof HTMLTextAreaElement) { input.rows = 5; input.value = JSON.stringify(value ?? [], null, 2); }
    else { input.value = value === undefined ? '' : String(value); if (field.type === 'number') { input.type = 'number'; input.step = 'any'; } }
    wrapper.append(input);
  }
  if (field.optional && value === undefined) wrapper.querySelectorAll<HTMLInputElement>('[data-value]').forEach(i => { i.disabled = true; });
  wrapper.addEventListener('input', stale); wrapper.addEventListener('change', () => { if (field.key === 'unknown' || field.key === 'mode') updateMode(); }); return wrapper;
}
function updateMode(): void {
  if (id === 'chem.ideal-gas') { const unknown = el<HTMLSelectElement>('field-unknown').value; for (const key of ['pressure', 'volume', 'amount', 'temperature']) { const wrapper = el('solver-fields').querySelector<HTMLElement>(`[data-field="${key}"]`)!; const box = wrapper.querySelector<HTMLInputElement>('[data-optional]')!; if (key === unknown) { box.checked = false; wrapper.hidden = true; } else wrapper.hidden = false; wrapper.querySelectorAll<HTMLInputElement>('[data-value]').forEach(v => { v.disabled = !box.checked; }); } }
}
function inputs(): InputData {
  const data: InputData = {};
  for (const field of getSolver(id).fields) {
    const wrapper = el('solver-fields').querySelector<HTMLElement>(`[data-field="${field.key}"]`)!;
    if (field.optional && !wrapper.querySelector<HTMLInputElement>('[data-optional]')!.checked) continue;
    if (field.type === 'quantity') data[field.key] = { value: wrapper.querySelector<HTMLInputElement>('[data-value="number"]')!.value, unit: wrapper.querySelector<HTMLInputElement>('[data-value="unit"]')!.value };
    else { const input = wrapper.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-value]')!; data[field.key] = field.type === 'json' ? JSON.parse(input.value) : field.type === 'number' ? input.value : input.value; }
  }
  const sf = el<HTMLInputElement>('solver-sigfigs').value; if (sf) data.significantFigures = Number(sf); return data;
}
function selectSolver(next: string, data?: InputData): void {
  const solver = getSolver(next); id = next; stale(); el('solver-title').textContent = solver.title; el('solver-version').textContent = `${solver.id} · ${solver.version}`; el('solver-scope').textContent = solver.scope;
  const values = data ? { ...structuredClone(solver.example), ...data } : structuredClone(solver.example); el('solver-fields').replaceChildren(...solver.fields.map(f => fieldElement(f, values[f.key])));
  el<HTMLInputElement>('solver-sigfigs').value = values.significantFigures === undefined ? '' : String(values.significantFigures); el<HTMLTextAreaElement>('solver-json').value = JSON.stringify(values, null, 2); updateMode(); renderList();
}
function renderList(): void {
  const filter = el<HTMLInputElement>('solver-search').value.toLowerCase(), elements: HTMLElement[] = [];
  for (const subject of ['Chemistry', 'Math', 'Units']) { const solvers = SOLVERS.filter(s => s.subject === subject && `${s.title} ${s.description}`.toLowerCase().includes(filter)); if (!solvers.length) continue; elements.push(node('h3', subject)); solvers.forEach(s => { const b = node('button', s.title); b.setAttribute('aria-pressed', String(s.id === id)); b.onclick = () => selectSolver(s.id); elements.push(b); }); }
  el('solver-list').replaceChildren(...elements);
}
el('solver-search').oninput = renderList; el('load-example').onclick = () => selectSolver(id);
el('use-input-json').onclick = () => { try { const data = JSON.parse(el<HTMLTextAreaElement>('solver-json').value); selectSolver(id, data); } catch (error) { el('solver-status').textContent = `Inputs rejected: ${(error as Error).message}`; } };
el('solver-sigfigs').oninput = stale;
el<HTMLFormElement>('solver-form').onsubmit = event => {
  event.preventDefault(); try { const calculation = makeCalculation(id, inputs()), request = `calculation-${++ticket}`; pending.set(request, { generation, calculation }); el('solver-status').textContent = 'Computing deterministic solver in a worker…'; document.body.dataset.calculationCount = String(Number(document.body.dataset.calculationCount) + 1); worker.postMessage({ id: request, calculation }); }
  catch (error) { el('solver-status').textContent = `No result: ${(error as Error).message}`; }
};
worker.onmessage = ({ data }) => {
  const task = pending.get(data.id); if (!task) return; pending.delete(data.id); if (task.generation !== generation) return;
  if (!data.ok) { el('solver-status').textContent = `No result: ${data.error}`; return; }
  last = { calculation: task.calculation, result: data.result }; displayResult(data.result); el<HTMLButtonElement>('add-calculation-board').disabled = false; el<HTMLButtonElement>('copy-calculation').disabled = false;
};
worker.onerror = () => { pending.clear(); el('solver-status').textContent = 'Calculator worker unavailable. Rebuild/reload; no guessed result was shown.'; };
function displayResult(result: SolverResult): void {
  el('result-trust').textContent = `✓ COMPUTED · ${result.solverVersion}`; el('solver-status').textContent = 'Computed from these explicit inputs. No AI supplied any numbers.';
  const table = node('table'); result.outputs.forEach(output => { const row = node('tr'), label = node('th', output.label), value = node('td', `${output.display} ${['1', 'text', 'symbolic', 'integer'].includes(output.unit) ? '' : output.unit}`); value.dataset.value = output.key; value.title = `Raw value: ${output.value}`; row.append(label, value); table.append(row); }); el('solver-result').replaceChildren(table);
  el('solver-steps').replaceChildren(...result.steps.map(step => node('li', step))); el('solver-warnings').replaceChildren(...result.warnings.map(w => node('p', w, 'tool-warning')));
  el('solver-sources').replaceChildren(...Object.values(result.sources).map(source => { const a = node('a', `${source.title} ↗`); a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = source.locator; return a; }));
  el('solver-graph').replaceChildren(); if (result.graph) renderGraph(el('solver-graph'), result.graph);
}
el('copy-calculation').onclick = async () => { if (last) { try { await navigator.clipboard.writeText(JSON.stringify(last, null, 2)); el('solver-status').textContent = 'Copied raw result, inputs, versions and sources.'; } catch { el('solver-status').textContent = 'Clipboard unavailable.'; } } };
el('add-calculation-board').onclick = async () => {
  if (!last) return; const calculation = structuredClone(last.calculation), display = last.result.graph ? 'graph' : 'steps';
  if (window.parent !== window) window.parent.postMessage({ type: 'tools-result', calculation, display }, location.origin);
  else { const doc = emptyBoard(); doc.objects.push({ id: crypto.randomUUID(), type: 'calculation', calculation, display, x: 80, y: 80, width: 430, height: 380 }); await saveLocal(doc, 'calculation-handoff'); location.href = '/board?calculation-handoff=1'; }
};
window.addEventListener('message', event => { if (window.parent === window || event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'board-load-tools') return; try { selectSolver(event.data.solverId, event.data.inputs); } catch (error) { el('solver-status').textContent = (error as Error).message; } });

for (const name of ['calculators', 'periodic', 'formulas']) el(`tab-${name}`).onclick = () => { for (const section of ['calculators', 'periodic', 'formulas']) { el(`${section}-section`).hidden = section !== name; el(`tab-${section}`).setAttribute('aria-pressed', String(section === name)); } };
el('disabled-solvers').replaceChildren(...DISABLED_TOPICS.map(s => node('p', `${s.title}: disabled — ${s.reason}`, 'tool-warning')));
function position(z: number): [number, number] {
  if (z === 1) return [1, 1]; if (z === 2) return [18, 1];
  if (z <= 18) { const row = z <= 10 ? 2 : 3, start = row === 2 ? 3 : 11, offset = z - start; return [offset < 2 ? offset + 1 : offset + 11, row]; }
  if (z <= 54) return [z - (z <= 36 ? 19 : 37) + 1, z <= 36 ? 4 : 5];
  if (z <= 86) return z >= 57 && z <= 71 ? [z - 57 + 3, 8] : [z <= 56 ? z - 55 + 1 : z - 72 + 4, 6];
  return z >= 89 && z <= 103 ? [z - 89 + 3, 9] : [z <= 88 ? z - 87 + 1 : z - 104 + 4, 7];
}
function showElement(z: number): void {
  const e = PERIODIC_ELEMENTS.find(e => e.z === z)!; const details = el('element-details');
  details.replaceChildren(node('h3', `${e.symbol} · ${e.name} · Z=${e.z}`), node('p', 'Looked up · cited source facts, not an EHT prediction.'),
    node('p', e.mass ? `CIAAW standard weight ${e.mass.reported}; molar-mass data enabled.` : 'No CIAAW standard weight: isotope masses are not substituted; molar-mass calculation disabled.'),
    node('p', `Reported neutral configuration: ${e.configuration || 'not reported'}`), node('p', `Electronegativity: ${e.electronegativity ?? 'not reported'}; reported radius: ${e.radiusPM ?? 'not reported'} pm; first ionization: ${e.ionizationEV ?? 'not reported'} eV.`), node('p', `${e.groupBlock} · ${e.state}. Source radius definitions/data rounding must not be confused with measured bond lengths.`));
  for (const key of ['ciaaw-2024', 'pubchem']) { const a = node('a', `${SOLVER_SOURCES[key].title} ↗`); a.href = SOLVER_SOURCES[key].url; a.target = '_blank'; a.rel = 'noopener noreferrer'; details.append(a, node('br')); }
}
function periodic(): void {
  const filter = el<HTMLInputElement>('periodic-search').value.toLowerCase(); el('periodic-grid').replaceChildren(...PERIODIC_ELEMENTS.map(e => {
    const button = node('button', e.symbol), [column, row] = position(e.z); button.style.gridColumn = String(column); button.style.gridRow = String(row); button.prepend(node('small', String(e.z))); button.setAttribute('aria-label', `${e.name} ${e.symbol}, atomic number ${e.z}`);
    button.hidden = !`${e.symbol} ${e.name} ${e.z}`.toLowerCase().includes(filter); button.onclick = () => showElement(e.z); return button;
  }));
}
el('periodic-search').oninput = periodic; periodic(); selectSolver(id);
const statusConnection = () => { el('connection-status').textContent = navigator.onLine ? 'LOCAL SOLVERS · ONLINE' : 'OFFLINE · LOCAL SOLVERS'; }; statusConnection(); window.addEventListener('online', statusConnection); window.addEventListener('offline', statusConnection);
if (window.parent !== window) window.parent.postMessage({ type: 'tools-ready' }, location.origin);
else installOffline();
