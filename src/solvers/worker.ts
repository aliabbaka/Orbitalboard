import { runCalculation } from './registry.js';
import type { Calculation } from './types.js';
const worker = globalThis as unknown as { onmessage: ((event: MessageEvent<{ id: string; calculation: Calculation }>) => void) | null; postMessage(data: unknown): void };
worker.onmessage = ({ data }) => {
  try { if (!data || typeof data.id !== 'string' || data.id.length > 100) throw new Error('Invalid calculator request.'); worker.postMessage({ id: data.id, ok: true, result: runCalculation(data.calculation) }); }
  catch (error) { worker.postMessage({ id: data?.id ?? null, ok: false, error: error instanceof Error ? error.message : 'Invalid calculator input.' }); }
};
