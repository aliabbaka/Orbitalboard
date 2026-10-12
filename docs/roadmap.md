# Roadmap / implementation status

Source: user-supplied OrbitalBoard Technical Plan v2.2, October 9, 2026. Work in this delivery is restricted to **Stage 0.1**.

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

## Next stages — not implemented

0.2 lab; 0.3 board/notebook/export; 0.4 Tier-2 registry/calculators/offline app; 0.5 ink; 0.6 tool-calling tutor; 0.7 learning/exam readiness; 0.8 learner assessment/study; 0.9 dashboards; 1.0 accessibility/security/launch.

The solver contract exists now, but a multi-subject registry is not implemented. Accounts, instructor access, 3D formats, exam syllabus, board library and AI-provider decisions can wait until their stages. Preserve explicit intent, monochrome semantics and traceable numbers throughout.
