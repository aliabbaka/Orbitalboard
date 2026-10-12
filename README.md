# OrbitalBoard

A chemistry and math learning tool where **solvers compute and AI interprets**. The **Stage 0.2 molecular lab** is now usable: a monochrome 3D viewer, energy ladder, geometry/electron controls, matrices, scans and reality checks, built on the validated Stage 0.1 engine. The whiteboard and notebook are the next stage.

The supplied October 9, 2026 plan (v2.2) is the product direction. Its `eht_engine.py` prototype was unavailable, so this is a new implementation, **not a verified port** of the reported prototype.

## Run

Requires Node.js 22+, npm and Python 3.12 or 3.13. The numerical engine has no runtime dependencies. The viewer uses locally served, pinned three.js; TypeScript compiles native modules without a framework or bundler.

```sh
npm ci --ignore-scripts
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm start
```

Open **http://127.0.0.1:5001**. Pick a preset or load XYZ, then **Solve**. Drag to orbit, or enable **Move atoms** to change coordinates. Keyboard coordinate fields, charge/spin controls, bond-distance and angle controls offer the same input path. Computed levels and surfaces update only after that explicit first solve; loading a new system resets permission. Turn off live updates to require another Solve for each change.

Do not double-click `web/index.html`: modules and workers must be served over HTTP. `npm start` builds and starts the local Flask server; `PORT=5002 npm start` chooses another port. This is a lab, not yet a freehand whiteboard.

### Tests and inspection

```sh
npm test
npm run test:backend
npx playwright install chromium
npm run test:browser
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

The worker also accepts `action: 'scan-angle'` with `scanAngle()` options and `action: 'sample-orbital'` with an orbital index and capped grid resolution. The lab ignores stale responses and coalesces live solve requests. Sampling uses a separate worker so a field does not queue ahead of interactive solves. Browser integration is exercised by Playwright.

### Optional AI bridge

The lab is fully usable without a key. To enable the read-only Explain button, copy `backend/.env.example` to a **root `.env`** and set `GROQ_API_KEY`, or provide it as a server environment variable. `npm start` loads the root `.env`; gunicorn/container deployments use environment secrets. Never put the key in a browser file, and do not commit `.env`.

The Flask bridge re-solves the supplied geometry with the same Node engine and **ignores client-supplied derived values**. It requests a schema-limited, cited explanation and releases it only after a numeric membership/rounding check. Prose remains **Explained by AI · unverified**. No tool calling or state changes exist yet. Provider responses are deliberately buffered, not streamed before checking. Real-provider availability/quality has not been tested with a paid key; tests use mocked responses. See [lab architecture and limits](docs/lab.md).

### Container scaffold

`Dockerfile` provides a local build/deployment starting point with Node for the solver and gunicorn for Flask. No image has been published and no remote deployment has been made. A production launch still requires the planned security review and infrastructure-level rate limiting; the in-memory local tutor limiter is not a distributed abuse-prevention system.

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
- Dark/light, monochrome-safe 3D orbital surfaces and grid-sampled density clouds.
- Presets/XYZ, live what-if controls, computed energy ladder, matrix inspection, angle charts and source-linked reality checks.
- Responsive lab UI, a server-recomputed optional tutor bridge, CSP and request-size/rate limits.

**Enabled:** H, He, C, N, O, F, with documented model limits. **Sourced but disabled:** Li, Be, B, Ne pending chemical reference checks. Transition metals and d orbitals are unsupported. The 30-atom safety cap is not a 16 ms performance guarantee; large systems explicitly warn and should run in the worker.

## Read next

- [Methods, definitions and limitations](docs/methods.md)
- [Using the lab and its architecture](docs/lab.md)
- [Measured validation](docs/validation.md)
- [CircuitLab code audit](docs/circuitlab-audit.md)
- [Roadmap and defect status](docs/roadmap.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

The next planned milestone is **Stage 0.3: Board and Notebook**. Accounts, sharing, freehand ink, model downloads, broad chemistry/math calculators and the full tool-calling tutor are not implemented yet.
