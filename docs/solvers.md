# Stage 0.4 — verified breadth, source data and offline contract

## Registry and truth boundary

`src/solvers/registry.ts` is the versioned registry. Enabled entries are pure deterministic functions: raw inputs in, values/steps/warnings/citations out. No LLM, network, clock, JavaScript `eval`, DOM or prompt text computes an answer. Each entry pins solver version `1.0.0` and data version `tier2-data-1.0.0`. CI requires known-answer coverage for every enabled ID. Unverified topics appear disabled with their reason.

The workbench `/tools` exposes explicit inputs and units. Prefilling/editing/classifying does not compute. Run uses a worker; stale responses are discarded. A result carries **Computed**, solver/data versions, raw values, deterministic steps, warnings and source links. Display rounding never overwrites raw source values. Capturing to a board stores its immutable calculation inputs and versions, not client-supplied answers.

The board dispatches neutral equations to Balance/Steps, formulas to molar-mass tools, and supported typed math to linear/quadratic solving, derivatives, polynomial integration or graph tools. Broad chemistry data does **not** enable additional EHT atoms: the orbital verification gate is unchanged.

## Enabled scope

| Family | Supported, tested scope | Not claimed |
| --- | --- | --- |
| Stoichiometry | Exact rational neutral atom balancing; unique positive coefficients, molar mass, limiting reactants, theoretical mass/amount and percent yield | Ionic/redox balance, ambiguous multi-balance reactions, isotope-specific masses |
| Atomic structure | H–Kr neutral filling checked against source configurations, Cr/Cu exceptions, highest-n cation removal model, small early-element anion model, n/l/m/Pauli/Hund diagnostics | Ground term symbols, correlated ion rearrangements, ion stability, transition-element anions |
| Gases | One unknown PV=nRT variable, Dalton, Graham ratio, pressure from supplied van der Waals a/b | Species constants guessed by the model, phase equilibria, general real-fluid accuracy |
| Solutions | Molarity, molality, dilution, colligative temperature-change magnitude | Nonideal/activity corrections, inferred solvent constants or van’t Hoff factors |
| Acid–base | Strong/weak neutral monoprotic acid/base, water autoionization, Henderson–Hasselbalch buffer approximation, strong monoprotic titration samples | Polyprotic/mixed-salt models, weak-acid titration or arbitrary temperatures |
| Equilibrium | One user-defined ideal aqueous ICE reaction, positive concentration bounds, monotonic log-Q bisection and Q/K direction | Coupled mechanisms, solids/liquids activity inference, treating K as generic odds |
| Math | Safe real AST evaluation (x, sin/cos/exp/ln/sqrt), degree≤2 equations including complex conjugates, elementary symbolic derivatives, degree≤12 polynomial antiderivatives and bounded sampled graphs | Arbitrary CAS solve/integrate, unsupported symbols/assignments, proof that sampled plots resolve asymptotes |
| Units | Supported kg/m/s/mol/K dimension vectors, compound integer powers, SI/common scale conversions, absolute Celsius offset | Missing-unit guesses, Celsius compound/difference misuse, arbitrary unit ontologies |

Scope errors are errors, not “Explained by AI” numeric fallback. Tier 3 thermochemistry/kinetics/redox/nuclear and unsupported calculus branches remain disabled. These calculators are verified educational models within their declared grammar, not research-grade universal chemistry.

## Source data

The generator `scripts/import_periodic_data.py` imports committed source snapshots from `data/reference/`, and generated `src/data/periodic.ts` records their URLs and SHA-256 hashes. `--offline` reproduces that generation without connection. Source refresh is explicit, never silently done by the deployed browser.

- **CIAAW Abridged Standard Atomic Weights 2024** supplies 84 standard weights and table uncertainty bounds. These values, not differently rounded PubChem display masses, drive molar masses. Entries with a dash (e.g. Tc/Og) are refused rather than replaced with representative isotope masses.
- **PubChem** supplies 118 reference symbols/names/numbers, reported configurations and selected trends. Heavy-element configurations may be predictions; missing properties are missing, not zero. Radius definitions/rounded values are not treated as bond-length data.
- **NIST/BIPM** ground the gas constant and supported SI/conventional unit definitions. R derives from exact SI k·NA. Celsius offset is 273.15; atm is 101325 Pa; torr is atm/760.
- **OpenStax** methods sections ground textbook-law examples, model assumptions and math rules. Golden cases are analytic regression exercises checked against these laws/reference facts, not copied exam questions or a claim that all fixture wording/values were published verbatim.

Known-answer fixtures cover each enabled solver. Property checks additionally enforce conservation, units/domains, exact balancing, source configurations and numerical residuals. Independent Python/SymPy checks verify numerical calculus/algebra/acid/ICE cases without importing JavaScript outputs.

## Precision and limits

Quantities preserve input numeric strings and explicit units. Simple significant-figure conventions use the least supplied quantity precision, with an override. Integer stoichiometric counts remain exact. For acid/base logarithms, concentration significant figures set pH/pOH decimal places. Uncertainty propagation, pKa measurement precision and every textbook rounding convention are not comprehensively modeled; warnings and raw values make this explicit. Trailing-zero notation such as `100` is ambiguous unless written `100.` or scientific notation.

Formula depth, species counts, rational intermediates, AST nodes/nesting, polynomial degree/coefficient size, graph samples, temperature/positive domains and solver input size are capped. Equilibrium values near unrepresentable boundary scales are refused if the log-Q residual fails. Buffer/ideal-gas predictions warn about model assumptions instead of implying experimental certainty.

## Schema and persistence

Boards use **schema 2** with a registry manifest and `calculation` objects. The explicit schema-1 migration adds only that manifest/schema field, preserving every old EHT/formula version, source state, image and ink record. It does not upgrade unavailable numerical engines. Calculator records independently validate their solver/data versions. Saved/shared results replay their inputs; forged client `answer` fields are rejected and server sharing recomputes the valid result.

## Offline privacy

After one online visit, a service worker caches a content-hashed manifest of public HTML/CSS/native JS/vendor assets. The numerical engines, calculators, typed board, periodic references, local IndexedDB and exports then reload without the server/network. The offline test disables connectivity and performs fresh workbench/board/lab navigations and a real orbital solve.

**Never cached:** `/api/*`, shared-board JSON, owner credentials, questions, AI responses, or failed writes. Shared URL navigation can load only the public board shell offline; opening its uncached server document still fails clearly. Users can restore their own explicit local save or import source JSON. AI and server save/delete are unavailable while offline; there is no background replay/write queue.

Cache install is all-or-nothing. A failed update does not delete the working cache. Content changes change the service-worker script build marker, so new assets are detected. The worker does not force an update/reload underneath an unsaved board. Browser storage can be cleared/evicted, so offline availability is not a promise of permanent archival. No analytics or third-party fetch is introduced by caching.

## Remaining validation

Browser worker/offline flows, known answers and independent source readers are tested locally. Real-provider explanations, representative low-power/pen/assistive devices, production reverse-proxy/storage/security and broad external app compatibility remain later validation. Offline support does not make AI/recognition available without a connection.
