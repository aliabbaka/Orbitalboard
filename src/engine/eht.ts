import { DEFAULT_K, PARAMETER_VERSION, SOURCES, requireVerifiedElement } from '../data/parameters.js';
import { buildBasis, overlapMatrix } from './basis.js';
import { dot, generalizedEigen, matVec, zeros } from './linalg.js';
import { DEGENERACY_TOLERANCE_EV, fillElectrons } from './occupation.js';
import { linearAxis, orbitalSymmetry } from './symmetry.js';
import { validateState } from './validation.js';
import type { BasisFunction, Derived, Matrix, Orbital, Solver, SystemState, Warning } from './types.js';

export const SOLVER_VERSION = '0.1.0';

export function buildHamiltonian(basis: readonly BasisFunction[], overlap: Matrix, k: number): Matrix {
  return basis.map((ao, i) => basis.map((other, j) =>
    i === j ? ao.energyEV : k * overlap[i][j] * (ao.energyEV + other.energyEV) / 2));
}

/** State in, derived values out. No network, DOM, random numbers, clock or input mutation. */
export function solve(state: SystemState): Derived {
  validateState(state);
  const electronCount = state.atoms.reduce((sum, atom) => sum + requireVerifiedElement(atom.element).valenceElectrons, 0) - (state.charge ?? 0);
  const basis = buildBasis(state);
  const overlap = overlapMatrix(basis);
  const hamiltonianEV = buildHamiltonian(basis, overlap, state.k ?? DEFAULT_K);
  const eigen = generalizedEigen(hamiltonianEV, overlap);
  const filled = fillElectrons(eigen.energies, electronCount, state.multiplicity);
  const occupied = filled.occupations.flatMap((o, i) => o.count > 0 ? [i] : []);
  const available = filled.occupations.flatMap((o, i) => o.count < 2 ? [i] : []);
  const homoEnergy = occupied.length ? eigen.energies[occupied.at(-1)!] : null;
  const lumoEnergy = available.length ? eigen.energies[available[0]] : null;
  const homoIndices = occupied.filter(i => homoEnergy !== null && Math.abs(eigen.energies[i] - homoEnergy) <= DEGENERACY_TOLERANCE_EV);
  const lumoIndices = available.filter(i => lumoEnergy !== null && Math.abs(eigen.energies[i] - lumoEnergy) <= DEGENERACY_TOLERANCE_EV);
  const somoIndices = filled.occupations.flatMap((o, i) => o.count === 1 ? [i] : []);
  const bondPopulations = zeros(state.atoms.length);
  let maxEigenResidualEV = 0, maxOrthonormalityError = 0;
  const columns = eigen.energies.map((_, i) => eigen.coefficients.map(row => row[i]));
  const homonuclearDiatomic = state.atoms.length === 2 && state.atoms[0].element === state.atoms[1].element;
  const orbitals: Orbital[] = eigen.energies.map((energyEV, index) => {
    const coefficients = columns[index];
    const amplitudes = eigen.lowdinAmplitudes.map(row => row[index]);
    const byAO = amplitudes.map(x => 100 * x * x);
    const byAtom = state.atoms.map((atom, a) => ({ atomId: atom.id, percent: basis.reduce((sum, ao, i) => sum + (ao.atomIndex === a ? byAO[i] : 0), 0) }));
    let overlapPopulation = 0;
    for (let i = 0; i < basis.length; i++) for (let j = 0; j < i; j++) {
      const a = basis[i].atomIndex, b = basis[j].atomIndex;
      if (a === b) continue;
      const value = 2 * coefficients[i] * coefficients[j] * overlap[i][j];
      overlapPopulation += value;
      bondPopulations[a][b] += filled.occupations[index].count * value;
      bondPopulations[b][a] += filled.occupations[index].count * value;
    }
    const symmetry = orbitalSymmetry(state, basis, coefficients, amplitudes, overlap);
    const symmetryCharacter = homonuclearDiatomic && symmetry.kind && symmetry.parity;
    // For an s/p homonuclear diatomic, σg and πu correlate with bonding parents;
    // σu and πg correlate with antibonding parents. s–p mixing can reverse overlap
    // population sign, so that sign alone cannot reproduce the textbook MO count.
    const character = symmetryCharacter
      ? ((symmetry.kind === 'sigma' && symmetry.parity === 'g') || (symmetry.kind === 'pi' && symmetry.parity === 'u') ? 'bonding' : 'antibonding')
      : overlapPopulation > 1e-7 ? 'bonding' : overlapPopulation < -1e-7 ? 'antibonding' : 'nonbonding';
    const characterMethod = symmetryCharacter ? 'homonuclear-diatomic-symmetry' : 'overlap-population-sign';
    const symbol = symmetry.kind === 'sigma' ? 'σ' : symmetry.kind === 'pi' ? 'π' : `MO ${index + 1}`;
    const label = `${symbol}${symmetry.parity ? `_${symmetry.parity}` : ''}${character === 'antibonding' ? '*' : ''}`;
    const hc = matVec(hamiltonianEV, coefficients), sc = matVec(overlap, coefficients);
    for (let i = 0; i < hc.length; i++) maxEigenResidualEV = Math.max(maxEigenResidualEV, Math.abs(hc[i] - energyEV * sc[i]));
    for (let j = 0; j <= index; j++) maxOrthonormalityError = Math.max(maxOrthonormalityError, Math.abs(dot(columns[j], sc) - (j === index ? 1 : 0)));
    return {
      index, energyEV, coefficients, occupation: filled.occupations[index],
      degeneracy: filled.groups.find(group => group.indices.includes(index))!.indices.length,
      label, symmetry, composition: { method: 'lowdin-squared-amplitudes', byAO, byAtom },
      character, characterMethod, overlapPopulation, homo: homoIndices.includes(index), lumo: lumoIndices.includes(index),
    };
  });
  if (maxEigenResidualEV > 1e-6 || maxOrthonormalityError > 1e-7) throw new Error('Eigenproblem failed its residual or normalization check.');
  const textbookBondOrder = homonuclearDiatomic && orbitals.every(o => o.characterMethod === 'homonuclear-diatomic-symmetry') ? orbitals.reduce((sum, orbital) =>
    sum + orbital.occupation.count * (orbital.character === 'bonding' ? 1 : orbital.character === 'antibonding' ? -1 : 0) / 2, 0) : null;
  const bondOverlapPopulations = state.atoms.flatMap((a, i) => state.atoms.slice(i + 1).map((b, j) => ({
    atomIds: [a.id, b.id] as const, value: bondPopulations[i][i + j + 1],
  })));
  const warnings: Warning[] = [
    { code: 'D5', message: 'The orbital-energy sum excludes nuclear repulsion and electron–electron energy. It is not a total energy, binding energy or a bond-length optimization objective.', cites: ['hamiltonianEV', 'orbitalEnergySumEV'] },
    { code: 'GAUSSIAN_EHT', message: 'This educational variant uses STO-3G valence Gaussian overlaps with YAeHMOP on-site energies. It is not the original Slater-orbital YAeHMOP model and is not research-grade.', cites: ['sto3g', 'yaehmop'] },
    { code: 'POPULATION_APPROXIMATION', message: 'Lowdin percentages and overlap populations are basis-dependent diagnostics, not experimental observables. Outside homonuclear diatomics, bonding labels use overlap-population sign, not a rigorous chemical classification.', cites: ['orbitals', 'bondOverlapPopulations'] },
  ];
  if (homonuclearDiatomic) warnings.push({ code: 'DIATOMIC_CONVENTION', message: 'Bonding labels and textbook bond order use the s/p diatomic symmetry convention (σg and πu bonding; σu and πg antibonding). This can differ from overlap-population sign when s–p mixing is strong.', cites: ['openstax-mo', 'textbookBondOrder', 'orbitals'] });
  if (state.k !== undefined && state.k !== DEFAULT_K) warnings.push({ code: 'CUSTOM_PARAMETER', message: 'K is a student-supplied model parameter. The chemical reference checks were performed with the default K, not every possible parameter value.', cites: ['provenance.input.k', 'wh-k'] });
  if (!linearAxis(state)) warnings.push({ code: 'SYMMETRY_UNASSIGNED', message: 'No point-group labels are inferred for atoms or nonlinear geometries. Use orbital index, energy and composition.', cites: ['provenance.input.atoms'] });
  else if (orbitals.some(o => !o.symmetry.kind || (homonuclearDiatomic && !o.symmetry.parity))) warnings.push({ code: 'SYMMETRY_UNRESOLVED', message: 'An accidentally degenerate eigenspace is not fully symmetry-adapted. Unresolved labels and the diatomic bond order are withheld rather than guessed.', cites: ['orbitals', 'textbookBondOrder'] });
  if (basis.length > 32) warnings.push({ code: 'LARGE_SYSTEM', message: 'This system may exceed the single-frame solve budget. Run it in the worker and wait for completion; the atom cap is a safety limit, not a latency guarantee.', cites: ['basis'] });
  if (state.multiplicity !== undefined) warnings.push({ code: 'FIXED_SPIN', message: 'Multiplicity constrains independent-electron filling; this model does not compute exchange energies or compare true spin-state stability.', cites: ['multiplicity', 'provenance.input.multiplicity'] });
  if (somoIndices.length) warnings.push({ code: 'OPEN_SHELL', message: 'HOMO means highest occupied spatial orbital; LUMO means lowest spatial orbital with an available spin slot. They can overlap. The frontier gap is not an excitation energy.', cites: ['homoIndices', 'lumoIndices', 'somoIndices'] });
  if (homonuclearDiatomic && state.atoms[0].element === 'O') {
    const pi = orbitals.filter(o => o.symmetry.kind === 'pi' && o.character === 'bonding');
    const sigma = orbitals.filter(o => o.symmetry.kind === 'sigma' && o.character === 'bonding').at(-1);
    if (sigma && pi.length && pi[0].energyEV < sigma.energyEV) warnings.push({
      code: 'D2', message: 'The model places bonding π below the upper bonding σ level in O2, opposite the textbook ordering. Do not silently reorder the computed levels.', cites: ['openstax-mo', `orbitals.${sigma.index}.energyEV`, `orbitals.${pi[0].index}.energyEV`],
    });
  }
  if (state.atoms.length === 3 && state.atoms.filter(a => a.element === 'C').length === 1 && state.atoms.filter(a => a.element === 'O').length === 2) {
    warnings.push({ code: 'D3_UNVERIFIED', message: 'CO2 photoelectron ordering has not been validated. The missing prototype reported a disagreement; these levels must not be presented as measured spectroscopy.', cites: ['orbitals'] });
  }
  const input: SystemState = {
    atoms: state.atoms.map(a => ({ id: a.id, element: a.element, position: [...a.position] as [number, number, number] })),
    units: state.units,
    ...(state.charge !== undefined ? { charge: state.charge } : {}),
    ...(state.multiplicity !== undefined ? { multiplicity: state.multiplicity } : {}),
    ...(state.k !== undefined ? { k: state.k } : {}),
  };
  return {
    schemaVersion: 1,
    provenance: { trust: 'Computed', solverId: 'eht-sto3g', solverVersion: SOLVER_VERSION, parameterVersion: PARAMETER_VERSION, basis: 'STO-3G valence subset', input, sources: SOURCES, kSource: state.k === undefined ? 'wh-k' : 'user-input' },
    electronCount, basis, overlap, hamiltonianEV, orbitals, degeneracyGroups: filled.groups,
    homoIndices, lumoIndices, somoIndices,
    frontierGapEV: homoEnergy !== null && lumoEnergy !== null ? lumoEnergy - homoEnergy : null,
    unpairedElectrons: filled.unpaired, multiplicity: filled.multiplicity,
    magnetism: filled.unpaired ? 'paramagnetic' : 'diamagnetic',
    orbitalEnergySumEV: orbitals.reduce((sum, orbital) => sum + orbital.energyEV * orbital.occupation.count, 0),
    textbookBondOrder, bondOverlapPopulations,
    diagnostics: { minOverlapEigenvalue: eigen.minOverlapEigenvalue, overlapConditionNumber: eigen.overlapConditionNumber, maxEigenResidualEV, maxOrthonormalityError }, warnings,
  };
}

export const ehtSolver: Solver<SystemState, Derived> = Object.freeze({ id: 'eht-sto3g', version: SOLVER_VERSION, solve });
