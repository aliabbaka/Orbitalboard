import type { BoardObject, ModelSnapshot } from '../board/types.js';
import { systemFormula } from '../board/formula.js';
import { blobDataURL, download, svgPNG } from '../board/export.js';
import { selectionInput, selectionSignature, selectionSVG, type SelectionInput } from './selection.js';
import { readLocal } from './local.js';
import { correctedReading, KINDS, RECOGNITION_VERSION, validateReading, type Reading } from './schema.js';

interface Access {
  selection(): { documentId: string; objects: BoardObject[]; systems: Record<string, ModelSnapshot>; readOnly: boolean };
  accept(reading: Reading, systemId: string | null, originals: BoardObject[]): void;
  status(message: string): void;
}

export function installRecognition(access: Access): { open(): Promise<void>; selectionChanged(): void } {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('recognition-dialog'), message = el('recognition-status'), content = el<HTMLTextAreaElement>('recognition-text');
  const kind = el<HTMLSelectElement>('recognition-kind'), consent = el<HTMLInputElement>('recognition-consent'), reviewed = el<HTMLInputElement>('recognition-reviewed');
  const remote = el<HTMLButtonElement>('recognize-vision'), accept = el<HTMLButtonElement>('accept-recognition');
  let sequence = 0, signature = '', original: BoardObject[] = [], input: SelectionInput | null = null, image: string | null = null;
  let activeDocument = '', proposed: Reading | null = null, available = false, method = 'manual', started = 0, abort: AbortController | null = null;
  const validSelection = () => {
    const current = access.selection();
    try { return current.documentId === activeDocument && selectionSignature(selectionInput(current.objects)) === signature; } catch { return false; }
  };
  const update = () => {
    remote.disabled = !available || !navigator.onLine || !consent.checked || !image || !validSelection();
    accept.disabled = !reviewed.checked || !validSelection() || kind.value === 'unknown' || access.selection().readOnly;
    el<HTMLSelectElement>('recognition-system').disabled = kind.value !== 'energy-diagram';
    el<HTMLButtonElement>('export-recognition-example').disabled = !el<HTMLInputElement>('recognition-export-consent').checked || !validSelection() || !input;
  };
  const show = (reading: Reading, source: string) => {
    proposed = validateReading(reading); method = source; kind.value = reading.kind; content.value = reading.text; reviewed.checked = false;
    el('recognition-ambiguities').replaceChildren(...reading.ambiguities.map(text => { const p = document.createElement('p'); p.className = 'fine'; p.textContent = text; return p; }));
    el('recognition-score').textContent = `${source} · unverified input · reading score ${reading.confidence.toFixed(2)} (uncalibrated, NOT correctness probability)`;
    message.textContent = reading.kind === 'unknown' ? 'No supported interpretation. Correct/type it manually; no solver was called.' : 'Read as shown. Review/correct the interpretation, acknowledge it, then add input. Solving requires a separate action.'; update();
  };
  kind.replaceChildren(...KINDS.map(value => { const option = document.createElement('option'); option.value = value; option.textContent = value.replaceAll('-', ' '); return option; }));
  const loadStatus = async (ticket: number) => {
    available = false;
    if (!navigator.onLine) { el('recognition-service').textContent = 'Offline: local shape helper/manual typing only. Nothing will be uploaded.'; update(); return; }
    try { const response = await fetch('/api/recognition/status', { cache: 'no-store' }), data = await response.json(); if (ticket !== sequence) return;
      available = data.available === true; el('recognition-service').textContent = available ? `${data.provider} / ${data.model}: selected PNG only. Live handwriting accuracy has not yet passed the real-writer release benchmark.` : 'Vision not configured. Set separate RECOGNITION_PROVIDER / MODEL / API_KEY on the server. The text tutor model is not assumed to read images.';
    } catch { el('recognition-service').textContent = 'Vision backend unavailable. Local shapes and manual correction still work.'; } update();
  };
  const open = async () => {
    const current = access.selection(); if (current.readOnly) throw new Error('Remix the board before adding recognized input.');
    input = selectionInput(current.objects); signature = selectionSignature(input); activeDocument = current.documentId; original = structuredClone(current.objects);
    abort?.abort(); const ticket = ++sequence; image = null; proposed = null; consent.checked = false; reviewed.checked = false; el<HTMLInputElement>('recognition-export-consent').checked = false;
    kind.value = 'unknown'; content.value = ''; el('recognition-score').textContent = 'Unverified input proposal · nothing computed'; el('recognition-ambiguities').replaceChildren();
    const picker = el<HTMLSelectElement>('recognition-system'); picker.replaceChildren();
    const none = document.createElement('option'); none.value = ''; none.textContent = 'Keep as typed input (no reference yet)'; picker.append(none);
    for (const [id, snapshot] of Object.entries(current.systems)) { const option = document.createElement('option'); option.value = id; option.textContent = `${systemFormula(snapshot.state)} · ${id.slice(0, 6)}`; picker.append(option); }
    dialog.showModal(); message.textContent = 'Preparing only the selected input crop…'; update();
    const local = readLocal(input); if (local) show(local, 'local geometric/typed proposal');
    else { message.textContent = 'No conservative local reading. Use vision with explicit preview/upload consent, or type a correction. Ink stays unchanged.'; }
    const blob = await svgPNG(selectionSVG(input)); if (ticket !== sequence || !validSelection()) return;
    image = await blobDataURL(blob); el<HTMLImageElement>('recognition-preview').src = image; update(); void loadStatus(ticket);
  };
  remote.onclick = async () => {
    if (!image || remote.disabled) return; const ticket = ++sequence; abort?.abort(); abort = new AbortController(); started = performance.now();
    remote.disabled = true; reviewed.checked = false; accept.disabled = true; message.textContent = 'Reading selected pixels only. No calculations/tools are permitted. A slow provider is not a measured latency pass.';
    try {
      const response = await fetch('/api/recognition/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ image, hint: el<HTMLSelectElement>('recognition-hint').value, consent: true }) });
      const data = await response.json(); if (ticket !== sequence || !validSelection()) return;
      if (!response.ok) throw new Error(data.error || 'Vision recognition unavailable.');
      show(validateReading(data.reading), `${data.provider}/${data.model}${data.cacheHit ? ' · cached' : ''}`);
      message.textContent += ` Request elapsed ${(performance.now() - started).toFixed(0)} ms; this single value is not p95 accuracy/latency evidence.`;
    } catch (error) { if (ticket !== sequence || (error as Error).name === 'AbortError') return; message.textContent = `Reading not accepted: ${(error as Error).message}. Type/correct instead; no result was computed.`; }
    finally { if (ticket === sequence) update(); }
  };
  for (const target of [kind, content]) target.addEventListener('input', () => { reviewed.checked = false; update(); });
  for (const target of [consent, reviewed, el('recognition-system'), el('recognition-export-consent')]) target.addEventListener('change', update);
  accept.onclick = () => {
    try {
      if (!reviewed.checked || !validSelection() || access.selection().readOnly) throw new Error('The original selection changed or was not reviewed. Read the current selection again.');
      const corrected = correctedReading(kind.value as Reading['kind'], content.value, proposed?.confidence ?? 1);
      if (corrected.kind === 'unknown') throw new Error('Unknown readings cannot be dispatched. Type a supported input instead.');
      access.accept(corrected, el<HTMLSelectElement>('recognition-system').value || null, original); dialog.close();
    } catch (error) { message.textContent = `Input rejected: ${(error as Error).message}`; }
  };
  el<HTMLButtonElement>('export-recognition-example').onclick = () => {
    try {
      if (!el<HTMLInputElement>('recognition-export-consent').checked || !input || !validSelection()) throw new Error('Explicit local benchmark-export consent is required.');
      const corrected = correctedReading(kind.value as Reading['kind'], content.value);
      download(JSON.stringify({ schemaVersion: 1, grammarVersion: RECOGNITION_VERSION, consent: 'user-requested-local-export',
        origin: 'user-contributed-unverified', writer: el<HTMLInputElement>('recognition-writer').value.trim().slice(0, 80) || null,
        selection: input, image, proposed, corrected, method, date: new Date().toISOString() }, null, 2), 'OrbitalBoard-recognition-example.json', 'application/json');
    } catch (error) { message.textContent = (error as Error).message; }
  };
  dialog.addEventListener('close', () => { abort?.abort(); sequence++; image = null; });
  window.addEventListener('offline', () => { abort?.abort(); available = false; el('recognition-service').textContent = 'Offline: no vision upload; local/manual input remains available.'; update(); });
  return { open, selectionChanged: () => {
    if (dialog.open && signature && !validSelection()) { sequence++; abort?.abort(); reviewed.checked = false; message.textContent = 'Selection changed while reading. This proposal cannot be applied. Close and read the new selection.'; update(); }
  } };
}
