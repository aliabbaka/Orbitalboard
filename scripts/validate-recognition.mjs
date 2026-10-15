import { validateReading } from '../dist/recognition/schema.js';
let input = '';
try { for await (const chunk of process.stdin) { input += chunk; if (Buffer.byteLength(input) > 65536) throw new Error('Reading exceeds the schema cap.'); }
  console.log(JSON.stringify({ ok: true, reading: validateReading(JSON.parse(input)) }));
} catch (error) { console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Invalid recognition.' })); process.exitCode = 1; }
