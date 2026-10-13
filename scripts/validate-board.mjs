import { parseBoard, MAX_BOARD_BYTES } from '../dist/board/schema.js';
import { solve } from '../dist/index.js';
let input = '';
try {
  for await (const chunk of process.stdin) { input += chunk; if (Buffer.byteLength(input) > MAX_BOARD_BYTES + 65536) throw new Error('Board exceeds the 4 MiB limit.'); }
  const document = parseBoard(JSON.parse(input));
  const objects = [...document.objects, ...document.events.flatMap(e => [...e.before, ...e.after]), ...document.pins.flatMap(p => p.region ?? [])];
  const computed = new Set(objects.flatMap(o => ['orbitals', 'check', 'scan'].includes(o.type) ? [o.systemId] : []).concat(document.pins.flatMap(p => p.systemId ? [p.systemId] : [])));
  if (computed.size > 20) throw new Error('A shared board is capped at 20 distinct computed sources. Export separate boards for larger collections.');
  for (const id of computed) solve(document.systems[id].state);
  console.log(JSON.stringify({ ok: true, schemaVersion: document.schemaVersion }));
} catch (error) { console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Invalid board.' })); process.exitCode = 1; }
