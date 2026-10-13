# Stage 0.3 — Board and Notebook

## Board choice and interaction

The board uses a small custom SVG canvas, not React/tldraw/Excalidraw. This preserves native modules, avoids a third-party document format and licensing gate, and makes vector exports direct. The document is versioned JSON; styles use semantic ink tokens instead of fixed stroke colors.

Select is default. Click an object or drag a rectangle; Shift adds/toggles selection. Drag selected objects to move, optionally snapped. Pen creates ordinary ink; eraser deletes whole objects/strokes, and undo restores them. Text/formula opens a typed editor. Alt/middle drag pans, zoom/fit controls navigate, and the keyboard object list, arrows, V/P/T/E and Ctrl/Cmd-Z provide non-ink alternatives.

The action bar shows at most five primary choices and a flat More menu. Typed formula interpretation is deterministic and shown before dispatch. The last used action is remembered and visibly marked, never automatically executed. Typed math/word problems remain student text: Tier 2 calculators and ink interpretation are not claimed here. No board text can become system instructions or model-executable tools.

The v1 formula grammar is verified element symbols with positive integer counts; subscripts normalize to digits. Neutral valence-electron counting is a pure, versioned, tested calculator. A formula does not uniquely determine a molecule. Only known illustrative templates are proposed; other structures require XYZ/free-build. All verified elements, arbitrary coordinates, charge/spin/K inputs and size limits come from the existing engine.

Structured student diagrams accept one `orbital-number: ↑↓` line per level, low-to-high. Pauli rejects repeated up/down arrows. Comparison checks occupancy and ordering against the same pinned solver, accepting swaps within energy tolerance. This is a diagram/model check, not mastery grading or proof of experimental truth.

## Frozen sources and replay

`src/board/types.ts` and `schema.ts` define schema 1. Each board pins the EHT/parameter/formula-counter versions. Systems carry their geometry and 3D view (orbital, mode, isovalue, grid, camera/target). Result objects store inputs and intent, not client-authored numerical answers; rendering replays known source computations. Student text/ink never runs a solver merely on restoration.

Known versions reproduce current engine inputs/results. Unknown schema or solver versions fail clearly; no speculative migration or arbitrary version-code download exists. The unavailable original Python prototype is not a supported board format.

Content changes are logged as before/after deltas. Undo/redo and the scrubber change data only: replay never repeats uploads, downloads, AI calls or other side effects. History is bounded at 100 events. Navigation/preferences/title metadata are not content undo commands. Model edits from the embedded lab are applied to a selected input only when Apply is pressed; existing result cards keep their own original frozen sources.

## Local notes and privacy

Local board saving is explicit. Ink is not silently persisted in a draft. Pin is an explicit notebook save, separate from unrelated board ink. IndexedDB stores boards/notebooks on this browser/device; clearing browser storage removes them, so JSON/ZIP backups matter.

Pins retain both monochrome image variants, alt text, date, notes/tags and either exact model/view state or a frozen selected-object region. Search, reorder, remove and edits are local. Optional AI captions send the pinned system to the server/provider only when requested; a draft is not stored until Accept. Accepted/edited AI captions stay marked **unverified**. Provider/units/pedagogical quality has not been evaluated with a real key.

Snapshots/images are attachments. Shared/uploaded PNG pixels are not cryptographically verified against scientific state and can be altered by an author; numerical results must be checked by reopening the pinned source. No claim of verified image provenance is made.

## Sharing

- `POST /api/boards` validates the complete document with the TypeScript schema, verifies stored computed sources and creates a 24-character random public ID and a separate 43-character owner token.
- `GET /api/boards/<id>` returns the document/revision only, never the token or its hash. `/b/<id>` opens read-only; Remix creates an independent local draft.
- `PUT` needs `Authorization: Bearer <owner-token>` and matching `If-Match` revision. Conflicts do not discard the local draft.
- `DELETE` needs the owner token and a user confirmation in the UI. Local work/files are not deleted.

Tokens are hashed in SQLite and remembered only in the saving browser's local storage. They are bearer credentials: if browser storage is cleared/lost, the public URL cannot recover editing authority. Board JSON/QR/exports do not contain owner tokens. There are no instructor/student accounts yet.

Sharing excludes replay/erased content unless the history checkbox is explicitly enabled; unused source/image archives are pruned. Including history may reveal erased data. The UI discloses that sharing sends the board and pins to this server. Nothing is uploaded on creation, drawing, caption editing, pinning or local save.

The local store is `var/boards.sqlite3` (ignored by Git), configurable by `BOARD_DB_PATH`; default server quota is 100 boards, each at most 4 MiB. Data remains until owner/operator deletion or storage loss, not a promised managed cloud service. Container deployments need a persistent volume. Loopback URLs cannot be opened from another device without hosting. Public launch still requires reverse-proxy, distributed rate limits, moderation/reporting and the later security/privacy review.

## Exports and source links

Selections/full boards export as semantic SVG, PNG or complete JSON. Pins export image/vector note cards with method, parameters, versions, date, alt text and a QR/source link where it fits. Model links are self-contained compressed, version-checked states; region links are self-contained when small, or use `/b/<id>#pin=<id>` to reopen frozen region data. Long regions require sharing/JSON instead of pretending every payload fits a QR.

Markdown copy/download can include an inline PNG; the ZIP option supplies `study-sheet.md`, relative `images/*.png` and `source-board.json` for ordinary note apps. Note captions and source text are escaped, not executable HTML. Markdown/PNG/PDF artifacts preserve data, but integration with every third-party note app has not been independently certified.

Print/PDF uses a print-friendly browser sheet; choose Save as PDF in the dialog. Playwright additionally generates and inspects actual PDF bytes. It is not an automatic remote PDF upload.

## Model downloads

| Format | Behavior / caveat |
| --- | --- |
| GLB | Named atom/phase objects, source/versions/settings in extras. glTF uses meters; our educational enlarged model explicitly maps one meter to one source angstrom, not atomic physical scale. Wireframe intent survives in metadata, not every external viewer's material setting. |
| OBJ | Geometry/named phases/source comments; no companion MTL bundle. Density cloud requires GLB/PLY instead. |
| PLY | Mesh or density points in angstrom, with explicit per-vertex `phase` (+1, −1, atom/connectors 0) and source comments. Viewers may need custom-property handling. |
| STL | One surface phase only, no intersecting atom/connector assembly. Padded-grid boundary gate, welded vertices and consistently oriented two-incidence edges required. Explicit 1–100 mm/angstrom enlargement. Not a boolean-union, self-intersection, minimum-thickness or printer certification. Invalid meshes are refused. |
| Cube | Signed orbital amplitudes, bohr axes/atom coordinates and proper x-outer/z-inner order. Same sampled field as the on-screen surface; capped 40³. |
| XYZ | Atom positions only, explicitly angstrom, with method/version comments. |

Round-trip tests use independent format readers (three.js GLTF/OBJ/PLY/STL loaders) and direct cube/XYZ parsing, including phase/unit/scale checks. This is not a claim that Blender, VMD or every slicer has been manually tested. Model PNGs are supplied by note snapshots; video/AR app integration is not implemented.

## Current scope limits

Rectangular whole-object selection, not lasso/partial-stroke OCR; structured diagrams, not recognized handwriting; at most 200 objects, 20000 current ink points, 20 active pins, 80 source/image archive records and 4 MiB documents. Solver elements/30-atom cap and experimental model limitations remain unchanged. π-network/alternative solvers, large-matrix speedups, learning prediction gates, spaced review and instructor roles are not silently added in this milestone.

The core Stage 0.3 acceptance path—write/select, build/solve without AI, diagram check, pin, export, share and reopen pinned sources—is browser-tested. Public rollout, full accessibility/pen-device coverage, all-note-app compatibility and research-grade chemistry remain separate validation work.
