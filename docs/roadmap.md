# Roadmap / implementation status

Source: user-supplied OrbitalBoard Technical Plan v2.2, October 9, 2026. The repository includes **Stages 0.1 through 0.4** and **Stage 0.5 implementation with a pending real-handwriting qualification gate**.

## Stage 0.1

- [x] New TypeScript EHT engine with no runtime dependencies.
- [x] Arbitrary explicit geometry and XYZ input, charge, multiplicity and element verification gates.
- [x] Sourced normalized STO-3G valence basis and on-site parameters.
- [x] Hund's-rule filling, Pauli/capacity checks, degeneracy and frontiers.
- [x] Composition, resolved linear labels, documented bond diagnostics and model warnings.
- [x] PySCF overlaps within `1e-6` and independent SciPy generalized eigenpairs.
- [x] At least five non-CO2 validation molecules (H2, He2, C2, N2, O2, F2, H2O, NH3, CH4).
- [x] Rotation, translation, normalization, deterministic output and regression checks.
- [x] Six independent golden angle curves and a small-gain warning.
- [x] Explicit-request worker, local performance measurements, methods/setup docs and CI configuration.

The unavailable Python prototype prevents claiming a faithful port or comparison against its reported AX2/CO2 outputs. Numerical correctness is demonstrated separately from chemical agreement. A separate YAeHMOP execution and experimental polyatomic validation remain open, not hidden behind a "validated" label.

## Defects from the plan

| ID | Current status |
| --- | --- |
| D1 | Fixed in the new engine: degenerate levels fill singly first; O2 has two unpaired electrons. Explicit constrained singlet/triplet filling is also tested. |
| D2 | Reproduced with the new sourced variant. O2 π/σ ordering remains a model limitation with a citation-bearing warning; raw levels are not reordered. |
| D3 | Missing prototype's CO2 photoelectron discrepancy is not independently validated. CO2 carries `D3_UNVERIFIED`; sourced spectroscopy is still needed. |
| D4 | A configurable small sampled-angle-gain warning is implemented. Its threshold is a heuristic, and the scan does not claim experimental equilibrium. |
| D5 | Always disclosed. Output is `orbitalEnergySumEV`, never total energy; bond-length optimization is absent. |
| D6 | New parameters come from pinned source tables, are immutable, and are compared with independent PySCF data. This does not validate the choice of mixing Gaussian overlaps with Slater-model on-site energies. |

## Stage 0.2

- [x] Native-module lab UI without React or a bundler.
- [x] Dark/light monochrome themes, semantic CSS tokens and contrast checks.
- [x] Actual-wavefunction marching-cubes surfaces, probability clouds and orbit/zoom/atom drag.
- [x] Energy ladder, raw matrix inspection, electron/charge/spin controls, log controls, angle scans and live JSON.
- [x] Cited reality checks and model-limit warnings retained.
- [x] Explicit first solve, coalesced live requests and stale-result protection.
- [x] Flask read-only tutor scaffold with server recomputation, schema/numeric gate, CSP and local abuse limits.
- [x] Browser/field/mesh/backend tests and dark/light/mobile screenshot capture.
- [ ] Validate the proposed latency budgets on representative low-power devices, not just this machine.
- [ ] Real-provider tutor evaluation; no paid API key was used in local tests.

The numerical engine remains version **0.1.0**; the app is **0.2.0**. Its formulas/parameters were not silently changed for the UI. See `docs/lab.md` for the read-only, buffered tutor scope and public-launch limitations.

## Stage 0.3

- [x] Custom SVG board, semantic monochrome ink/text, square/Shift selection and explicit select-to-act bar.
- [x] Presets/formula templates, XYZ/free-build atom editing, 3D placement and keyboard alternatives.
- [x] Structured student energy diagrams, Pauli validation and solver-grounded diagram checks.
- [x] Content undo/redo, bounded event log and side-effect-free replay.
- [x] Explicit local saving, validated JSON import/export and unavailable-version refusal.
- [x] SQLite public read-only links, separate hashed owner tokens, revision protection, owner deletion and real QR generation.
- [x] Local notebook, frozen model/camera/region pins, captions/tags/search/reorder and explicit AI-draft acceptance.
- [x] PNG/SVG/Markdown/ZIP/PDF-print/source exports and clipboard image/text/MD/link paths.
- [x] GLB, OBJ, PLY, gated STL, cube and XYZ, with phase/provenance/units and independent reader checks.
- [x] Write → select → model → check → pin → export/share/reopen flow tested without AI.

App version **0.3.0**, numerical engine **0.1.0**, parameters unchanged. Read `docs/board.md` for size caps, static-image trust, self-contained versus server links, STL restrictions and external-app/device validation limits. No remote publishing or launch certification has been performed.

## Stage 0.4

- [x] Versioned registry, trust/provenance labels and known-answer gate for 21 enabled chemistry/math/unit calculators.
- [x] Neutral exact balancing, molar mass, limiting reagent/yield; gases; concentration/dilution/colligative changes; scoped acid/base, buffer/titration and ICE equilibrium.
- [x] Source-checked H–Kr configurations, cited 118-element periodic reference, standard-weight/missing-data gates.
- [x] Bounded AST algebra, elementary differentiation, polynomial integration and explicit graph/domain limits.
- [x] Unit dimensions/conversions, raw-value preservation and stated display precision conventions.
- [x] Workbench and explicit typed board dispatch with source-frozen calculator objects.
- [x] Schema-1 to schema-2 migration retaining old engine/source versions, with no silent numerical upgrade.
- [x] Content-hashed public asset caching; offline workbench/board/orbital reloads; no API/private-data or queued-write cache.
- [x] Golden/property/browser tests and independent SymPy numerical checks.

App **0.4.0**, EHT **0.1.0** unchanged. This is scoped, verified breadth, not all-purpose chemistry or a universal CAS; unsupported cases remain disabled. See `docs/solvers.md` for exact coverage and offline/privacy boundaries.

## Stage 0.5 — implementation, not yet accuracy-qualified

- [x] Selection-only PNG preview, deterministic typed/geometric proposals and separately configured optional vision bridge.
- [x] Strict transcription grammar/Pauli/schema validation; no answers, energies, parameter changes or model tools in recognizer output.
- [x] Editable interpretation/type, explicit review acknowledgement, original-ink retention and undoable input insertion; separate solver action remains required.
- [x] Structured diagram reference mapping and existing solver-based comparison, with ordinal/default-label limits disclosed.
- [x] Stale-selection abort/invalidations, offline/manual/missing-key paths, source-only crop tests and no automatic vision calls.
- [x] Consent/origin/request/concurrency limits and bounded memory transcription cache; no server image/correction persistence.
- [x] Opt-in local example export, separated procedural regression report and explicitly consented live benchmark runner.
- [ ] Configure and evaluate an actual image-capable provider/model; none was called with paid credentials here.
- [ ] Collect/review at least 200 representative real examples across several writers, agree accuracy/category/latency targets and meet them. Synthetic vectors do not satisfy this criterion.

App **0.5.0**, grammar **ink-grammar-1.0.0**, EHT/parameters/solver versions and board schema 2 unchanged. See `docs/recognition.md`. Stage 0.5 must not be called fully qualified until the two unchecked gates pass.

## Next stages — not implemented

0.6 full tool-calling tutor; 0.7 learning/exam readiness; 0.8 learner assessment/study; 0.9 dashboards; 1.0 accessibility/security/launch.

The registry now covers the declared Stage 0.4 scopes; unsupported Tier 3 and general CAS cases remain disabled. Accounts/instructor access, exam syllabus and full tutor/provider evaluation remain open. Preserve explicit intent, monochrome semantics and traceable numbers throughout.
