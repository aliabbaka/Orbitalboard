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

## Explicit gaps

- No recovered prototype oracle, no YAeHMOP executable comparison and no PySCF SCF energy comparison.
- No experimental CO2 photoelectron validation or sourced AX2 reference-angle panel.
- No continuous geometry optimization, electron–electron energy, nuclear repulsion or d-orbital support.
- No full point-group solver or symmetry adaptation of accidentally degenerate mixed-symmetry eigenspaces.
- No browser/device/3D rendering or accessibility test yet; the worker unit test exercises the handler, not a real browser worker.
- CI is configured locally, not claimed to have passed remotely.
