# OrbitalBoard

A chemistry and math learning tool where **solvers compute and AI interprets**. **Stage 0.4** adds a test-gated chemistry/math solver registry, units and precision checks, cited periodic references and offline browser calculators, alongside the whiteboard/notebook and flagship orbital lab.

The supplied October 9, 2026 plan (v2.2) is the product direction. Its `eht_engine.py` prototype was unavailable, so this is a new implementation, **not a verified port** of the reported prototype.

## Run

Requires Node.js 22+, npm and Python 3.12 or 3.13. The numerical engine has no runtime dependencies. The viewer uses locally served, pinned three.js; TypeScript compiles native modules without a framework or bundler.

```sh
npm ci --ignore-scripts
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm start
```

Open **http://127.0.0.1:5001/tools** for verified calculators, **/board** for the whiteboard, or **/** for the orbital lab.

**Tools:** select a tested method, check quantity units/assumptions, then Compute. Results show source-backed values, raw JSON, steps and limitations. Add a result to the board or select a typed equation/formula directly on the board. Calculus is deliberately bounded (elementary derivatives, polynomial-only integrals), not a universal CAS. Unsupported/ambiguous/ionic cases are refused rather than guessed.

**Offline:** after an online visit, wait for **Offline assets ready**. Calculators, periodic data, the board and orbital worker can then reload without connection. AI and server sharing require a connection. API/user data and failed writes are never put into the asset cache or queued. Save local work explicitly.

**Board:** choose Text/formula, click the board, type `NH3`, then select it and choose **3D model**, **Orbitals** or **Answer**. Writing alone does not solve. Pen strokes remain ink; handwriting recognition is later. System builder accepts presets, XYZ and freely editable atoms. A formula without a known template is not assigned a guessed geometry.

**Lab:** choose a preset/XYZ, then Solve. Drag to orbit, enable Move atoms to drag them, or Place atoms to free-build in the camera-target plane. Coordinate fields provide the keyboard/precise alternative. Pin snapshot opens/transfers into the local notebook; Download model offers GLB, OBJ, PLY, gated STL, cube and XYZ. Live updates run only after the explicit first solve.

Do not double-click `web/index.html` or `web/board.html`: modules and workers must be served over HTTP. `npm start` builds and starts the local Flask server; `PORT=5002 npm start` chooses another port.

### Save, share and export

- **Save locally** persists the board in this browser's IndexedDB. Reloading starts a fresh unsaved board; use **Restore local** explicitly. Pinning explicitly saves the notebook only, not unrelated draft ink.
- **Save/share** uploads only when pressed. Links are `/b/<random-id>` and read-only by default. Owner tokens stay in the saving browser, never in public URLs, QR codes or board JSON. **Owner edit** enables local editing; publishing still needs Save shared board. **Remix** makes a separate local copy.
- Shared boards live in ignored `var/boards.sqlite3`, or `BOARD_DB_PATH`. They persist across server restarts, until owner/operator deletion. Use a persistent `/app/var` volume for containers. This is local SQLite storage, not an account/cloud-sync service.
- Sharing omits history/erased content by default and prunes unused sources/images. Explicitly including history may reveal erased content; the dialog says so. Local drafts remain intact on failed saves/conflicts.
- Pins capture both theme variants, source versions and exact model/camera or board-region state. Reopen links replay frozen sources; old/unavailable versions are rejected, never silently upgraded.
- Export PNG, SVG, full JSON, clipboard image/text/Markdown/link, Markdown+PNG ZIP bundles, or print/Save as PDF. ZIP uses standard relative PNG paths for note apps that reject inline image data URLs. Static image pixels are attachments, not independent proof of their scientific contents; reopen the source for verified numbers.
- Loopback links work on this machine only. Cross-device links require hosting the app. No image has been deployed/published by this work.

### Tests and inspection

```sh
npm test
npm run test:backend
npx playwright install chromium
npm run test:browser
npm run demo
npm run validation-report
npm run benchmark
.venv/bin/python -m pip install -r scripts/requirements-tier2-oracle.txt
.venv/bin/python scripts/check_tier2_oracle.py
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

Inputs use stable atom IDs, explicit `angstrom` or `bohr` units, optional integer `charge`, optional `multiplicity`, and optional Wolfsberg–Helmholz `k`. Geometry is arbitrary; named molecules are only validation cases. Templates are illustrative starting inputs, not inferred unique structures or optimized geometries.

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
- Custom SVG whiteboard, rectangle/Shift selection, semantic pen/eraser/text, explicit action bar, structured diagram comparison and content undo/redo/replay.
- Local notebook with frozen snapshots, editable notes/tags, search/reorder and explicit AI-caption acceptance (always unverified).
- Validated board sharing, separate hashed owner tokens, optimistic revision checks and owner-only deletion.
- Source-linked image/vector/Markdown/PDF/JSON exports and six 3D/chemistry download formats with reader/manifold checks.
- 21 versioned Tier 2 calculators, checked chemistry/math grammar, explicit dimensions and display precision.
- 118 cited periodic reference elements, standard-weight gates, neutral configuration cross-checks and content-hashed offline asset caching.

**Enabled:** H, He, C, N, O, F, with documented model limits. **Sourced but disabled:** Li, Be, B, Ne pending chemical reference checks. Transition metals and d orbitals are unsupported. The 30-atom safety cap is not a 16 ms performance guarantee; large systems explicitly warn and should run in the worker.

## Read next

- [Methods, definitions and limitations](docs/methods.md)
- [Using the lab and its architecture](docs/lab.md)
- [Board, notes, sharing and export contract](docs/board.md)
- [Tier 2 solver scope, data and offline contract](docs/solvers.md)
- [Measured validation](docs/validation.md)
- [CircuitLab code audit](docs/circuitlab-audit.md)
- [Roadmap and defect status](docs/roadmap.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

The next planned milestone is **Stage 0.5: Ink recognition on selection**. Full tool-calling tutoring, broader unsupported chemistry/calculus, curriculum/mastery, accounts and public-launch hardening remain later stages.
