# Stage 0.1 validation

Measured locally on October 11, 2026, using Node v22.9.0 on macOS arm64 and the versions in `scripts/requirements-oracle.txt`. Tests and oracle reproduction were executed, not merely written. The GitHub Actions workflow is configured but has not been run on GitHub from this session.

## Independent numerical evidence

Reproduce using `npm test`, `npm run validation-report`, and `.venv/bin/python scripts/generate_oracle.py --check`.

| Check | Measured result | Acceptance |
| --- | --- | --- |
| PySCF valence overlap matrices, 22 cases | Maximum absolute error `5.551115123125783e-16` | `<= 1e-6` |
| Independent SciPy EHT eigenvalues, 22 cases | Maximum absolute error `9.556799795973347e-13 eV` | `<= 1e-7 eV` |
| Golden fixed-radius angle curves | Six electron counts, 19 angles each, reproduced | Energies and sums within `1e-7 eV` |
| Rigid transformations, SPD overlap, ordered eigenvalues, normalization, deterministic repeats | Pass for the named/mixed property fixtures | Tests enforce each property |
| Sourced basis tables | Exact equality with independently loaded PySCF coefficients/exponents | No missing citations |

Fixtures include H2, hypothetical He2, C2, N2, O2, F2, CO2, H2O, NH3, CH4, a mixed asymmetric system and its rotated copy, plus isolated H–Ne. **Candidate-element numerical coverage does not enable those elements.** Developer-chosen test coordinates are not claimed literature geometries.

## Chemistry checks: do not hide disagreements

Source: OpenStax Chemistry 2e §8.4, recorded in `tests/data/chemistry-references.json`.

| System | Textbook / computed bond order | Textbook / computed unpaired count | Ordering |
| --- | --- | --- | --- |
| H2 | 1 / 1 | 0 / 0 | σ bonding below antibonding |
| He2 (hypothetical) | 0 / 0 | 0 / 0 | Not a prediction of a stable molecule |
| C2 | 2 / 2 | 0 / 0 | π below upper bonding σ: agrees |
| N2 | 3 / 3 | 0 / 0 | π below upper bonding σ: agrees |
| O2 | 2 / 2 | 2 / 2 | π below upper bonding σ: **disagrees**, D2 warning |
| F2 | 1 / 1 | 0 / 0 | upper bonding σ below π: agrees |

Bond order here uses the documented **diatomic MO convention**, not raw overlap-population sign. The tests explicitly demonstrate that distinction for N2. H2O, NH3 and CH4 are independently checked for **numerical** values/invariants, not claimed experimentally validated spectra or geometries.

## Sampled angle minima

CO2-parameter test system, fixed developer-chosen radius, 90° through 180° in 5° steps. This reproduces the plan's sampled AX2 trends in the new model; it is still **not a comparison against the missing Python program** or experiment.

| Valence electrons | Sampled minimum | Gain from linear sample (eV) | Warning |
| --- | --- | --- | --- |
| 14 | 130° | 0.1302354591 | D4, small model gain |
| 16 | 180° | 0 | — |
| 17 | 125° | 1.1900967393 | — |
| 18 | 115° | 3.6504457944 | — |
| 19 | 110° | 3.7708208582 | — |
| 20 | 110° | 3.9102658664 | — |

Every scan discloses D5 and sampled-only minima. Electron count is a charge-adjusted test input, not a claim that these coordinates represent NO2, O3, SO2 or ClO2. Literature angle values from the plan remain unsourced and are not reference lookups in the engine.

## Performance evidence

One local warm run of `npm run benchmark`: 15 warmups, 100 samples per small system, 30 for the large chain. These are Node solver times, not browser render/worker-transfer times and not promises for phones.

| System | Basis functions | Local p95 (ms) |
| --- | --- | --- |
| O2 | 8 | 0.800 |
| CO2 | 12 | 0.964 |
| H2O | 6 | 0.300 |
| NH3 | 7 | 0.419 |
| CH4 | 8 | 0.384 |
| asymmetric mixed system | 17 | 1.520 |
| 30-carbon chain | 120 | **190.550** |

The flagship small cases fit the proposed single-frame budget on this machine. The 30-atom example **does not**. Systems with more than 32 basis functions carry a large-system warning. The worker avoids blocking the main thread; frame-time guarantees, drag coalescing, device-dependent interactive caps and faster large-matrix algorithms remain Stage 0.2 work. No 3D-surface latency is reported because surfaces are not implemented.

## Stage 0.1 gaps at that milestone

- No recovered prototype oracle, no YAeHMOP executable comparison and no PySCF SCF energy comparison.
- No experimental CO2 photoelectron validation or sourced AX2 reference-angle panel.
- No continuous geometry optimization, electron–electron energy, nuclear repulsion or d-orbital support.
- No full point-group solver or symmetry adaptation of accidentally degenerate mixed-symmetry eigenspaces.
- No browser/device/3D rendering or accessibility test yet; the worker unit test exercises the handler, not a real browser worker.
- CI is configured locally, not claimed to have passed remotely.

## Stage 0.2 local evidence — October 11, 2026

The lab now adds real browser/worker/WebGL and backend evidence; the Stage 0.1 snapshot above is retained as historical data, not a statement that browser views are still absent.

- **81 Node tests passed**, including direct-vs-separable wavefunction grids and interpolation checks for both positive/negative marching-cubes meshes.
- **9 Flask/unittest checks passed**: server-side recomputation, rejected client numbers, absent-key behavior, mocked valid/invalid provider responses, numeric/schema gates, cross-origin rejection, local rate limits, body limits and static/CSP behavior.
- **9 Playwright Chromium flows passed**: explicit intent, charge/geometry edits, stale-state protection, matrix inspection, scans, XYZ failures/inert comment text, both themes, keyboard tabs, mobile layout, clouds and measured browser performance.
- Dark/light/mobile screenshots were generated and visually inspected. Screenshots are evidence captures, not a committed pixel-diff baseline. CSS ink/muted text contrast against the panel passes the 4.5:1 check in both themes.
- The independent Python oracle still reproduces **22 cases and six curves**. The numerical engine and parameter versions remain unchanged.
- `npm audit --omit=dev` reported zero known runtime dependency vulnerabilities on this date. No Docker image build/publish or remote CI run is claimed.

One local headless Chromium 156 run on macOS arm64 (12 kernel warmups, 60 timed solves per case):

| System | Browser solve kernel p95 (ms) | One 28³ field sample (ms) |
| --- | --- | --- |
| NH3 | 0.2 | 2.6 |
| CO2 | 0.7 | 0.9 |
| O2 | 0.2 | 1.8 |
| H2O | 0.2 | 0.2 |
| CH4 | 0.2 | 1.7 |

The cold NH3 **worker + mesh creation** path measured **12 ms** in that run. This ends when the CPU mesh is ready; it is not a claim about first GPU paint, network startup or all-device latency. The proposed <16 ms small solve and <200 ms surface-computation targets are met in this local sample. Time thresholds are reported rather than made into flaky machine-specific CI gates. The large-system limitation from Stage 0.1 remains, and low-power device coverage is still open.

Live Groq behavior/quality has **not** been exercised with a paid key; provider tests are mocks. Correct numeric membership is not proof of explanation semantics or units. The public-launch security, full accessibility and instructor/learner evaluation stages remain pending.

## Stage 0.3 local evidence — October 12, 2026

The board/notebook acceptance path was exercised in a real Chromium browser with AI disabled. The Stage 0.3 suite contains **94 Node tests, 13 backend tests and 19 browser flows (126 total)**; rerun the commands in README for current totals.

- Typed content stays unsolved until an action is chosen; semantic ink flips with theme. Content undo/redo and replay preserve source objects without replaying network/download side effects.
- Builder inputs, structured Pauli/diagram checks, local JSON/IndexedDB restoration and unsafe/unavailable-version import rejection are covered.
- A model is solved in the embedded lab, pinned, captioned and reopened from its frozen compressed state; the selected energy, versioned state and read-only controls match. Source links are not reconstructed from rounded DOM readouts.
- PNG and SVG note cards include sources and alt text; Markdown/PNG ZIP bytes and actual browser-produced PDF bytes are checked. Static image pixels remain unverified attachments.
- A note-card PNG's actual QR is decoded independently using jsQR, not inferred from decorative SVG presence. QR modules are rasterized at integer sizes to avoid unreadable fractional scaling.
- Pinning from a new board preserves older local notebook entries. Frozen region links retain their original text after the source is edited.
- Public links return documents without owner tokens. Missing credentials cannot edit/delete; revision conflicts retain the last saved data; SQLite persists across app instances.
- GLB is parsed back by GLTFLoader and retains named phases/version extras. OBJ, PLY and STL are read back by independent loaders; PLY phase scalars, closed/oriented STL edges and print scale are checked. Cube axes/order/values match the screen field; XYZ atom coordinates round-trip.
- Model STL is deliberately restricted to one closed orbital phase without atom/connector intersections; no claim of universal slicer/self-intersection certification is made.
- `npm audit --omit=dev` reports zero known runtime vulnerabilities after updating fflate to 0.8.3. No Docker build, external deployment, paid-provider evaluation or manually tested Blender/VMD/note-app certification is claimed.

Limits and deliberate grammar restrictions are in `docs/board.md`; larger/malformed states fail explicitly instead of inventing results or silently changing solver versions.

## Stage 0.4 local evidence — October 14, 2026

**183 checks passed:** 144 Node tests, 14 backend tests and 25 real Chromium browser flows. TypeScript checks and whitespace checks passed. No remote CI or deployment result is implied.

- All 21 enabled registry entries have version/data pins, citation records and known-answer coverage. The 41 fixed Tier 2 cases cover balancing, masses, limiting/yield, gases, solutions, acid/base, buffers, titration, equilibrium, atomic filling, algebra/calculus/graphs and conversions.
- Extra properties check exact atom conservation, ambiguity rejection, unsupported notation, unit dimensions/absolute temperature, display versus raw values, positive ICE concentrations/log-Q residuals, titration equivalence, graph domain gaps, safe AST parsing and derivative finite differences.
- Neutral H–Kr configurations match independent PubChem facts, including Cr/Cu exceptions. CIAAW/PubChem raw source hashes match generated data. Mass calculations use CIAAW values instead of rounded reference-display masses and reject elements without standard weights.
- Independent SymPy checks passed for 12 numerical fixture cases plus a differentiation identity; the existing PySCF/SciPy oracle still reproduces 22 cases and six angle curves. The EHT solver/parameter versions are unchanged.
- Browser tests confirm explicit compute intent, unit failures, limited integration refusal, cited periodic facts, typed board dispatch, source-backed calculator insertion and schema-1 migration without altering old EHT state.
- An actual browser context is switched offline, then reloads `/tools`, `/board` and the orbital lab. A molar-mass calculation and fresh O2 solve still work. Cache inspection finds no `/api/` or `/b/` entries. AI/server operations remain connection-dependent; no write queue is introduced.
- Workbench/periodic screenshots are saved in ignored `test-results/` and visually inspected. Runtime dependency audit reports zero known vulnerabilities on this date.

The known-answer cases are analytic textbook-law regressions/reference checks, not a claim that all input wording was copied from published questions. Model/domain limits, source-table uncertainty, elementary/polynomial math scope, client cache eviction and untested production/device/provider behavior remain explicit in `docs/solvers.md`.

## Stage 0.5 implementation evidence — October 15, 2026

**222 checks passed:** 172 Node tests, 19 backend tests and 31 Chromium flows. TypeScript and whitespace checks passed. These are software/grammar regressions, not a qualified real-handwriting release.

- Browser tests prove drawing/selection/opening a preview makes no vision call. Sending a crop needs explicit consent. All accepted readings remain unverified inputs; accepting one does not run a solver, and the original ink remains undoable.
- Corrections override uncertain mock readings, invalid grammar does not become a result, stale requests cannot apply after source removal, offline/missing-provider paths retain manual input, and the local geometric diagram proposal uses the real existing comparison solver only after review/action.
- Server tests cover no text-tutor key reuse, same-origin/rate/body/PNG caps, missing consent, forbidden URL/SVG/full-board fields, strict tool/answer/energy/Pauli/grammar rejection, unknown readings and bounded crop-hash caching. Provider responses are mocked; no paid service was called.
- Local benchmark: **24/24 procedural geometric cases**, **zero human writers**. One local run measured **0.87 ms p95** for the narrow geometry helper. This is not glyph OCR accuracy or the proposed online <1.5 s p95 evidence. Synthetic and user-contributed unverified groups are reported separately.
- The opt-in local export and separately gated live benchmark runner are implemented. No examples/crops are persisted to the server or silently included in analytics/exports; a deliberate live benchmark needs an additional upload flag.

**Unpassed gates:** configure/evaluate an actual image-capable model; collect/review ≥200 representative real examples across several writers; agree content-specific exact-match/error/latency targets and meet them. The complete Stage 0.5 accuracy exit criterion is therefore **pending**, even though its selection/confirmation/validation workflow is implemented. See `docs/recognition.md`.
