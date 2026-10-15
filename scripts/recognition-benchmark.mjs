import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { SYNTHETIC_CASES } from '../tests/data/recognition-fixtures.mjs';
import { readLocal } from '../dist/recognition/local.js';
import { selectionInput } from '../dist/recognition/selection.js';
import { validateReading, RECOGNITION_VERSION } from '../dist/recognition/schema.js';

const cases = SYNTHETIC_CASES.map(c => ({ ...c, selection: selectionInput(c.objects) }));
const directory = process.argv[2];
if (directory) {
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(await readFile(join(directory, file), 'utf8'));
    if (data.schemaVersion !== 1 || data.grammarVersion !== RECOGNITION_VERSION || data.consent !== 'user-requested-local-export') throw new Error('Only consented, versioned local example exports are accepted.');
    cases.push({ id: file, origin: data.origin, writer: data.writer, selection: data.selection, expected: validateReading(data.corrected).text });
  }
}
const groups = new Map();
for (const sample of cases) {
  const start = performance.now(), reading = readLocal(sample.selection), elapsed = performance.now() - start;
  const key = sample.origin === 'synthetic-geometry' ? 'synthetic-geometry' : 'user-contributed-unverified';
  const group = groups.get(key) ?? { count: 0, recognized: 0, exact: 0, times: [], writers: new Set() };
  group.count++; if (reading) group.recognized++; if (reading?.text === sample.expected) group.exact++; group.times.push(elapsed); if (sample.writer) group.writers.add(sample.writer); groups.set(key, group);
}
const report = Object.fromEntries([...groups].map(([name, group]) => { group.times.sort((a, b) => a - b); return [name, { count: group.count, recognized: group.recognized, exact: group.exact, exactMatchRate: group.exact / group.count, writers: group.writers.size, p95ms: group.times[Math.ceil(.95 * group.count) - 1] }]; }));
console.log(JSON.stringify({ grammarVersion: RECOGNITION_VERSION, evaluatedPath: 'local conservative geometry only; no provider calls/cost', groups: report,
  handwritingReleaseGate: 'PENDING: no qualified 200-example multi-writer vision dataset or agreed live-provider accuracy/latency target. Synthetic cases never satisfy this gate.' }, null, 2));
