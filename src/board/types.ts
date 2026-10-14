import type { SystemState } from '../engine/types.js';
import type { Calculation } from '../solvers/types.js';

export interface ViewState {
  orbital: number;
  mode: 'surface' | 'cloud' | 'molecule';
  isovalue: number;
  resolution: number;
  camera: { position: [number, number, number]; target: [number, number, number] } | null;
}
export interface ModelSnapshot {
  version: 1;
  solverVersion: string;
  parameterVersion: string;
  state: SystemState;
  view: ViewState;
}
export interface Level { orbital: number; arrows: ('up' | 'down')[] }
export interface Placement { id: string; x: number; y: number; width: number; height: number }
export type BoardObject = Placement & (
  | { type: 'text'; text: string }
  | { type: 'ink'; points: [number, number][]; token: 'ink' | 'muted'; strokeWidth: number }
  | { type: 'molecule' | 'orbitals'; systemId: string }
  | { type: 'answer'; formula: string }
  | { type: 'calculation'; calculation: Calculation; display: 'answer' | 'steps' | 'graph' }
  | { type: 'ladder' | 'check'; systemId: string; levels: Level[] }
  | { type: 'scan'; systemId: string; centerId: string; fixedId: string; movingId: string; angles: number[] }
);
export interface Pin {
  id: string;
  title: string;
  caption: string;
  captionSource: 'student' | 'ai-unverified';
  tags: string[];
  date: string;
  alt: string;
  darkMedia: string;
  lightMedia: string;
  systemId: string | null;
  region: BoardObject[] | null;
}
export interface BoardEvent {
  id: string;
  date: string;
  kind: string;
  before: BoardObject[];
  after: BoardObject[];
  pinsBefore: Pin[] | null;
  pinsAfter: Pin[] | null;
}
export interface BoardDocument {
  schemaVersion: 2;
  engines: { eht: string; parameters: string; formula: string; registry: string };
  id: string;
  title: string;
  viewBox: [number, number, number, number];
  objects: BoardObject[];
  systems: Record<string, ModelSnapshot>;
  media: Record<string, string>;
  pins: Pin[];
  events: BoardEvent[];
  cursor: number;
}
