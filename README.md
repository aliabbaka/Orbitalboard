# OrbitalBoard

A chemistry and math whiteboard where **solvers compute and AI interprets**. This repository currently contains the **Stage 0.1 engine**, not a whiteboard application or AI tutor.

The supplied October 9, 2026 plan (v2.2) is the product direction. Its `eht_engine.py` prototype was unavailable, so this is a new implementation, **not a verified port** of the reported prototype.

## Run

Requires Node.js 22+ and npm. The browser-facing engine has **no runtime dependencies**; TypeScript is the only development dependency.

```sh
npm ci --ignore-scripts
npm test
npm run demo
npm run validation-report
npm run benchmark
```

`npm run build` emits native JavaScript ES modules and TypeScript declarations into `dist/`. No framework or bundler is required. Nothing is solved simply by importing `dist/index.js`.

### Independently reproduce the numerical checks

Python 3.12 or 3.13 is recommended; PySCF supports Linux and macOS. The committed numerical fixtures let ordinary tests run without Python or a network connection.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements-oracle.txt
.venv/bin/python scripts/generate_oracle.py --check
```

Run the last command **without `--check` only when intentionally regenerating fixtures**, then review the changes. PySCF supplies overlaps; SciPy independently solves the generalized EHT eigenproblem. These are **not PySCF SCF energies**.

## Use the engine

```js
import { solve, parseXYZ } from './dist/index.js';

const state = parseXYZ(`2
Student-chosen O2 geometry, angstrom
O 0 0 -0.605
O 0 0  0.605
`);
const result = solve(state);
console.log(result.unpairedElectrons);       // 2, Hund filling
console.log(result.textbookBondOrder);       // 2, cited diatomic convention
console.log(result.provenance);              // Computed + versions + inputs + sources
console.log(result.warnings);                // Includes the O2 ordering limitation
```

Inputs use stable atom IDs, explicit `angstrom` or `bohr` units, optional integer `charge`, optional `multiplicity`, and optional Wolfsberg–Helmholz `k`. Geometry is arbitrary; named molecules are only validation cases. A formula alone does not determine coordinates, so formula-to-geometry templates belong to a later stage.

### Off-main-thread use

```js
const engine = new Worker(new URL('./dist/worker.js', import.meta.url), { type: 'module' });
engine.onmessage = ({ data }) => {
  if (data.ok) console.log(data.id, data.result);
  else console.error(data.id, data.error);
};
// Send this only after the student chooses an action.
engine.postMessage({ id: 'request-1', action: 'solve', state });
```

The worker also accepts `action: 'scan-angle'` with an `options` object matching `scanAngle()`. A future UI must ignore stale request IDs and coalesce drag updates. Worker-handler behavior is unit-tested; browser integration is still Stage 0.2 work.

## What is implemented

- Analytic, normalized contracted STO-3G **valence** s/p overlaps.
- Sourced, immutable atomic parameter tables and verification flags.
- Unweighted extended-Hückel Hamiltonian, Löwdin orthogonalization and a Jacobi eigensolver.
- Hund/Pauli filling, charge and fixed-spin multiplicity constraints.
- Energy groups, HOMO/LUMO/SOMO sets, spin count, composition and diagnostic populations.
- Linear σ/π and inversion labels where resolved; no guessed point-group labels.
- Textbook bond order **only for resolved homonuclear diatomics**, never a global polyatomic bond order.
- Strict XYZ input, fixed-radius angle scans, wavefunction evaluation and an explicit-request worker.
- Versioned provenance, model warnings, known-answer/property/regression tests and CI configuration.

**Enabled:** H, He, C, N, O, F, with documented model limits. **Sourced but disabled:** Li, Be, B, Ne pending chemical reference checks. Transition metals and d orbitals are unsupported. The 30-atom safety cap is not a 16 ms performance guarantee; large systems explicitly warn and should run in the worker.

## Read next

- [Methods, definitions and limitations](docs/methods.md)
- [Measured validation](docs/validation.md)
- [CircuitLab code audit](docs/circuitlab-audit.md)
- [Roadmap and defect status](docs/roadmap.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

The next planned milestone is **Stage 0.2: the monochrome interactive lab**. No UI, Flask service, account storage, AI calls or deployment has been added in this stage.
