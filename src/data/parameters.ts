import type { Source } from '../engine/types.js';

/** Data are sourced, not reconstructed from the missing Python prototype. */
export const PARAMETER_VERSION = 'sto3g-yaehmop-1.0.0';

export const SOURCES: Readonly<Record<string, Source>> = deepFreeze({
  'sto3g': {
    title: 'PySCF 2.8.0 STO-3G tables (EMSL/Basis Set Exchange); Hehre, Stewart & Pople (1969)',
    url: 'https://github.com/pyscf/pyscf/blob/v2.8.0/pyscf/gto/basis/sto-3g.dat',
    locator: 'H and He S shells; Li–Ne SP valence shells. Core 1s shells are omitted for period 2.',
  },
  'yaehmop': {
    title: 'YAeHMOP extended Hückel atomic parameters',
    url: 'https://github.com/greglandrum/yaehmop/blob/4ded45bb2bb7a2d38d2527c991debce9226a9066/tightbind/eht_parms.dat',
    locator: 'H–Ne: AtNo, Nvalen, IP columns. Ne Nvalen is inconsistent between rows; use AtNo minus 1s core.',
  },
  'bohr': {
    title: 'PySCF 2.8.0 NIST constants',
    url: 'https://github.com/pyscf/pyscf/blob/v2.8.0/pyscf/data/nist.py',
    locator: 'BOHR = 0.52917721092 angstrom; retained for exact agreement with the pinned oracle.',
  },
  'wh-k': {
    title: 'YAeHMOP manual: Wolfsberg–Helmholz constant',
    url: 'https://github.com/greglandrum/yaehmop/blob/4ded45bb2bb7a2d38d2527c991debce9226a9066/docs/input_file.tex',
    locator: 'Wolfsberg–Helmholz constant K, default 1.75. This engine uses the unweighted formula.',
  },
  'openstax-mo': {
    title: 'OpenStax Chemistry 2e, section 8.4 Molecular Orbital Theory',
    url: 'https://openstax.org/books/chemistry-2e/pages/8-4-molecular-orbital-theory',
    locator: 'Figures 8.35–8.40; Table 8.3; Example 8.6: bond orders, ordering, Hund filling and O2 spin.',
  },
});

export const BOHR_ANGSTROM = 0.52917721092;
export const DEFAULT_K = 1.75;

export interface ElementParameters {
  readonly atomicNumber: number;
  readonly valenceElectrons: number;
  readonly exponents: readonly number[];
  readonly sCoefficients: readonly number[];
  readonly pCoefficients: readonly number[] | null;
  readonly sEnergyEV: number;
  readonly pEnergyEV: number | null;
  readonly cites: readonly string[];
}

const s1 = [0.15432897, 0.53532814, 0.44463454];
const s2 = [-0.09996723, 0.39951283, 0.70011547];
const p2 = [0.15591627, 0.60768372, 0.39195739];

function element(z: number, exponents: number[], s: number, p: number | null): ElementParameters {
  return {
    atomicNumber: z, valenceElectrons: z <= 2 ? z : z - 2,
    exponents, sCoefficients: z <= 2 ? s1 : s2, pCoefficients: z <= 2 ? null : p2,
    sEnergyEV: s, pEnergyEV: p, cites: ['sto3g', 'yaehmop'],
  };
}

export const ELEMENTS: Readonly<Record<string, ElementParameters>> = deepFreeze({
  H: element(1, [3.42525091, 0.62391373, 0.16885540], -13.6, null),
  He: element(2, [6.36242139, 1.15892300, 0.31364979], -23.4, null),
  Li: element(3, [0.6362897, 0.1478601, 0.0480887], -5.4, -3.5),
  Be: element(4, [1.3148331, 0.3055389, 0.0993707], -10.0, -6.0),
  B: element(5, [2.2369561, 0.5198205, 0.1690618], -15.2, -8.5),
  C: element(6, [2.9412494, 0.6834831, 0.2222899], -21.4, -11.4),
  N: element(7, [3.7804559, 0.8784966, 0.2857144], -26.0, -13.4),
  O: element(8, [5.0331513, 1.1695961, 0.3803890], -32.3, -14.8),
  F: element(9, [6.4648032, 1.5022812, 0.4885885], -40.0, -18.1),
  Ne: element(10, [8.2463151, 1.9162662, 0.6232293], -43.2, -20.0),
});

/** Numerical verification is not a promise of experimental accuracy. See docs/methods.md. */
export const ELEMENT_VERIFICATION = deepFreeze({
  H: { enabled: true, status: 'validated', evidence: ['H2', 'H2O', 'NH3', 'CH4'], reason: 'PySCF/SciPy oracle and H2 reference check.' },
  He: { enabled: true, status: 'validated', evidence: ['He2'], reason: 'PySCF/SciPy oracle and hypothetical He2 bond-order check.' },
  C: { enabled: true, status: 'validated-with-limits', evidence: ['C2', 'CH4', 'CO2'], reason: 'D3 remains an unverified prototype report; CO2 spectroscopy is not validated.' },
  N: { enabled: true, status: 'validated', evidence: ['N2', 'NH3'], reason: 'PySCF/SciPy oracle and N2 reference check.' },
  O: { enabled: true, status: 'validated-with-limits', evidence: ['O2', 'H2O', 'CO2'], reason: 'O2 spin and bond order checked; ordering disagreement is explicitly warned (D2).' },
  F: { enabled: true, status: 'validated', evidence: ['F2'], reason: 'PySCF/SciPy oracle and F2 reference check.' },
  Li: { enabled: false, status: 'pending', evidence: [], reason: 'Sourced parameters only; chemical reference validation is pending.' },
  Be: { enabled: false, status: 'pending', evidence: [], reason: 'Sourced parameters only; chemical reference validation is pending.' },
  B: { enabled: false, status: 'pending', evidence: [], reason: 'Sourced parameters only; chemical reference validation is pending.' },
  Ne: { enabled: false, status: 'pending', evidence: [], reason: 'Sourced parameters only; chemical reference validation is pending.' },
});

export function getElement(symbol: string): ElementParameters {
  const data = Object.hasOwn(ELEMENTS, symbol) ? ELEMENTS[symbol] : undefined;
  if (!data) throw new Error(`Unsupported element ${symbol}. Only sourced H–Ne s/p parameters are available; no d orbitals.`);
  return data;
}

export function requireVerifiedElement(symbol: string): ElementParameters {
  const data = getElement(symbol);
  const flag = ELEMENT_VERIFICATION[symbol as keyof typeof ELEMENT_VERIFICATION];
  if (!flag.enabled) throw new Error(`Element ${symbol} is disabled: ${flag.reason}`);
  return data;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
