import { BoardCanvas, movedObject, type Tool } from './canvas.js';
import { BoardHistory } from './history.js';
import { emptyBoard, parseBoard, validateSnapshot, MAX_BOARD_BYTES } from './schema.js';
import { installBuilder } from './builder.js';
import { normalizeFormula, parseFormula } from './formula.js';
import { PRESETS } from '../lab/model.js';
import { decodeFragment, makeSnapshot } from './snapshot.js';
import { resolved, boardSVG, selectionBounds } from './render.js';
import { saveLocal, loadLocal } from './storage.js';
import { blobDataURL, copyImage, download, markdownBundle, noteMarkdown, noteSVG, pinLink, pinSource, portableBoard, qrSVG, regionBoard, svgPNG } from './export.js';
import type { BoardDocument, BoardObject, Level, ModelSnapshot, Pin } from './types.js';
import { installOffline } from '../offline/client.js';
import { classifyTyped } from '../solvers/classify.js';
import { makeCalculation, runCalculation, validateCalculation } from '../solvers/registry.js';
import type { Calculation, InputData } from '../solvers/types.js';
import { installRecognition } from '../recognition/controller.js';
import { confirmedLevels } from '../recognition/schema.js';

const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const input = (id: string): HTMLInputElement => el<HTMLInputElement>(id);
const btn = (id: string): HTMLButtonElement => el<HTMLButtonElement>(id);
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] { const n = document.createElement(tag); n.textContent = text; n.className = className; return n; }
let history = new BoardHistory(emptyBoard()), readOnly = false, sharedId: string | null = null, sharedRevision: number | null = null;
const notebookOwnedIds = new Set<string>();
let textPlacement: [number, number] = [80, 80], textEditing: string | null = null, ladderEditing: string | null = null;
let labReady = false, labObject: string | null = null, queuedSnapshot: ModelSnapshot | null = null, currentLab: ModelSnapshot | null = null;
let toolsReady = false, queuedTools: { solverId: string; inputs: InputData } | null = null;
const status = (message: string) => { el('board-status').textContent = message; };
const doc = () => history.document;
const sharedURL = () => sharedId ? `${location.origin}/b/${sharedId}` : null;
let theme = 'dark'; try { theme = localStorage.getItem('orbitalboard-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch { /* preferences are optional */ }
document.documentElement.dataset.theme = theme;
installOffline();

function change(kind: string, before: BoardObject[], after: BoardObject[], pins: Pin[] | null = null): void {
  if (readOnly) { status('Read-only board. Remix it to make your own changes.'); return; }
  try { history.commit(kind, before, after, pins); render(); status(`${kind.replaceAll('_', ' ')} · local draft changed. Save explicitly to persist/share.`); }
  catch (error) { status((error as Error).message); render(); }
}
const canvas = new BoardCanvas(el('board-canvas') as unknown as SVGSVGElement, doc, () => !readOnly, change, selectionChanged, (x, y) => openText(x, y));
const recognition = installRecognition({
  selection: () => ({ documentId: doc().id, objects: canvas.objects(), systems: doc().systems, readOnly }), status,
  accept: (reading, systemId, originals) => {
    if (readOnly) throw new Error('Remix before adding input.');
    const b = selectionBounds(originals); const placement = { id: crypto.randomUUID(), x: b.x + b.width + 25, y: b.y + 16, width: 370, height: reading.kind === 'energy-diagram' ? 430 : 160 };
    let object: BoardObject;
    if (reading.kind === 'energy-diagram' && systemId) {
      if (!Object.hasOwn(doc().systems, systemId)) throw new Error('Reference system is no longer available.');
      object = { ...placement, type: 'ladder', systemId, levels: confirmedLevels(reading) };
    } else object = { ...placement, type: 'text', text: reading.text };
    const candidate = structuredClone(doc()); candidate.objects.push(object); parseBoard(candidate);
    change('recognition_confirmed_as_input', [], [object]); canvas.select(object.id); setTool('select');
    status('Confirmed interpretation added as student input. Original ink retained. No solver ran; choose an action to compute/check.');
  },
});
function setTheme(value: string): void { theme = value === 'light' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; btn('board-theme').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode'; try { localStorage.setItem('orbitalboard-theme', theme); } catch { /* optional */ } canvas.render(); renderPins(); }
btn('board-theme').onclick = () => setTheme(theme === 'dark' ? 'light' : 'dark');
window.addEventListener('storage', event => { if (event.key === 'orbitalboard-theme' && event.newValue) setTheme(event.newValue); });
function render(): void {
  input('board-title').value = doc().title; input('board-title').readOnly = readOnly;
  canvas.render(); el('board-empty').hidden = doc().objects.length > 0; el('pin-count').textContent = String(doc().pins.length);
  btn('undo-board').disabled = readOnly || !doc().cursor; btn('redo-board').disabled = readOnly || doc().cursor === doc().events.length;
  input('history-position').max = String(doc().events.length); input('history-position').value = String(doc().cursor); el('history-label').textContent = `${doc().cursor} / ${doc().events.length}`;
  el('board-access').textContent = readOnly ? 'SHARED · READ ONLY' : sharedId ? 'OWNER / REMIX · LOCAL EDITS' : 'LOCAL DRAFT';
  btn('remix-board').hidden = !readOnly; btn('owner-edit').hidden = !readOnly || !ownerToken(); btn('system-builder').disabled = readOnly;
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b => { b.disabled = readOnly && b.dataset.tool !== 'select'; });
  el('object-list').replaceChildren(...doc().objects.map(o => { const b = element('button', `${o.type} · ${o.id.slice(0, 6)}`); b.onclick = () => canvas.select(o.id); return b; }));
  renderPins(); selectionChanged();
}
function openText(x: number, y: number, object?: BoardObject): void {
  if (readOnly) return; textPlacement = [x, y]; textEditing = object?.id ?? null;
  el<HTMLTextAreaElement>('object-text').value = object?.type === 'text' ? object.text : ''; btn('insert-text').textContent = textEditing ? 'Update text' : 'Place text'; el<HTMLDialogElement>('text-dialog').showModal(); el('object-text').focus();
}
btn('insert-text').onclick = () => {
  const text = el<HTMLTextAreaElement>('object-text').value; if (!text.trim()) { status('Write something first.'); return; }
  const existing = doc().objects.find(o => o.id === textEditing);
  const object: BoardObject = { id: textEditing ?? crypto.randomUUID(), type: 'text', text, x: existing?.x ?? textPlacement[0], y: existing?.y ?? textPlacement[1], width: 320, height: Math.min(400, Math.max(95, text.split('\n').length * 24 + 50)) };
  change('text_created_or_edited', existing ? [existing] : [], [object]); el<HTMLDialogElement>('text-dialog').close(); canvas.select(object.id); setTool('select');
};
function setTool(tool: Tool): void { canvas.tool = tool; document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool))); canvas.render(); }
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b => { b.onclick = () => setTool(b.dataset.tool as Tool); });
const builder = installBuilder(snapshot => {
  if (readOnly) return;
  const id = crypto.randomUUID(); doc().systems[id] = snapshot; const [x, y] = [doc().viewBox[0] + 80, doc().viewBox[1] + 80];
  const object: BoardObject = { id: crypto.randomUUID(), type: 'molecule', systemId: id, x, y, width: 320, height: 175 }; change('system_created', [], [object]); canvas.select(object.id); setTool('select');
});
btn('system-builder').onclick = builder;

type Action = { label: string; run: () => void | Promise<void> };
let currentActions: Action[] = [];
function invoke(action: Action): void { try { const result = action.run(); if (result) void result.catch(error => status((error as Error).message)); } catch (error) { status((error as Error).message); } }
function selectionChanged(): void {
  recognition.selectionChanged();
  const objects = canvas.objects(), bar = el('action-bar'); bar.hidden = !objects.length; if (!objects.length) return;
  const object = objects[0]; const b = selectionBounds(objects); const [x, y] = canvas.screen(b.x, b.y + b.height + 6);
  bar.style.left = `${Math.max(8, Math.min(canvas.svg.clientWidth - 360, x))}px`; bar.style.top = `${Math.max(8, Math.min(canvas.svg.clientHeight - 100, y))}px`;
  let formula: string | null = null;
  const typed = objects.length === 1 && object.type === 'text' ? classifyTyped(object.text) : null;
  if (objects.length === 1 && object.type === 'text') { try { parseFormula(object.text); formula = normalizeFormula(object.text); } catch { /* ordinary text/ink stays student work */ } }
  el('interpretation').textContent = formula ? `Read as ${formula} — correct? Edit the text before choosing if needed.` : object.type === 'ink' ? 'Ink stays ink until Read selection. Review any proposal before choosing a solver.' : `${objects.length} selected · ${object.type} · choose an action.`;
  const primary: Action[] = [], more: Action[] = [];
  const add = (label: string, run: Action['run'], extra = false) => (extra ? more : primary).push({ label, run });
  if (objects.length > 1) {
    el('interpretation').textContent = 'Mixed selection · pin/copy the region, or select one input to compute it.';
    if (objects.every(o => o.type === 'ink' || o.type === 'text')) add('Read selection', () => recognition.open());
    add('Copy image', async () => copyImage(await svgPNG(boardSVG(doc(), canvas.objects(), theme === 'dark' ? 'dark' : 'light'))));
  } else if (formula) {
    const captured = formula;
    add('3D model', () => openFormula(captured, object));
    add('Orbitals', () => formulaOrbitals(captured, object));
    add('Answer', () => { resultNext(object, { type: 'answer', formula: captured }, 'formula_answer', 250); });
    add('Edit', () => openText(object.x, object.y, object));
    add('Molar mass', () => calculationNext(object, 'chem.molar-mass', { formula: captured }), true);
    add('Calculator tools', () => openTools('chem.molar-mass', { formula: captured }), true);
  } else if (object.type === 'text' && typed) {
    el('interpretation').textContent = `Read as ${typed.replaceAll('-', ' ')} — edit to correct before choosing. No calculation yet.`;
    if (typed === 'chemical-equation') {
      add('Balance', () => calculationNext(object, 'chem.balance', { equation: object.text }));
      add('Steps', () => calculationNext(object, 'chem.balance', { equation: object.text }, 'steps'));
      add('Stoichiometry', () => openTools('chem.stoichiometry', { equation: object.text }));
    } else if (typed === 'chemical-formula') {
      add('Molar mass', () => calculationNext(object, 'chem.molar-mass', { formula: object.text }));
      add('Steps', () => calculationNext(object, 'chem.molar-mass', { formula: object.text }, 'steps'));
      add('Tools', () => openTools('chem.molar-mass', { formula: object.text }));
    } else if (typed === 'math-equation') {
      add('Answer', () => calculationNext(object, 'math.solve', { equation: object.text }));
      add('Steps', () => calculationNext(object, 'math.solve', { equation: object.text }, 'steps'));
      add('Tools', () => openTools('math.solve', { equation: object.text }));
    } else {
      add('Evaluate', () => openTools('math.calculate', { expression: object.text, x: 0 }));
      add('Differentiate', () => calculationNext(object, 'math.differentiate', { expression: object.text }));
      add('Integrate', () => calculationNext(object, 'math.integrate', { expression: object.text }));
      add('Graph', () => openTools('math.graph', { expression: object.text, min: -5, max: 5 }));
    }
    add('Edit', () => openText(object.x, object.y, object), true);
  } else if (object.type === 'calculation') {
    add('Reopen tools', () => openTools(object.calculation.solverId, object.calculation.inputs));
    add('Steps', () => { change('calculator_presentation_changed', [object], [{ ...object, display: 'steps' }]); });
    add('Answer', () => { change('calculator_presentation_changed', [object], [{ ...object, display: 'answer' }]); });
  } else if ('systemId' in object) {
    add('3D model', () => openLab(doc().systems[object.systemId], object.type === 'molecule' ? object.id : null));
    add('Orbitals', () => { resultNext(object, { type: 'orbitals', systemId: object.systemId }, 'orbitals_requested', 400); });
    if (object.type === 'ladder') {
      add('Check diagram', () => { resultNext(object, { type: 'check', systemId: object.systemId, levels: structuredClone(object.levels) }, 'diagram_checked', 315); });
      add('Edit arrows', () => editLadder(object));
    } else {
      add('Your diagram', () => {
        const result = resolved(doc().systems[object.systemId]);
        const ladder = resultNext(object, { type: 'ladder', systemId: object.systemId, levels: result.orbitals.map(o => ({ orbital: o.index, arrows: [] })) }, 'student_diagram_created', 430);
        editLadder(ladder);
      });
      add('Scan', () => {
        const atoms = doc().systems[object.systemId].state.atoms; if (atoms.length < 3) throw new Error('An angle scan needs three atoms. Use the lab for custom handles.');
        resultNext(object, { type: 'scan', systemId: object.systemId, centerId: atoms[0].id, fixedId: atoms[1].id, movingId: atoms[2].id, angles: Array.from({ length: 19 }, (_, i) => 90 + i * 5) }, 'scan_requested', 290);
      });
    }
    add('Export model', () => openLab(doc().systems[object.systemId], null), true);
  } else {
    if (object.type === 'text') add('Edit text', () => openText(object.x, object.y, object));
    else { add('Read selection', () => recognition.open()); add('Type instead', () => openText(object.x, object.y)); }
  }
  if (objects.length === 1 && object.type === 'text') add('Read selection', () => recognition.open(), true);
  add('Pin', () => pinSelection());
  add('Copy image', async () => copyImage(await svgPNG(boardSVG(doc(), canvas.objects(), theme === 'dark' ? 'dark' : 'light'))), true);
  add('Delete', () => { change('objects_deleted', canvas.objects(), []); canvas.selected.clear(); render(); }, true);
  currentActions = primary.slice(0, 5); if (primary.length > 5) more.unshift(...primary.slice(5));
  el('primary-actions').replaceChildren(...currentActions.map((action, index) => {
    const button = element('button', `${action.label} ${index + 1}`); button.disabled = readOnly && !['3D model', 'Copy image', 'Reopen tools'].includes(action.label);
    try { if (localStorage.getItem(`orbitalboard-action-${formula ? 'formula' : object.type}`) === action.label) { button.classList.add('last-used'); button.title = 'Last used action for this content type'; } } catch { /* optional preference */ }
    button.onclick = () => { try { localStorage.setItem(`orbitalboard-action-${formula ? 'formula' : object.type}`, action.label); } catch { /* optional */ } invoke(action); }; return button;
  }));
  el('more-actions').querySelector('div')!.replaceChildren(...more.map(action => { const button = element('button', action.label); button.disabled = readOnly && action.label !== 'Copy image' && action.label !== 'Export model'; button.onclick = () => invoke(action); return button; }));
}
type Payload = Omit<Extract<BoardObject, { type: 'answer' }>, 'id' | 'x' | 'y' | 'width' | 'height'> | { type: 'orbitals' | 'molecule'; systemId: string } | { type: 'ladder' | 'check'; systemId: string; levels: Level[] } | { type: 'scan'; systemId: string; centerId: string; fixedId: string; movingId: string; angles: number[] };
function calculationNext(source: BoardObject, solverId: string, inputs: InputData, display: 'answer' | 'steps' | 'graph' = 'answer'): void {
  if (readOnly) throw new Error('Remix before computing new results.'); const calculation = makeCalculation(solverId, inputs); runCalculation(calculation);
  const object: BoardObject = { id: crypto.randomUUID(), type: 'calculation', calculation, display, x: source.x + source.width + 40, y: source.y, width: 450, height: 380 };
  change('calculator_requested', [], [object]); canvas.select(object.id);
}
function openTools(solverId = 'chem.balance', inputs: InputData = {}): void {
  queuedTools = { solverId, inputs }; el<HTMLDialogElement>('tools-dialog').showModal(); const frame = el<HTMLIFrameElement>('tools-frame');
  if (!frame.src.endsWith('/tools?embedded=1')) { toolsReady = false; frame.src = '/tools?embedded=1'; }
  if (toolsReady) frame.contentWindow?.postMessage({ type: 'board-load-tools', ...queuedTools }, location.origin);
}
btn('calculator-tools').onclick = () => openTools(); btn('close-tools').onclick = () => el<HTMLDialogElement>('tools-dialog').close();
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== el<HTMLIFrameElement>('tools-frame').contentWindow) return;
  try {
    if (event.data?.type === 'tools-ready') { toolsReady = true; if (queuedTools) el<HTMLIFrameElement>('tools-frame').contentWindow?.postMessage({ type: 'board-load-tools', ...queuedTools }, location.origin); }
    if (event.data?.type === 'tools-result') {
      if (readOnly) throw new Error('Remix before adding results.'); const calculation: Calculation = validateCalculation(event.data.calculation); runCalculation(calculation);
      const source = canvas.objects()[0]; const display = ['answer', 'steps', 'graph'].includes(event.data.display) ? event.data.display as 'answer' | 'steps' | 'graph' : 'answer';
      const object: BoardObject = { id: crypto.randomUUID(), type: 'calculation', calculation, display, x: source ? source.x + source.width + 40 : doc().viewBox[0] + 80, y: source?.y ?? doc().viewBox[1] + 80, width: 450, height: 380 };
      change('calculator_result_added', [], [object]); canvas.select(object.id); el<HTMLDialogElement>('tools-dialog').close();
    }
  } catch (error) { status((error as Error).message); }
});
function resultNext(source: BoardObject, payload: Payload, kind: string, height = 250): BoardObject {
  if (readOnly) throw new Error('Remix the board before creating new results.');
  if ('systemId' in payload && ['orbitals', 'check', 'scan'].includes(payload.type)) resolved(doc().systems[payload.systemId]);
  const object = { ...payload, id: crypto.randomUUID(), x: source.x + source.width + 40, y: source.y, width: 390, height } as BoardObject;
  change(kind, [], [object]); canvas.select(object.id); return object;
}
function formulaSnapshot(formula: string): ModelSnapshot { const template = PRESETS[formula]; if (!template) throw new Error('No unique geometry inferred from this formula. Use System builder / XYZ / free-build.'); return makeSnapshot(template.state); }
function openFormula(formula: string, source: BoardObject): void {
  if (readOnly) return; const id = crypto.randomUUID(); doc().systems[id] = formulaSnapshot(formula);
  const object = resultNext(source, { type: 'molecule', systemId: id }, 'formula_template_confirmed', 175); openLab(doc().systems[id], object.id);
}
function formulaOrbitals(formula: string, source: BoardObject): void { const id = crypto.randomUUID(); doc().systems[id] = formulaSnapshot(formula); resultNext(source, { type: 'orbitals', systemId: id }, 'orbitals_requested', 400); }
function editLadder(object: BoardObject): void {
  if (object.type !== 'ladder' || readOnly) return; ladderEditing = object.id;
  el<HTMLTextAreaElement>('ladder-text').value = object.levels.map(l => `${l.orbital + 1}: ${l.arrows.map(a => a === 'up' ? '↑' : '↓').join('')}`).join('\n'); el('ladder-status').textContent = ''; el<HTMLDialogElement>('ladder-dialog').showModal();
}
btn('apply-ladder').onclick = () => {
  try {
    const object = doc().objects.find(o => o.id === ladderEditing); if (!object || object.type !== 'ladder') return;
    const levels = el<HTMLTextAreaElement>('ladder-text').value.trim().split('\n').filter(Boolean).map(line => {
      const match = /^(\d+)\s*:\s*([↑↓]*)\s*$/.exec(line); if (!match) throw new Error('Use one line such as 1: ↑↓, with no guessed labels.');
      return { orbital: Number(match[1]) - 1, arrows: [...match[2]].map(a => a === '↑' ? 'up' as const : 'down' as const) };
    });
    const candidate = { ...object, levels }; const test = structuredClone(doc()); test.objects = test.objects.map(o => o.id === object.id ? candidate : o); parseBoard(test);
    change('student_diagram_edited', [object], [candidate]); el<HTMLDialogElement>('ladder-dialog').close();
  } catch (error) { el('ladder-status').textContent = (error as Error).message; }
};

function openLab(snapshot: ModelSnapshot, objectId: string | null): void {
  queuedSnapshot = snapshot; currentLab = null; labObject = objectId; el<HTMLDialogElement>('lab-dialog').showModal(); btn('apply-lab').disabled = readOnly || objectId === null;
  const frame = el<HTMLIFrameElement>('lab-frame'); if (!frame.src.endsWith('/?embedded=1')) { labReady = false; frame.src = '/?embedded=1'; }
  if (labReady) frame.contentWindow?.postMessage({ type: 'board-load-model', snapshot, readOnly, defaultHomo: objectId !== null && snapshot.view.camera === null }, location.origin);
}
btn('close-lab').onclick = () => el<HTMLDialogElement>('lab-dialog').close();
btn('apply-lab').onclick = () => el<HTMLIFrameElement>('lab-frame').contentWindow?.postMessage({ type: 'board-read-model' }, location.origin);
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== el<HTMLIFrameElement>('lab-frame').contentWindow) return;
  try {
    if (event.data?.type === 'lab-ready') { labReady = true; if (queuedSnapshot) el<HTMLIFrameElement>('lab-frame').contentWindow?.postMessage({ type: 'board-load-model', snapshot: queuedSnapshot, readOnly, defaultHomo: labObject !== null && queuedSnapshot.view.camera === null }, location.origin); }
    if (event.data?.type === 'lab-error') status(String(event.data.error));
    if (event.data?.type === 'lab-current' && !readOnly && labObject) {
      currentLab = validateSnapshot(event.data.snapshot); const object = doc().objects.find(o => o.id === labObject); if (!object || object.type !== 'molecule') return;
      const id = crypto.randomUUID(); doc().systems[id] = currentLab; change('geometry_applied_from_lab', [object], [{ ...object, systemId: id }]);
    }
    if (event.data?.type === 'lab-pin' && !readOnly) {
      const snapshot = validateSnapshot(event.data.snapshot); const id = crypto.randomUUID(); doc().systems[id] = snapshot;
      void addPin(`MO ${snapshot.view.orbital + 1}`, `Computed model snapshot, MO ${snapshot.view.orbital + 1}; reopen its state to verify values.`, id, event.data.dark, event.data.light).catch(error => status((error as Error).message));
    }
  } catch (error) { status((error as Error).message); }
});

async function addPin(title: string, alt: string, systemId: string | null, dark: string, light: string, region: BoardObject[] | null = null): Promise<void> {
  if (readOnly) return; const previous = structuredClone(doc()); const darkId = crypto.randomUUID(), lightId = crypto.randomUUID(); doc().media[darkId] = dark; doc().media[lightId] = light;
  const pin: Pin = { id: crypto.randomUUID(), title, caption: '', captionSource: 'student', tags: [], date: new Date().toISOString(), alt, darkMedia: darkId, lightMedia: lightId, systemId, region: region ? structuredClone(region) : null };
  const test = structuredClone(doc()); test.pins = [...test.pins, pin]; try { parseBoard(test); } catch (error) { history.document = previous; throw error; }
  change('snapshot_pinned', [], [], test.pins);
  notebookOwnedIds.add(pin.id);
  // Pin is an explicit notebook save. It does not implicitly save the rest of the board ink.
  await persistNotebook();
  status('Pinned and saved in the local notebook. Nothing was uploaded.');
}
async function pinSelection(): Promise<void> {
  const objects = canvas.objects(); if (!objects.length || readOnly) return;
  const systemId = objects.length === 1 && objects[0].type === 'orbitals' ? objects[0].systemId : null;
  await addPin('Board snapshot', `${objects.length} selected board objects; student marks and computed objects keep separate source semantics.`, systemId,
    await blobDataURL(await svgPNG(boardSVG(doc(), objects, 'dark'))), await blobDataURL(await svgPNG(boardSVG(doc(), objects, 'light'))), objects);
}

function renderPins(): void {
  const search = input('pin-search').value.toLowerCase(); const pins = doc().pins.filter(p => `${p.title} ${p.caption} ${p.tags.join(' ')}`.toLowerCase().includes(search));
  if (!pins.length) { el('pins').replaceChildren(element('p', 'Pin a selected region or a solved 3D view. Pins are local-first.', 'fine')); return; }
  el('pins').replaceChildren(...pins.map(pin => {
    const card = element('article', '', 'pin-card'); card.dataset.pin = pin.id;
    const image = element('img'); image.src = doc().media[theme === 'dark' ? pin.darkMedia : pin.lightMedia]; image.alt = pin.alt;
    const title = element('input'); title.value = pin.title; title.maxLength = 160; title.setAttribute('aria-label', 'Pin title'); title.readOnly = readOnly;
    const caption = element('textarea'); caption.value = pin.caption; caption.maxLength = 4000; caption.placeholder = 'Your notes…'; caption.setAttribute('aria-label', 'Pin caption'); caption.readOnly = readOnly;
    const tags = element('input'); tags.value = pin.tags.join(', '); tags.placeholder = 'Tags, separated by commas'; tags.setAttribute('aria-label', 'Pin tags'); tags.readOnly = readOnly;
    const edit = async (updated: Pin) => { change('note_edited', [], [], doc().pins.map(p => p.id === pin.id ? updated : p)); await persistNotebook(); status('Notebook note saved locally. No upload.'); };
    title.onchange = () => void edit({ ...pin, title: title.value }).catch(error => status((error as Error).message)); caption.onchange = () => void edit({ ...pin, caption: caption.value }).catch(error => status((error as Error).message)); tags.onchange = () => void edit({ ...pin, tags: tags.value.split(',').map(s => s.trim()).filter(Boolean) }).catch(error => status((error as Error).message));
    const buttons = element('div', '', 'pin-buttons');
    const action = (label: string, run: () => void | Promise<void>, editable = false) => { const b = element('button', label); b.disabled = editable && readOnly; b.onclick = () => invoke({ label, run }); buttons.append(b); };
    action('Reopen', async () => { const url = await pinLink(pin, doc(), sharedURL()); if (!url) throw new Error('This is a local board-region note. Save a shared board for a live board link.'); window.open(url, '_blank', 'noopener,noreferrer'); });
    action('PNG', async () => download(await svgPNG(await noteSVG(pin, doc(), 'light', sharedURL())), `${pin.title}.png`));
    action('SVG', async () => download(await noteSVG(pin, doc(), 'light', sharedURL()), `${pin.title}.svg`, 'image/svg+xml'));
    action('Copy image', async () => copyImage(await svgPNG(await noteSVG(pin, doc(), 'light', sharedURL()))));
    action('Markdown', async () => download(await noteMarkdown(pin, doc(), sharedURL()), `${pin.title}.md`, 'text/markdown'));
    action('MD + PNG ZIP', async () => download(await markdownBundle([pin], doc(), sharedURL()), `${pin.title}.zip`));
    action('Copy MD', async () => navigator.clipboard.writeText(await noteMarkdown(pin, doc(), sharedURL())));
    action('Copy text', async () => navigator.clipboard.writeText(`${pin.title}\n${pin.caption}\n${pinSource(pin, doc())}\n${await pinLink(pin, doc(), sharedURL()) ?? ''}`));
    action('Copy link', async () => { const url = await pinLink(pin, doc(), sharedURL()); if (!url) throw new Error('Share this board to get a link for non-model pins.'); await navigator.clipboard.writeText(url); });
    action('↑', () => reorder(pin.id, -1), true); action('↓', () => reorder(pin.id, 1), true);
    action('Remove', async () => { change('pin_removed', [], [], doc().pins.filter(p => p.id !== pin.id)); await persistNotebook(); }, true);
    action('Draft AI caption', () => draftCaption(pin, card), true);
    const ai = [...buttons.querySelectorAll('button')].find(b => b.textContent === 'Draft AI caption'); if (ai) ai.disabled = readOnly || !navigator.onLine || !pin.systemId;
    card.append(image, title, caption, tags, element('p', `${pin.captionSource === 'ai-unverified' ? 'AI caption: accepted, still unverified. ' : ''}Saved image is an attachment. ${pinSource(pin, doc())}`, 'fine'), buttons); return card;
  }));
}
async function persistNotebook(): Promise<void> {
  const saved = await loadLocal('notebook'), merged = saved ?? emptyBoard();
  Object.assign(merged.systems, doc().systems); Object.assign(merged.media, doc().media);
  merged.objects = []; merged.events = []; merged.cursor = 0; merged.title = 'Local notebook';
  const current = new Set(doc().pins.map(p => p.id));
  merged.pins = [...structuredClone(doc().pins), ...(saved?.pins ?? []).filter(p => !current.has(p.id) && !notebookOwnedIds.has(p.id))];
  await saveLocal(portableBoard(merged), 'notebook');
}
function reorder(id: string, delta: number): void { const pins = [...doc().pins], at = pins.findIndex(p => p.id === id), to = at + delta; if (to < 0 || to >= pins.length) return; [pins[at], pins[to]] = [pins[to], pins[at]]; change('pins_reordered', [], [], pins); void persistNotebook().catch(error => status((error as Error).message)); }
async function draftCaption(pin: Pin, card: HTMLElement): Promise<void> {
  if (!pin.systemId) throw new Error('AI captions are available only for a solved molecular source, never arbitrary board text.');
  status('Caption request sends the pinned system to your server and selected solved facts to Groq. Nothing is saved until Accept.');
  const snapshot = doc().systems[pin.systemId];
  const response = await fetch('/api/tutor/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: snapshot.state, orbitalIndex: snapshot.view.orbital, question: 'Draft a short caption for this orbital, grounded only in its supplied facts and model limits.' }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Caption unavailable.');
  const draft = element('textarea'); draft.value = data.segments.map((s: { text: string }) => s.text).join('\n'); draft.setAttribute('aria-label', 'Unverified AI caption draft');
  const accept = element('button', 'Accept edited draft · unverified'); accept.onclick = () => { const current = doc().pins.find(p => p.id === pin.id); if (!current || readOnly) return; change('ai_caption_accepted', [], [], doc().pins.map(p => p.id === pin.id ? { ...p, caption: draft.value, captionSource: 'ai-unverified' } : p)); void persistNotebook().catch(error => status((error as Error).message)); };
  const discard = element('button', 'Discard draft'); discard.onclick = () => { draft.remove(); accept.remove(); discard.remove(); };
  card.append(draft, accept, discard);
}

function historyChange(forward: boolean): void {
  if (readOnly) return; const pins = JSON.stringify(doc().pins); forward ? history.redo() : history.undo(); canvas.selected.clear(); render();
  if (JSON.stringify(doc().pins) !== pins) void persistNotebook().catch(error => status((error as Error).message));
}
btn('undo-board').onclick = () => historyChange(false);
btn('redo-board').onclick = () => historyChange(true);
input('history-position').oninput = () => { history.seek(Number(input('history-position').value)); canvas.selected.clear(); render(); status('Replay previews data only. It does not repeat AI calls, downloads, uploads or other side effects.'); };
btn('fit-board').onclick = () => { canvas.fit(); selectionChanged(); }; btn('zoom-in').onclick = () => canvas.zoom(.8); btn('zoom-out').onclick = () => canvas.zoom(1.25);
input('board-title').onchange = () => { if (!readOnly) { doc().title = input('board-title').value; status('Title changed in this local draft.'); } };
input('pin-search').oninput = renderPins;
btn('show-notebook').onclick = () => { el('notebook').hidden = !el('notebook').hidden; el('notebook').parentElement!.classList.toggle('notebook-hidden', el('notebook').hidden); };
btn('save-local').onclick = () => void saveLocal(doc()).then(() => status('Complete board saved locally in this browser. No upload.')).catch(error => status((error as Error).message));
function useDocument(next: BoardDocument): void { history = new BoardHistory(parseBoard(next)); notebookOwnedIds.clear(); doc().pins.forEach(p => notebookOwnedIds.add(p.id)); canvas.selected.clear(); render(); }
btn('restore-local').onclick = async () => { try { const saved = await loadLocal(); if (!saved) throw new Error('No local board saved yet.'); if (doc().objects.length && !confirm('Replace this draft with your saved local board? Unsaved work will not be kept.')) return; readOnly = false; sharedId = null; useDocument(saved); status('Local board restored. Stored result objects replay their pinned sources; text/ink do not trigger new solvers.'); } catch (error) { status((error as Error).message); } };
btn('restore-notebook').onclick = async () => { try { if (readOnly) throw new Error('Remix first.'); const saved = await loadLocal('notebook'); if (!saved) throw new Error('No saved notebook yet.'); const next = structuredClone(doc()); Object.assign(next.systems, saved.systems); Object.assign(next.media, saved.media); next.pins = saved.pins; useDocument(parseBoard(next)); status('Local notebook restored.'); } catch (error) { status((error as Error).message); } };

function ownerToken(): string | null { try { return sharedId ? localStorage.getItem(`orbitalboard-owner-${sharedId}`) : null; } catch { return null; } }
btn('share-board').onclick = () => { el<HTMLDialogElement>('share-dialog').showModal(); showLink(); };
function showLink(): void { input('shared-link').value = sharedURL() ?? ''; btn('delete-shared').disabled = !ownerToken() || !navigator.onLine; btn('save-shared').disabled = readOnly || !navigator.onLine; if (sharedURL()) el('share-qr').innerHTML = qrSVG(sharedURL()!); }
window.addEventListener('offline', () => { showLink(); renderPins(); status('Offline: local calculations/saving/exports work; AI and server sharing are unavailable. No writes are queued.'); });
window.addEventListener('online', () => { showLink(); renderPins(); });
btn('save-shared').onclick = async () => {
  try {
    if (readOnly) throw new Error('Remix or choose Owner edit first.');
    const document = portableBoard(doc(), input('share-history').checked); parseBoard(document);
    const token = ownerToken(), update = sharedId && token;
    const response = await fetch(update ? `/api/boards/${sharedId}` : '/api/boards', { method: update ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', ...(update ? { Authorization: `Bearer ${token}`, 'If-Match': String(sharedRevision) } : {}) }, body: JSON.stringify({ document }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Save failed.'); sharedId = data.id; sharedRevision = data.revision;
    if (data.ownerToken) { try { localStorage.setItem(`orbitalboard-owner-${data.id}`, data.ownerToken); } catch { throw new Error('Saved, but this browser could not persist the owner token. Public link is view-only; use local JSON as your editable backup.'); } }
    showLink(); render(); el('share-status').textContent = 'Shared copy saved. Owner token stays in this browser and is never in the public link, QR or document. History omitted unless explicitly selected.';
  } catch (error) { el('share-status').textContent = (error as Error).message; }
};
btn('copy-shared-link').onclick = async () => { if (sharedURL()) await navigator.clipboard.writeText(sharedURL()!); };
btn('save-qr').onclick = () => { if (sharedURL()) download(qrSVG(sharedURL()!), 'OrbitalBoard-link.svg', 'image/svg+xml'); };
btn('delete-shared').onclick = async () => {
  if (!sharedId || !ownerToken() || !confirm('Delete this shared board from the server? Your local draft and exported files remain.')) return;
  try { const response = await fetch(`/api/boards/${sharedId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ownerToken()}` } }); const data = await response.json(); if (!response.ok) throw new Error(data.error); localStorage.removeItem(`orbitalboard-owner-${sharedId}`); sharedId = null; sharedRevision = null; showLink(); status('Shared copy deleted. Local draft retained.'); }
  catch (error) { el('share-status').textContent = (error as Error).message; }
};
btn('remix-board').onclick = () => { const copy = structuredClone(doc()); copy.id = crypto.randomUUID(); copy.title += ' · remix'; readOnly = false; sharedId = null; sharedRevision = null; useDocument(copy); status('Remix is a new local draft. Original shared board is unchanged.'); };
btn('owner-edit').onclick = () => { if (ownerToken()) { readOnly = false; render(); status('Owner editing local copy. Save shared board to publish changes; concurrent revisions are protected.'); } };

btn('export-board').onclick = () => el<HTMLDialogElement>('export-dialog').showModal();
const exportTheme = () => (el<HTMLSelectElement>('export-theme').value === 'match' && theme === 'dark' ? 'dark' : 'light') as 'dark' | 'light';
const exportedObjects = () => canvas.objects().length ? canvas.objects() : doc().objects;
btn('board-svg').onclick = () => download(boardSVG(doc(), exportedObjects(), exportTheme()), `${doc().title}.svg`, 'image/svg+xml');
btn('board-png').onclick = () => invoke({ label: 'PNG', run: async () => download(await svgPNG(boardSVG(doc(), exportedObjects(), exportTheme())), `${doc().title}.png`) });
btn('copy-board-image').onclick = () => invoke({ label: 'Copy image', run: async () => copyImage(await svgPNG(boardSVG(doc(), exportedObjects(), exportTheme()))) });
btn('board-json').onclick = () => download(JSON.stringify(portableBoard(doc(), input('export-history').checked), null, 2), `${doc().title}.json`, 'application/json');
input('import-json').onchange = async () => {
  try { const file = input('import-json').files?.[0]; if (!file) return; if (file.size > MAX_BOARD_BYTES) throw new Error('Import exceeds 4 MiB.'); const next = parseBoard(JSON.parse(await file.text())); if (doc().objects.length && !confirm('Replace the current draft? Export unsaved work first if needed.')) return; readOnly = false; sharedId = null; sharedRevision = null; useDocument(next); status('Validated JSON imported. Unknown fields/versions and unsafe image types are rejected.'); }
  catch (error) { status(`Import rejected; current work retained: ${(error as Error).message}`); }
};
async function printSheet(board = false): Promise<void> {
  const area = el('print-area'); area.replaceChildren();
  if (board) { const image = element('img'); image.alt = doc().title; image.src = await blobDataURL(await svgPNG(boardSVG(doc(), exportedObjects(), 'light'))); area.append(image); }
  else for (const pin of doc().pins) { const article = element('article'), image = element('img'); image.alt = pin.alt; image.src = await blobDataURL(await svgPNG(await noteSVG(pin, doc(), 'light', sharedURL()))); article.append(image); area.append(article); }
  await Promise.all([...area.querySelectorAll('img')].map(i => i.decode())); window.print();
}
btn('print-sheet').onclick = () => invoke({ label: 'Print sheet', run: () => printSheet() }); btn('print-board').onclick = () => invoke({ label: 'Print board', run: () => printSheet(true) });
btn('download-sheet').onclick = () => invoke({ label: 'Study sheet', run: async () => download(await markdownBundle(doc().pins, doc(), sharedURL()), `${doc().title}.zip`) });

document.addEventListener('keydown', event => {
  if ((event.target as HTMLElement).closest('input,textarea,select') || document.querySelector('dialog[open]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); historyChange(event.shiftKey); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); btn('save-local').click(); return; }
  if (/^[1-5]$/.test(event.key) && !el('action-bar').hidden) { const action = currentActions[Number(event.key) - 1]; if (action && !readOnly) invoke(action); }
  if (event.key === 'Delete' && !readOnly) { change('objects_deleted', canvas.objects(), []); canvas.selected.clear(); render(); }
  if (!readOnly) { const tool = { v: 'select', p: 'pen', t: 'text', e: 'eraser' }[event.key.toLowerCase()]; if (tool) setTool(tool as Tool); }
  if (event.key.startsWith('Arrow') && !readOnly && canvas.objects().length) { event.preventDefault(); const step = event.shiftKey ? 100 : 20, dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0, dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0; const before = canvas.objects(); change('objects_moved_by_keyboard', before, before.map(o => movedObject(o, dx, dy))); }
});

setTheme(theme); render();
const path = /^\/b\/([A-Za-z0-9_-]{24})$/.exec(location.pathname);
if (path) {
  readOnly = true; render(); status('Loading read-only shared content…');
  void fetch(`/api/boards/${path[1]}`).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); sharedId = path[1]; sharedRevision = data.revision; readOnly = true; const document = parseBoard(data.document); const pin = location.hash.startsWith('#pin=') ? document.pins.find(p => p.id === location.hash.slice(5)) : undefined; useDocument(pin?.region ? regionBoard(pin, document) : document); if (pin?.region) canvas.fit(); status('Read-only shared board. Stored result objects replay pinned sources; plain text and ink never run tools. Shared image pixels are unverified attachments.'); }).catch(error => status(`Cannot open shared board: ${(error as Error).message}`));
} else if (new URLSearchParams(location.search).get('handoff') === '1') {
  void loadLocal('handoff').then(async saved => { if (saved) { useDocument(saved); await persistNotebook(); status('Lab snapshot transferred locally to the notebook. Older notebook pins retained; no upload.'); } }).catch(error => status((error as Error).message));
}
else if (location.hash.startsWith('#fragment=')) {
  void decodeFragment(location.hash.slice(10)).then(value => { readOnly = true; useDocument(parseBoard(value)); canvas.fit(); status('Read-only self-contained note region. Replays pinned sources locally; no upload. Remix to edit.'); }).catch(error => status(`Cannot reopen region: ${(error as Error).message}`));
}
else if (new URLSearchParams(location.search).get('calculation-handoff') === '1') {
  void loadLocal('calculation-handoff').then(saved => { if (saved) { useDocument(saved); canvas.fit(); status('Versioned calculator result transferred locally. No upload.'); } }).catch(error => status((error as Error).message));
}
