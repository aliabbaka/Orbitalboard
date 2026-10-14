import type { Source } from '../engine/types.js';

export type InputData = Record<string, unknown>;
export interface Quantity { value: string; unit: string }
export interface Output { key: string; label: string; value: number | string; unit: string; display?: string }
export interface SolverResult {
  trust: 'Computed'; solverId: string; solverVersion: string; dataVersion: string;
  inputs: InputData; outputs: Output[]; steps: string[]; warnings: string[];
  sources: Readonly<Record<string, Source>>;
  graph?: { xLabel: string; yLabel: string; points: { x: number; y: number | null }[] };
}
export interface FieldSpec {
  key: string; label: string; type: 'text' | 'number' | 'quantity' | 'select' | 'json';
  optional?: boolean; choices?: string[]; unit?: string;
}
export interface RegisteredSolver {
  id: string; version: string; title: string; subject: 'Chemistry' | 'Math' | 'Units';
  description: string; scope: string; enabled: boolean; verification: string;
  fields: FieldSpec[]; example: InputData; sources: string[];
  solve(inputs: InputData): Omit<SolverResult, 'trust' | 'solverId' | 'solverVersion' | 'dataVersion' | 'inputs' | 'sources'>;
}
export interface Calculation {
  solverId: string; solverVersion: string; dataVersion: string; inputs: InputData;
}
