import test from 'node:test';
import assert from 'node:assert/strict';
import { system } from './helpers.mjs';

test('worker handler stays idle until requested, echoes request IDs and returns validation errors', async () => {
  const previousPost = globalThis.postMessage, previousHandler = globalThis.onmessage;
  const messages = [];
  globalThis.postMessage = message => messages.push(message);
  try {
    await import('../dist/worker.js');
    assert.equal(messages.length, 0, 'importing must not automatically solve');
    globalThis.onmessage({ data: { id: 'first', action: 'solve', state: system('O2') } });
    assert.equal(messages[0].id, 'first');
    assert.equal(messages[0].ok, true);
    assert.equal(messages[0].result.unpairedElectrons, 2);
    globalThis.onmessage({ data: { id: 'bad', action: 'solve', state: {} } });
    assert.equal(messages[1].ok, false);
    assert.equal(messages[1].id, 'bad');
    assert.match(messages[1].error, /atoms/);
    globalThis.onmessage({ data: { id: 'injection', action: 'delete-everything', state: system('O2') } });
    assert.match(messages[2].error, /Unknown worker action/);
    globalThis.onmessage({ data: null });
    assert.equal(messages[3].id, null);
    assert.equal(messages[3].ok, false);
    globalThis.onmessage({ data: { id: 'scan', action: 'scan-angle', state: system('CO2'), options: { centerId: 'c', fixedId: 'o1', movingId: 'o2', anglesDegrees: [120, 180] } } });
    assert.equal(messages[4].ok, true);
    assert.equal(messages[4].result.points.length, 2);
  } finally {
    if (previousPost === undefined) delete globalThis.postMessage; else globalThis.postMessage = previousPost;
    if (previousHandler === undefined) delete globalThis.onmessage; else globalThis.onmessage = previousHandler;
  }
});
