import qrcode from 'qrcode-generator';
import { strToU8, zipSync } from 'fflate';
import { escapeXML, resolved } from './render.js';
import { encodeFragment, snapshotLink } from './snapshot.js';
import { emptyBoard } from './schema.js';
import { systemFormula } from './formula.js';
import { runCalculation } from '../solvers/registry.js';
import type { BoardDocument, Pin } from './types.js';

export function download(data: Blob | string, filename: string, type = 'text/plain'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename.replace(/[^A-Za-z0-9._-]/g, '_'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function qrSVG(url: string, cellSize = 4): string {
  if (url.length > 2300) throw new Error('This link is too long for a useful QR code. Save a shared board to get a short link.');
  const qr = qrcode(0, 'M'); qr.addData(url, 'Byte'); qr.make();
  return qr.createSvgTag({ cellSize, margin: cellSize * 4, scalable: true });
}
export async function svgPNG(svg: string, scale = 1): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const ratio = Math.min(scale, 1600 / image.width, 1200 / image.height);
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(image.width * ratio); canvas.height = Math.ceil(image.height * ratio);
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
export function blobDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}
export function portableBoard(doc: BoardDocument, history = false): BoardDocument {
  const copy = structuredClone(doc);
  if (!history) { copy.events = []; copy.cursor = 0; }
  const objects = [...copy.objects, ...copy.events.flatMap(e => [...e.before, ...e.after])];
  const pins = [...copy.pins, ...copy.events.flatMap(e => [...(e.pinsBefore ?? []), ...(e.pinsAfter ?? [])])];
  const regions = pins.flatMap(p => p.region ?? []);
  const systems = new Set([...objects, ...regions].flatMap(o => 'systemId' in o ? [o.systemId] : []).concat(pins.flatMap(p => p.systemId ? [p.systemId] : [])));
  const media = new Set(pins.flatMap(p => [p.darkMedia, p.lightMedia]));
  copy.systems = Object.fromEntries(Object.entries(copy.systems).filter(([id]) => systems.has(id)));
  copy.media = Object.fromEntries(Object.entries(copy.media).filter(([id]) => media.has(id)));
  return copy;
}
export async function pinLink(pin: Pin, doc: BoardDocument, sharedLink: string | null): Promise<string | null> {
  if (pin.region) {
    if (sharedLink) return `${sharedLink}#pin=${pin.id}`;
    try { return `${location.origin}/board#fragment=${await encodeFragment(regionBoard(pin, doc))}`; } catch { return null; }
  }
  if (pin.systemId) return snapshotLink(doc.systems[pin.systemId]);
  return sharedLink;
}
export function regionBoard(pin: Pin, doc: BoardDocument): BoardDocument {
  const copy = emptyBoard(); copy.id = pin.id; copy.engines = structuredClone(doc.engines); copy.title = pin.title; copy.objects = structuredClone(pin.region ?? []);
  const ids = new Set(copy.objects.flatMap(o => 'systemId' in o ? [o.systemId] : [])); copy.systems = Object.fromEntries(Object.entries(doc.systems).filter(([id]) => ids.has(id)));
  return copy;
}
export function pinSource(pin: Pin, doc: BoardDocument): string {
  const calculation = pin.region?.find(o => o.type === 'calculation');
  if (calculation?.type === 'calculation') {
    try { const result = runCalculation(calculation.calculation); return `Computed ${result.solverId} ${result.solverVersion} · ${result.dataVersion} · frozen inputs · ${pin.date.slice(0, 10)}`; }
    catch { return 'Unavailable calculator version/source; no verified numerical claims.'; }
  }
  if (!pin.systemId) return `Student board work · ${pin.date.slice(0, 10)} · board schema ${doc.schemaVersion}`;
  const snapshot = doc.systems[pin.systemId]; let result;
  try { result = resolved(snapshot); } catch { return `Source unavailable · EHT ${snapshot.solverVersion} · ${snapshot.parameterVersion} · no verified numerical claims`; }
  const orbital = result.orbitals[snapshot.view.orbital];
  return `${systemFormula(snapshot.state)} · EHT ${snapshot.solverVersion} · ${snapshot.parameterVersion} · charge ${snapshot.state.charge ?? 0} · K ${snapshot.state.k ?? 1.75} · MO ${orbital.index + 1}: ${orbital.energyEV.toFixed(3)} eV · ${pin.date.slice(0, 10)}`;
}
export async function noteSVG(pin: Pin, doc: BoardDocument, theme: 'dark' | 'light', sharedLink: string | null): Promise<string> {
  const ink = theme === 'dark' ? '#f2f2f2' : '#171717', bg = theme === 'dark' ? '#080808' : '#fff';
  const link = await pinLink(pin, doc, sharedLink); let qr = '', qrMissing = false;
  try {
    if (link) {
      let raw = qrSVG(link), size = Number(/viewBox="0 0 (\d+)/.exec(raw)![1]);
      if (size > 360) { raw = qrSVG(link, 3); size = Number(/viewBox="0 0 (\d+)/.exec(raw)![1]); }
      if (size > 360) throw new Error('Use a short shared link for this large state.');
      // Preserve integer module pixels. Fractional SVG scaling can make otherwise valid codes unreadable.
      qr = `<g transform="translate(${1100 - size - 24} 570)">${raw.replace('<svg ', `<svg x="0" y="0" width="${size}" height="${size}" `)}</g>`;
    }
  } catch { qrMissing = true; }
  const words = pin.caption.replaceAll('\n', ' ').split(' '), rows: string[] = []; let row = '';
  for (const word of words) { if ((row + word).length > 72) { rows.push(row); row = ''; } row += `${word} `; } if (row) rows.push(row);
  const source = pinSource(pin, doc);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="1040" viewBox="0 0 1100 1040"><title>${escapeXML(pin.title)}</title><desc>${escapeXML(pin.alt)}</desc><metadata>${escapeXML(JSON.stringify({ source, link, title: pin.title, caption: pin.caption, region: pin.region ? regionBoard(pin, doc) : null, snapshot: pin.systemId ? doc.systems[pin.systemId] : null, captionSource: pin.captionSource }))}</metadata><rect width="1100" height="1040" fill="${bg}"/><g fill="${ink}" font-family="system-ui,sans-serif"><text x="24" y="38" font-size="22">${escapeXML(pin.title.slice(0, 64))}</text><image href="${doc.media[theme === 'dark' ? pin.darkMedia : pin.lightMedia]}" x="24" y="60" width="1052" height="460" preserveAspectRatio="xMidYMid meet"/><text x="24" y="554" font-size="11">${pin.captionSource === 'ai-unverified' ? 'AI caption · student accepted · still unverified' : 'Student caption'}${rows.length > 6 ? ' · preview; full text in metadata/Markdown' : ''}</text>${rows.slice(0, 6).map((line, i) => `<text x="24" y="${578 + i * 21}" font-size="13">${escapeXML(line)}</text>`).join('')}<text x="24" y="950" font-size="11">${escapeXML(source.slice(0, 145))}</text><text x="24" y="976" font-size="11">Snapshot pixels are attachments. Reopen the pinned state to verify calculated values.</text><text x="24" y="1002" font-size="11">${escapeXML(qrMissing ? 'Large state: link is in metadata/Markdown; share for a short QR.' : link ? 'Reopen link is embedded in SVG metadata and Markdown.' : 'Local note: save a shared board for a live board link.')}</text></g>${qr}</svg>`;
}
function markdownText(text: string): string { return text.replace(/([\\`*_[\]<>])/g, '\\$1'); }
export async function noteMarkdown(pin: Pin, doc: BoardDocument, sharedLink: string | null): Promise<string> {
  const link = await pinLink(pin, doc, sharedLink);
  return `## ${markdownText(pin.title)}\n\n![${markdownText(pin.alt)}](${doc.media[pin.lightMedia]})\n\n${markdownText(pin.caption)}\n\n${pin.captionSource === 'ai-unverified' ? '**AI caption: accepted, still unverified.**\n\n' : ''}${markdownText(pinSource(pin, doc))}\n\n${link ? `[Reopen exact state](${link})\n\n` : ''}Snapshot image is an attachment; verify values by reopening the pinned source.\n`;
}
export async function copyImage(blob: Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard is unavailable. Use Download PNG instead.');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
export async function markdownBundle(pins: Pin[], doc: BoardDocument, sharedLink: string | null): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const sections: string[] = [`# ${markdownText(doc.title)}`];
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i], filename = `images/pin_${i + 1}.png`;
    files[filename] = new Uint8Array(await (await svgPNG(await noteSVG(pin, doc, 'light', sharedLink))).arrayBuffer());
    const inline = await noteMarkdown(pin, doc, sharedLink); sections.push(inline.replace(doc.media[pin.lightMedia], filename));
  }
  files['study-sheet.md'] = strToU8(sections.join('\n\n---\n\n'));
  const source = portableBoard({ ...doc, objects: [], pins, events: [], cursor: 0 });
  files['source-board.json'] = strToU8(JSON.stringify(source, null, 2));
  const bytes = zipSync(files, { level: 6 }); return new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
}
