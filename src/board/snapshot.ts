import { SOLVER_VERSION } from '../engine/eht.js';
import { PARAMETER_VERSION } from '../data/parameters.js';
import { validateSnapshot } from './schema.js';
import type { ModelSnapshot } from './types.js';
import type { SystemState } from '../engine/types.js';

export function makeSnapshot(state: SystemState): ModelSnapshot {
  return { version: 1, solverVersion: SOLVER_VERSION, parameterVersion: PARAMETER_VERSION, state: structuredClone(state),
    view: { orbital: 0, mode: 'surface', isovalue: 0.046, resolution: 28, camera: null } };
}
export async function encodeSnapshot(snapshot: ModelSnapshot): Promise<string> {
  validateSnapshot(snapshot);
  const raw = new TextEncoder().encode(JSON.stringify(snapshot));
  let bytes: Uint8Array<ArrayBufferLike> = raw, prefix = 'j';
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer()); prefix = 'z';
  }
  const encoded = btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return `${prefix}.${encoded}`;
}
export async function decodeSnapshot(encoded: string): Promise<ModelSnapshot> {
  if (encoded.length > 12000 || !/^[jz]\.[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Snapshot link is invalid or too large.');
  const bytes = Uint8Array.from(atob(encoded.slice(2).replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  let stream: ReadableStream<Uint8Array> = new Blob([bytes]).stream();
  if (encoded[0] === 'z') stream = stream.pipeThrough(new DecompressionStream('deflate'));
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 30000) { await reader.cancel(); throw new Error('Decompressed snapshot exceeds its cap.'); } chunks.push(value); }
  const raw = new Uint8Array(length); let at = 0; for (const chunk of chunks) { raw.set(chunk, at); at += chunk.length; }
  return validateSnapshot(JSON.parse(new TextDecoder().decode(raw)));
}
export async function snapshotLink(snapshot: ModelSnapshot, origin = location.origin): Promise<string> {
  return `${origin}/#snapshot=${await encodeSnapshot(snapshot)}`;
}
export async function encodeFragment(value: unknown): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(value));
  if (raw.length > 4 * 1024 * 1024) throw new Error('Fragment exceeds the document cap.');
  const bytes = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const encoded = btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (encoded.length > 20000) throw new Error('This region is too large for a self-contained link. Save a shared board for a short pin link.');
  return encoded;
}
export async function decodeFragment(encoded: string): Promise<unknown> {
  if (encoded.length > 20000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Invalid fragment link.');
  const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 4 * 1024 * 1024) { await reader.cancel(); throw new Error('Decompressed fragment exceeds its cap.'); } chunks.push(value); }
  const raw = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(raw));
}
