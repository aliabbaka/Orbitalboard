# Stage 0.5 — selection-only recognition implementation

**Implementation status:** selection/crop, local geometric proposals, optional vision bridge, strict input validation, correction/confirmation, diagram comparison and benchmark tooling are implemented. **Release qualification is still pending:** no real paid-provider trial or qualified ≥200-example multi-writer handwriting dataset has been collected in this session. Synthetic geometry tests are not handwriting accuracy evidence.

## Student flow

1. Write/draw with Pen or mix selected ink/typed input. Select whole input objects by click/rectangle/Shift selection.
2. Choose **Read selection**. Only selected ink/text is rasterized into a white PNG preview. Solver result cards, title/history, matrices, images and unrelated board content are excluded.
3. A conservative local helper may propose typed content or level/arrow geometry without network. It does not read handwritten character glyphs.
4. For other handwriting, configure a separate vision service, review the actual preview, check upload consent, then choose **Read crop with vision**. Merely drawing/selecting/opening the dialog never calls a vision provider.
5. Edit **Read as** and its type. All readings are **unverified input**, not answers. Confidence is an uncalibrated model/heuristic score, never a correctness probability.
6. Check the review acknowledgement and add the confirmed input. Original strokes remain. This creates an undoable student text/diagram object and **does not solve it**.
7. Select the confirmed object and explicitly choose an existing solver, or Check diagram against a chosen source system. No recognizer supplies numerical answers or engine data.

Changing/removing/moving the source selection while a request is pending aborts/invalidates that proposal. It cannot apply to a new selection. Closing the dialog aborts its client request; the server may finish an already-sent provider call, but the result is not applied. Offline/missing-configuration/provider/schema errors retain manual correction and existing ink.

## v1 grammar and limits

`ink-grammar-1.0.0` supports neutral chemical formulas/equations, the existing bounded typed math expressions/equations, energy-level/arrow input and unverified question text. Formulas/math must parse in their claimed grammar. Unsupported geometry/connectivity, freehand graphs, orbital-lobe labeling, arbitrary prose solving, ionic notation and experimental energy inference are **not** enabled.

Energy readings contain only relative row positions, an optional explicit MO index and up/down arrows. There are no `energyEV`, `answer`, action/tool or parameter-change fields. Pauli rejects duplicate up/down arrows. Unlabeled geometric lines get low-to-high ordinal defaults (left-to-right in a shared row); these are not recognized symmetry labels or solver-correlated orbital identities. Review the mapping, especially degenerate rows. If no reference is chosen, the diagram can be kept as editable typed input instead of inventing a molecule.

The local helper is deliberately narrow: at least two straight horizontal lines; straight vertical shafts and separate V-shaped heads; every selected stroke must be accounted for. Leftover characters, uncertain heads and duplicate spin assignments cause refusal, not an optimistic OCR guess. This is geometry assistance, **not a handwritten formula recognizer**.

Selections are capped at 100 strokes/20000 points, PNG 1200×900 and 720000 encoded characters. API bodies are capped separately, reading text at 2000 characters, levels at 120 and ambiguity notes at eight. Unknown schemas, extra outputs/tool fields, unavailable inputs and invalid grammatical claims are blocked before any solver action.

## Separate vision configuration

The text tutor's Groq model/key is never implicitly reused. Put server-only values in root `.env` (loaded by `npm start`) or deployment secrets:

```dotenv
RECOGNITION_PROVIDER=openai
RECOGNITION_MODEL=YOUR_EXPLICIT_IMAGE_CAPABLE_MODEL
RECOGNITION_API_KEY=YOUR_SERVER_SECRET
```

`groq` is the other supported OpenAI-compatible adapter. Select a currently supported image-capable model from the provider's own documentation; there is no guessed default or claim that every model at those endpoints accepts vision/JSON mode. The status endpoint indicates configuration, not proven provider capability. HTTP/model/TLS errors fail clearly without weakening certificate validation or leaking keys/provider bodies.

Endpoints:

- `GET /api/recognition/status`: capability/configuration/privacy and unqualified-accuracy status; never a key.
- `POST /api/recognition/read`: only `{image, hint, consent:true}`; no request-supplied endpoint/prompt/history/board/expected answer. Hints are a fixed enum. Only an embedded PNG is accepted, never a remote URL or SVG.

The server sends a fixed transcription-only instruction and selected image. Pixel/text content is untrusted data, not authority. There is no tool execution or state mutation path. The complete provider response passes the same TypeScript grammar/schema used by the client before release. Prompt-following, confidence calibration and real interpretation accuracy are not claimed to be guaranteed by schema checks.

Rate/origin checks are shared with existing data endpoints. Concurrency is capped at two provider reads. A bounded 64-entry, 10-minute memory cache uses crop bytes/model/provider/hint/grammar; it stores validated transcriptions, not images. Request images/corrections are not written to disk, analytics or shared boards. No raw provider token streaming occurs. Production/distributed controls remain the launch review, not a new certification.

## Consented examples and evaluation

Optional benchmark export is off until the student explicitly consents. It downloads **only** selected PNG/vectors, proposed/corrected input, method, grammar version and an optional pseudonymous writer code. It is not automatically uploaded. Original full-board data, owner tokens and unrelated source state are excluded. Students should not use names/personal information as writer IDs.

```sh
npm run benchmark:recognition
# Optional: add a directory of consented local exports to the local-shape report.
node scripts/recognition-benchmark.mjs /path/to/consented-examples
```

The default report contains **24 procedural synthetic geometry cases, zero human writers**. Results are reported separately from user-contributed, still-unverified examples. The script explicitly marks the handwriting release gate pending and makes no provider calls/cost.

For a deliberate paid/live evaluation with a configured local server:

```sh
python3 scripts/recognition-live-benchmark.py /path/to/consented-examples --allow-upload
```

The extra upload flag is required even when examples were consented for local export. Without `--pilot`, the runner requires at least 200 samples and five nonempty writer codes; these counts alone are **not** proof of human provenance, reviewed labels or an agreed accuracy target. `--pilot` permits smaller diagnostic runs but never qualifies as release evidence. Requests are throttled; errors count as failures. The report gives exact transcription match, request failures and p95 elapsed time, without uploading results elsewhere.

Before marking Stage 0.5 qualified, agree on v1 content categories/targets, review representative real-writer labels/provenance, evaluate the actual provider and test pen/touch/small-screen behavior. The plan's proposed <1.5 s p95 is not promised by a 15-second timeout or synthetic sub-millisecond local measurements.

## What is tested now

Local geometry/typed proposals, source-only cropping/escaping, schema/Pauli/grammar rejection, consent/origin/body limits, missing provider behavior, mocked provider validation/cache, stale-selection cancellation, manual correction, original-ink retention/undo, offline manual use, real solver-backed diagram comparison and explicit example export. Browser/provider mocks and synthetic vectors do not replace the pending live benchmark. Solver versions and board schema 2 remain unchanged.
