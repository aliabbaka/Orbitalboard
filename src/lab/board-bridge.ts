import type { Derived } from '../engine/types.js';
import type { ModelSnapshot } from '../board/types.js';
import { validateSnapshot } from '../board/schema.js';
import { decodeSnapshot, snapshotLink } from '../board/snapshot.js';
import { blobDataURL, download, svgPNG } from '../board/export.js';
import { boardSVG } from '../board/render.js';
import { emptyBoard } from '../board/schema.js';
import { exportModel, type ModelFormat } from './model-export.js';
import type { MolecularViewer } from './viewer.js';

interface LabAccess {
  current(): { result: Derived; snapshot: ModelSnapshot; viewer: MolecularViewer | null } | null;
  load(snapshot: ModelSnapshot, locked: boolean, defaultHomo?: boolean): void;
  ready(): boolean;
}

export function installBoardBridge(access: LabAccess): void {
  const pin = document.getElementById('pin-lab') as HTMLButtonElement;
  const exportButton = document.getElementById('export-model') as HTMLButtonElement;
  const dialog = document.getElementById('model-export-dialog') as HTMLDialogElement;
  const status = document.getElementById('status')!;
  if (new URLSearchParams(location.search).get('embedded') === '1') document.body.dataset.embedded = 'true';
  const send = (data: unknown) => { if (window.parent !== window) window.parent.postMessage(data, location.origin); };
  async function capture(): Promise<void> {
    const current = access.current(); if (!current || !access.ready()) throw new Error('Wait for the current orbital surface before pinning.');
    let dark: string, light: string;
    if (current.viewer) { dark = current.viewer.capture('dark'); light = current.viewer.capture('light'); }
    else {
      const doc = emptyBoard(), id = crypto.randomUUID(); doc.systems[id] = current.snapshot;
      doc.objects.push({ id: crypto.randomUUID(), type: 'orbitals', systemId: id, x: 20, y: 20, width: 420, height: 390 });
      dark = await blobDataURL(await svgPNG(boardSVG(doc, doc.objects, 'dark'))); light = await blobDataURL(await svgPNG(boardSVG(doc, doc.objects, 'light')));
    }
    if (window.parent !== window) send({ type: 'lab-pin', snapshot: current.snapshot, dark, light });
    else {
      // Handoff remains on the device; no shared board or tutor request is made.
      const { saveLocal } = await import('../board/storage.js'); const doc = emptyBoard(); const id = crypto.randomUUID();
      doc.systems[id] = current.snapshot; const darkId = crypto.randomUUID(), lightId = crypto.randomUUID(); doc.media[darkId] = dark; doc.media[lightId] = light;
      doc.pins.push({ id: crypto.randomUUID(), title: `MO ${current.snapshot.view.orbital + 1}`, caption: '', captionSource: 'student', tags: [], date: new Date().toISOString(), alt: document.getElementById('viewport')!.getAttribute('aria-label') ?? 'Orbital snapshot', darkMedia: darkId, lightMedia: lightId, systemId: id, region: null });
      await saveLocal(doc, 'handoff'); location.href = '/board?handoff=1';
    }
  }
  pin.onclick = () => void capture().catch(error => { status.textContent = (error as Error).message; });
  exportButton.onclick = () => dialog.showModal();
  document.getElementById('model-download')!.onclick = async () => {
    const label = document.getElementById('model-export-status')!;
    try {
      const current = access.current(); if (!current) throw new Error('Solve the current system first.');
      const format = (document.getElementById('model-format') as HTMLSelectElement).value as ModelFormat;
      if (['glb', 'obj', 'ply', 'stl'].includes(format) && !access.ready()) throw new Error('The selected mesh is still being prepared.');
      label.textContent = 'Preparing source-linked model…';
      const blob = await exportModel(format, current.viewer?.exportRoot() ?? null, current.result, current.snapshot, await snapshotLink(current.snapshot), {
        phase: (document.getElementById('export-phase') as HTMLSelectElement).value as 'both' | 'positive' | 'negative',
        includeAtoms: (document.getElementById('export-atoms') as HTMLInputElement).checked,
        millimetersPerAngstrom: Number((document.getElementById('print-scale') as HTMLInputElement).value),
      });
      download(blob, `OrbitalBoard_MO${current.snapshot.view.orbital + 1}.${format}`);
      label.textContent = `Downloaded ${blob.size} bytes. ${format === 'stl' ? 'Edge/manifold check passed; print scale is explicitly enlarged. ' : ''}Versions/source travel in metadata or comments where supported. STL metadata is limited to its header/name.`;
    } catch (error) { label.textContent = (error as Error).message; }
  };
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || window.parent === window) return;
    try {
      if (event.data?.type === 'board-load-model') access.load(validateSnapshot(event.data.snapshot), event.data.readOnly === true, event.data.defaultHomo === true);
      if (event.data?.type === 'board-read-model') { const current = access.current(); if (current) send({ type: 'lab-current', snapshot: current.snapshot }); else throw new Error('Solve the current model before applying it to the board.'); }
    } catch (error) { status.textContent = (error as Error).message; send({ type: 'lab-error', error: (error as Error).message }); }
  });
  send({ type: 'lab-ready' });
  if (location.hash.startsWith('#snapshot=')) {
    void decodeSnapshot(location.hash.slice('#snapshot='.length)).then(snapshot => access.load(snapshot, true)).catch(error => { status.textContent = `Cannot reopen snapshot: ${(error as Error).message}`; });
  }
}
