import { PRESETS, positionsAngstrom } from '../lab/model.js';
import { ELEMENT_VERIFICATION } from '../data/parameters.js';
import { parseXYZ } from '../engine/xyz.js';
import { normalizeFormula } from './formula.js';
import { makeSnapshot } from './snapshot.js';
import { validateSnapshot } from './schema.js';
import type { ModelSnapshot } from './types.js';
import type { SystemState } from '../engine/types.js';

export function installBuilder(insert: (snapshot: ModelSnapshot) => void): () => void {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = get<HTMLDialogElement>('builder-dialog'), status = get<HTMLElement>('builder-status');
  let state: SystemState = structuredClone(PRESETS.NH3.state);
  const preset = get<HTMLSelectElement>('builder-preset'), element = get<HTMLSelectElement>('builder-element');
  for (const [key, value] of Object.entries(PRESETS)) { const option = document.createElement('option'); option.value = key; option.textContent = value.label; preset.append(option); }
  for (const [key, value] of Object.entries(ELEMENT_VERIFICATION)) { const option = document.createElement('option'); option.value = key; option.textContent = value.enabled ? key : `${key} · pending validation`; option.disabled = !value.enabled; element.append(option); }
  function draw(): void {
    const table = document.createElement('table'), header = document.createElement('tr');
    for (const name of ['Atom', 'Element', 'x Å', 'y Å', 'z Å', '']) { const th = document.createElement('th'); th.textContent = name; header.append(th); } table.append(header);
    state.atoms.forEach((atom, index) => {
      const row = document.createElement('tr'); const id = document.createElement('td'); id.textContent = atom.id; row.append(id);
      const symbol = document.createElement('td'), picker = element.cloneNode(true) as HTMLSelectElement; picker.value = atom.element; picker.setAttribute('aria-label', `Element ${atom.id}`);
      picker.onchange = () => { state = { ...state, atoms: state.atoms.map((a, i) => i === index ? { ...a, element: picker.value } : a) }; }; symbol.append(picker); row.append(symbol);
      for (let axis = 0; axis < 3; axis++) {
        const td = document.createElement('td'), input = document.createElement('input'); input.type = 'number'; input.step = '0.01'; input.value = String(atom.position[axis]); input.setAttribute('aria-label', `${atom.id} ${['x', 'y', 'z'][axis]} angstrom`);
        input.onchange = () => { const position = [...state.atoms[index].position] as [number, number, number]; position[axis] = Number(input.value); state = { ...state, atoms: state.atoms.map((a, i) => i === index ? { ...a, position } : a) }; }; td.append(input); row.append(td);
      }
      const td = document.createElement('td'), remove = document.createElement('button'); remove.textContent = 'Remove'; remove.onclick = () => { state = { ...state, atoms: state.atoms.filter((_, i) => i !== index) }; draw(); }; td.append(remove); row.append(td); table.append(row);
    });
    get<HTMLElement>('builder-atoms').replaceChildren(table);
  }
  function load(next: SystemState): void {
    state = { ...structuredClone(next), units: 'angstrom', atoms: next.atoms.map((a, i) => ({ ...a, position: positionsAngstrom(next)[i] })) };
    get<HTMLInputElement>('builder-charge').value = String(state.charge ?? 0); get<HTMLInputElement>('builder-spin').value = String(state.multiplicity ?? 0); get<HTMLInputElement>('builder-k').value = String(state.k ?? 1.75); draw();
  }
  get('builder-load-preset').onclick = () => load(PRESETS[preset.value].state);
  get('builder-use-formula').onclick = () => {
    const formula = normalizeFormula(get<HTMLInputElement>('builder-formula').value), template = PRESETS[formula];
    if (template) { load(template.state); status.textContent = 'Approximate starting template loaded. Adjust all coordinates freely.'; }
    else status.textContent = 'A formula does not uniquely specify geometry. No structure was guessed: use XYZ or add/edit atoms below.';
  };
  get('builder-load-xyz').onclick = () => { try { load(parseXYZ(get<HTMLTextAreaElement>('builder-xyz').value)); status.textContent = 'XYZ coordinates loaded as inputs; not yet solved.'; } catch (error) { status.textContent = (error as Error).message; } };
  get('builder-add-atom').onclick = () => { if (state.atoms.length >= 30) { status.textContent = '30-atom safety cap reached.'; return; } state = { ...state, atoms: [...state.atoms, { id: `atom-${crypto.randomUUID().slice(0, 8)}`, element: element.value, position: [state.atoms.length * 1.5, 0, 0] }] }; draw(); };
  get('insert-system').onclick = () => {
    try {
      const m = Number(get<HTMLInputElement>('builder-spin').value), { multiplicity: _old, ...base } = state;
      const next = { ...base, charge: Number(get<HTMLInputElement>('builder-charge').value), k: Number(get<HTMLInputElement>('builder-k').value), ...(m ? { multiplicity: m } : {}) };
      insert(validateSnapshot(makeSnapshot(next))); dialog.close();
    } catch (error) { status.textContent = (error as Error).message; }
  };
  return () => { load(state); dialog.showModal(); };
}
