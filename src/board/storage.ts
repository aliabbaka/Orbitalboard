import { parseBoard } from './schema.js';
import type { BoardDocument } from './types.js';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('orbitalboard-documents', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('documents'); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function saveLocal(doc: BoardDocument, key = 'board'): Promise<void> {
  const checked = parseBoard(doc), db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('documents', 'readwrite'); tx.objectStore('documents').put(checked, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
export async function loadLocal(key = 'board'): Promise<BoardDocument | null> {
  const db = await database();
  try { const value = await new Promise<unknown>((resolve, reject) => { const request = db.transaction('documents', 'readonly').objectStore('documents').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); return value ? parseBoard(value) : null; }
  finally { db.close(); }
}
