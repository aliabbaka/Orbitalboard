# Stage 0.2 — molecular lab

## What the student can do

1. Load an illustrative preset or strict XYZ coordinates. Only input geometry is shown; no solver or AI call runs on load.
2. Press **Solve**. The browser worker produces the existing versioned EHT result. The HOMO is selected by default.
3. Click levels or HOMO/LUMO; see computed occupation arrows, atomic composition and energy. For open shells, the two frontier sets can overlap, as explained by the warning.
4. Orbit/zoom, drag atoms with **Move atoms**, or use equivalent coordinate, distance and angle inputs. The distance and isovalue sliders use logarithmic mappings, not arbitrary numerical shortcuts.
5. Inspect S or H, click any displayed cell for its raw value/source path, or copy the complete solved state. Large matrix views show the first 32 AOs, explicitly; the JSON retains all entries.
6. Explicitly request an angle scan. Subsequent authorized live edits update the scan after a short debounce. Curves are energy-sorted, not orbital-overlap-tracked. The reported minimum is sampled, fixed-radius, and not a total-energy optimization.
7. Read model warnings and cited textbook diatomic comparisons. O2's ordering discrepancy remains visible. No experimental AX2 angles or CO2 photoelectron values have been invented.
8. Optionally request an explanation from the server. It cannot change the system or calculate additional answers. Without a key, the button is explicitly unavailable.

## State and workers

`src/lab/app.ts` owns draft inputs and a revision-tagged solved state. A new system resets solve authorization. After an explicit solve, live edits are opt-in through the visible checkbox; stale results are labeled, stale surfaces are removed, and dependent actions are disabled until the matching result arrives. The loop permits one live solve in flight and coalesces newer revisions. Old solve, scan, surface and tutor responses are ignored.

`src/lab/model.ts` contains pure control geometry and log mappings. Preset coordinates exactly match the developer-chosen Stage 0.1 fixtures. They are **inputs**, not optimized or looked-up experimental structures. A moved atom does not implicitly move a fragment, and proximity connectors are drawing heuristics, not computed bond assignments.

`src/engine/field.ts` evaluates the solved Gaussian wavefunction on a capped 16–40-per-axis cube. Separable primitive tables avoid repeated exponential work. A dedicated worker samples the field; the main-thread viewer extracts marching-cubes meshes using pinned three.js. Positive and negative phase meshes are separate, named groups; positive phase is solid and negative phase is wireframe, with sign markers. An overall orbital sign is arbitrary, so only relative phase has physical meaning.

The density cloud uses deterministic grid-point rejection sampling with probability proportional to `|ψ|²`. It is a discretized visualization, not a normalized electron-density calculation or a new physical observable. Filled/hollow point glyphs preserve sign without color. Isovalue affects surfaces only; it is disabled for cloud/molecule modes. Grid-boundary warnings are shown when a requested surface may be clipped. Spread-out systems beyond the field's size cap keep their molecules/levels but report the field unavailable.

## Theme, accessibility and graceful degradation

All UI tokens and 3D materials are grayscale. The theme follows the OS on first use and is remembered locally; storing a theme does not save a board or transmit analytics. Orbital phase never depends on hue. Labels, arrows, signs, line styles and text carry meaning.

Every drag input has keyboard fields, tabs support arrow/Home/End keys, outputs have trust labels and status regions, and the selected orbital has a text alternative. A missing WebGL renderer leaves the numerical views usable. Responsive desktop/mobile layouts and theme contrast are browser-tested. This is not yet a complete WCAG/device/pen certification; real low-power hardware and assistive-technology testing are still required.

## Flask bridge

- `GET /` and local assets serve the lab with a nonce-protected import map. No CDN or broad CORS is used.
- `GET /api/health` exposes readiness and whether an optional tutor key is configured, never the key.
- `POST /api/tutor/context` re-solves `state` through the Node CLI and builds bounded, raw numerical facts for the selected orbital.
- `POST /api/tutor/explain` additionally calls the Groq text model (default `openai/gpt-oss-120b`) and checks the whole response before returning it. This is intentionally **not unchecked token streaming**.

The CLI accepts JSON data only, uses no shell interpolation and has input and execution limits. The backend never accepts client eigenvalues as truth. The optional explanation schema has only text segments and fact citations, not model-executable tools. Numeric checks bind decimal/scientific values to explicitly cited facts with rounding tolerance; they are not proof of explanation correctness, units, semantics, complete injection resistance or pedagogical quality. AI prose always stays unverified. Those deeper evaluations and provider tool schemas belong to Stage 0.6.

The local server rejects cross-origin tutor requests, caps bodies at 64 KiB and limits requests per direct client address. CSP restricts scripts/workers/connections to the app; styles permit dynamic inline style properties for plotted widths. No boards, questions or ink are persisted. The limiter is in-memory and direct-IP-based, not trusted-forwarded-IP-aware or distributed. Public hosting requires a reviewed reverse-proxy/rate-limit configuration; do not treat this as the launch security pass.

## Run and inspect

```sh
npm start
npm test
npm run test:backend
npm run test:browser
```

Playwright starts a separate local server on port 5010 with AI disabled, tests real module workers and WebGL surfaces, and saves dark/light/mobile screenshots to ignored `test-results/`. Unit tests independently compare field samples with direct wavefunction evaluation and verify mesh vertices against the sampled isovalue. CI runs the engine, independent Python oracle, backend and browser tests. A remote CI/deployment result is not implied by the local checks.

Full freehand board tools, undo/history, pinned notes, share links, QR, model exports, accounts and the lesson/mastery system remain future milestones.
