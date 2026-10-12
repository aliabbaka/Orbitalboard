export type Vec3 = readonly [number, number, number];
export type Matrix = number[][];
export type Angular = 's' | 'px' | 'py' | 'pz';

export interface Solver<State, Derived> {
  readonly id: string;
  readonly version: string;
  solve(state: State): Derived;
}

export interface Atom {
  readonly id: string;
  readonly element: string;
  readonly position: Vec3;
}

export interface SystemState {
  readonly atoms: readonly Atom[];
  readonly units: 'angstrom' | 'bohr';
  readonly charge?: number;
  /** If absent, Aufbau + Hund filling chooses the multiplicity. */
  readonly multiplicity?: number;
  readonly k?: number;
}

export interface Source {
  readonly title: string;
  readonly url: string;
  readonly locator: string;
}

export interface Warning {
  readonly code: string;
  readonly message: string;
  readonly cites: readonly string[];
}

export interface Primitive {
  readonly exponent: number;
  /** Coefficient includes primitive and contraction normalization. */
  readonly weight: number;
}

export interface BasisFunction {
  readonly atomIndex: number;
  readonly atomId: string;
  readonly element: string;
  readonly angular: Angular;
  readonly center: Vec3;
  readonly energyEV: number;
  readonly primitives: readonly Primitive[];
  readonly cites: readonly string[];
}

export interface Occupation {
  readonly up: 0 | 1;
  readonly down: 0 | 1;
  readonly count: number;
}

export interface DegeneracyGroup {
  readonly indices: readonly number[];
  readonly energyEV: number;
}

export interface Orbital {
  readonly index: number;
  readonly energyEV: number;
  readonly coefficients: readonly number[];
  readonly occupation: Occupation;
  readonly degeneracy: number;
  readonly label: string;
  readonly symmetry: { readonly kind: 'sigma' | 'pi' | null; readonly parity: 'g' | 'u' | null };
  readonly composition: {
    readonly method: 'lowdin-squared-amplitudes';
    readonly byAO: readonly number[];
    readonly byAtom: readonly { readonly atomId: string; readonly percent: number }[];
  };
  /** Diatomic MO symmetry convention, or overlap-population diagnostic for other systems. */
  readonly character: 'bonding' | 'antibonding' | 'nonbonding';
  readonly characterMethod: 'homonuclear-diatomic-symmetry' | 'overlap-population-sign';
  readonly overlapPopulation: number;
  readonly homo: boolean;
  readonly lumo: boolean;
}

export interface Derived {
  readonly schemaVersion: 1;
  readonly provenance: {
    readonly trust: 'Computed';
    readonly solverId: 'eht-sto3g';
    readonly solverVersion: string;
    readonly parameterVersion: string;
    readonly basis: 'STO-3G valence subset';
    readonly input: SystemState;
    readonly sources: Readonly<Record<string, Source>>;
    readonly kSource: 'wh-k' | 'user-input';
  };
  readonly electronCount: number;
  readonly basis: readonly BasisFunction[];
  readonly overlap: Matrix;
  readonly hamiltonianEV: Matrix;
  readonly orbitals: readonly Orbital[];
  readonly degeneracyGroups: readonly DegeneracyGroup[];
  readonly homoIndices: readonly number[];
  /** Lowest spatial orbitals with an available spin slot; SOMOs may also be LUMOs. */
  readonly lumoIndices: readonly number[];
  readonly somoIndices: readonly number[];
  readonly frontierGapEV: number | null;
  readonly unpairedElectrons: number;
  readonly multiplicity: number;
  readonly magnetism: 'paramagnetic' | 'diamagnetic';
  readonly orbitalEnergySumEV: number;
  /** Only homonuclear diatomics; never a molecule-wide bond order for polyatomics. */
  readonly textbookBondOrder: number | null;
  readonly bondOverlapPopulations: readonly { readonly atomIds: readonly [string, string]; readonly value: number }[];
  readonly diagnostics: {
    readonly minOverlapEigenvalue: number;
    readonly overlapConditionNumber: number;
    readonly maxEigenResidualEV: number;
    readonly maxOrthonormalityError: number;
  };
  readonly warnings: readonly Warning[];
}
