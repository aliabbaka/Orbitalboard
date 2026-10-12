import { solve } from './engine/eht.js';
import { scanAngle, type AngleScan } from './engine/scan.js';
import type { SystemState } from './engine/types.js';

type Request =
  | { id: string; action: 'solve'; state: SystemState }
  | { id: string; action: 'scan-angle'; state: SystemState; options: AngleScan };

/** No work runs on import. The future board sends a request only after an explicit student action. */
const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (value: unknown) => void;
};
worker.onmessage = event => {
  const request = event.data;
  const id = typeof request?.id === 'string' ? request.id : null;
  try {
    if (!id) throw new Error('Worker request requires a nonempty string id.');
    let result: unknown;
    if (request.action === 'solve') result = solve(request.state);
    else if (request.action === 'scan-angle') result = scanAngle(request.state, request.options);
    else throw new Error('Unknown worker action.');
    worker.postMessage({ id, ok: true, result });
  } catch (error) {
    worker.postMessage({ id, ok: false, error: error instanceof Error ? error.message : 'Invalid engine request.' });
  }
};
