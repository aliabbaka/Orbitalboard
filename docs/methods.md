# Methods and limits — engine 0.1.0

## Model

1. Validate geometry, units, verified elements, charge, multiplicity and size.
2. Build H/He 1s and period-2 2s/2px/2py/2pz contracted Gaussians from the pinned PySCF STO-3G table.
3. Normalize each primitive and contraction, and compute s/s, s/p and p/p overlaps analytically with the Gaussian product theorem. Coordinates and exponents use bohr internally.
4. Use sourced on-site energies for `Hii`. For `i != j`, use `Hij = K Sij (Hii + Hjj) / 2`, default `K = 1.75` (the **unweighted** Wolfsberg–Helmholz form).
5. Diagonalize S, construct its symmetric inverse square root, diagonalize `S^(-1/2) H S^(-1/2)`, and back-transform coefficients. Reject ill-conditioned overlap matrices and failed residual/normalization checks.
6. Group energies within the declared tolerance and fill them with Aufbau, Pauli and Hund rules, unless multiplicity explicitly constrains spin populations.
7. Produce raw energies, coefficients, occupations, derived diagnostics, provenance and limitations. No LLM participates.

This is an **educational Gaussian-overlap EHT variant**. YAeHMOP's on-site energies originated in a Slater-orbital model; borrowing its IP values does not make our Gaussian model equivalent to YAeHMOP. YAeHMOP also defaults to a *weighted* Hamiltonian, unlike this plan's unweighted formula. No YAeHMOP calculation has been run as an oracle, and experimental accuracy has not been established for arbitrary molecules.

### Core exclusion

Period-2 core 1s AOs are omitted. Our overlap matrix matches the **valence submatrix** of PySCF's full STO-3G overlap, not its entire basis and not valence orbitals additionally orthogonalized against the omitted core. H and He retain their 1s shell.

## Derived-value definitions

- **Energy grouping:** absolute `1e-6 eV` tolerance against the first member of a group; no tolerance chaining. This is a numerical convention, not a physical threshold.
- **Occupation:** one up-spin electron in each member of an energy group before down-spin pairing. Explicit multiplicity sets `Nup = (N + M - 1)/2`, `Ndown = (N - M + 1)/2`. Impossible counts and parity mismatches are errors, not clamped values. A fixed-spin determinant does not model correlated singlets or exchange energies.
- **HOMO:** highest occupied spatial energy group. **LUMO:** lowest spatial energy group with an available spin slot. **SOMO:** singly occupied spatial orbitals. Open-shell HOMO and LUMO sets can overlap, and the gap is not an excitation energy. Full/empty spaces have missing frontier sets and a `null` gap. Constrained excited spin configurations can have a negative spatial frontier gap.
- **Composition:** squared coefficients in the Löwdin-orthogonalized AO basis, normalized to percentages. This avoids negative Mulliken percentages. Atom totals are orientation-invariant; individual Cartesian p contributions and individual members of degenerate eigenspaces need not be.
- **Linear symmetry:** projection into s/axis-parallel p versus transverse p components identifies σ/π. Inversion maps identical elements and includes the odd intrinsic parity of p AOs. Heteronuclear linear molecules do **not** automatically get g/u labels. Nonlinear molecules use orbital indices. Accidentally degenerate mixtures that cannot be resolved are left unlabeled rather than guessed.
- **Population diagnostic:** interatomic overlap population of an orbital is `2 sum(i<j, different atoms) ci cj Sij`. Multiplying by occupation and grouping pairs gives per-atom-pair overlap populations. These are **not formal bond orders**.
- **Character:** for resolved s/p homonuclear diatomics, σg and πu follow bonding parents, while σu and πg follow antibonding parents, using the standard MO-diagram convention. Outside that scope, overlap-population sign gives a clearly labeled approximate character. Strong s–p mixing can give positive overlap population to a conventionally antibonding σu level; these two measures must not be conflated.
- **Textbook bond order:** `(bonding electrons - antibonding electrons)/2` for resolved homonuclear diatomics only. Polyatomics, heteronuclear diatomics and unresolved symmetry return `null`; no scalar molecule-wide order is invented.
- **Magnetism:** predicted from independent-electron unpaired occupancy only, not a quantitative magnetic susceptibility calculation.
- **Orbital-energy sum:** `sum(occupation * energyEV)`. There is no `totalEnergyEV` field because the sum lacks nuclear repulsion and electron–electron energy.

## Scans

`scanAngle()` moves one selected atom in the plane of the specified three-atom handle, retaining its radius. A linear starting geometry has no unique bending plane; a deterministic Cartesian plane is chosen. It does not move a bonded fragment implicitly.

Minima are **sampled orbital-energy-sum minima**, never asserted experimental equilibrium angles. Gain is relative to an explicitly supplied 180° sample; without one it is `null`. The small-gain warning defaults to `0.2 eV`, a configurable heuristic, not a reference datum. Curves are energy-sorted; overlap-based orbital tracking across crossings is future work. No bond-length optimization API is provided.

## Provenance and determinism

Every solve result includes `Computed`, schema version, solver ID/version, parameter-set version, a copied input, source definitions, K origin and warnings with source/value paths. User coordinates, charge and K are **inputs**, not cited experimental facts. No clock, randomness, network or DOM exists in `solve()`; repeated identical states produce identical outputs on the tested runtime. Degenerate orbital orientations are not unique physics, and bit-for-bit equality across future runtimes is not promised.

Version pins are necessary, but not sufficient to reopen old boards: a future storage layer must retain old engine/parameter artifacts and refuse unavailable versions instead of silently upgrading. That layer is not implemented here.

## Verification gate

H, He, C, N, O and F are enabled on the strength of independent numerical checks and cited **diatomic** reference checks. Carbon and oxygen carry model-limit flags. These flags mean "tested within this documented educational scope," not "correct for every molecule containing this element." Li, Be, B and Ne have sourced tables and isolated-atom numerical checks but remain disabled pending chemical checks. d orbitals and heavier elements are rejected.

## Sources

The executable citation registry is `src/data/parameters.ts`:

- **sto3g:** PySCF v2.8.0 `pyscf/gto/basis/sto-3g.dat`, with the Hehre/Stewart/Pople reference in its header.
- **yaehmop:** commit `4ded45bb2bb7a2d38d2527c991debce9226a9066`, `tightbind/eht_parms.dat`, IP columns. Ne's inconsistent Nvalen rows are not used; valence count is atomic number minus the 1s core.
- **bohr:** PySCF v2.8.0 `pyscf/data/nist.py`. Its historical `0.52917721092 Å` conversion is deliberately retained to match the pinned oracle, not presented as the latest CODATA value.
- **wh-k:** the pinned YAeHMOP `docs/input_file.tex`, Nonweighted and Wolfsberg–Helmholz sections.
- **openstax-mo:** Chemistry 2e §8.4, figures 8.35–8.40 and Table 8.3. Only facts are recorded, not copied textbook questions or artwork; do not assume textbook content is unrestricted for future reuse.

All source links and locators travel in the result. A citation test fails on missing citations; independently loaded numerical fixtures catch table transcription errors. Published AX2 angle data and CO2 photoelectron references are **not yet included**, so the plan's remembered values are not treated as lookups.
