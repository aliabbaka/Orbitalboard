# CircuitLab audit

Inspected the supplied repository at commit [`95340bfcddc9ac759658c0786e8f58dc88641eaa`](https://github.com/aliabbaka/AC-DC-Convertor/tree/95340bfcddc9ac759658c0786e8f58dc88641eaa), rather than relying only on the plan's reported architecture. No code was copied into this engine.

## Confirmed

- `index.html`: vanilla HTML/CSS/JavaScript, canvas plots, SVG schematic, logarithmic control mapping through `sliderToValue()`, `valueToSlider()`, `wireLogControl()` and `initControl()`.
- Live derived circuit state and `getCircuitStateJSON()` are rebuilt from the current parameters for tutor requests.
- `tutor-backend/app.py`: Flask, Flask-CORS, dotenv, streamed plain-text chat, health endpoints and output action markers.
- `agents.py`: Groq streaming completions, `openai/gpt-oss-120b`.
- `prompts.py`: state injection, RLC scope, concise tutoring and a fenced `circuit-set` protocol.
- `circuit_breaker.py`: regex input screening and numeric-range action clamping/dropping.
- Dockerfile, gunicorn, devcontainer and a GitHub Actions GHCR publishing workflow.
- No automated test files were present in the inspected tree. Render is reported as the deployment destination, not independently verified live infrastructure.

## Corrections and gaps relevant to OrbitalBoard

1. **`recompute()` is not pure.** It mutates `state.derived` and immediately calls several DOM update functions. Its mathematical helpers can be a design precedent, but OrbitalBoard's solver must remain separate and pure.
2. The context builder rounds/formats several values into strings. OrbitalBoard should retain raw solver values and stable citation paths, with formatting only at display time.
3. `circuit-set` is not real provider tool calling. The new assistant will need explicit schemas and permissions.
4. The Flask response streams explanation tokens **before** verifying the final action. It validates actions, not the explanation's numerical claims. OrbitalBoard must validate a note before committing it or treating it as verified output.
5. CORS is wide open, explicitly marked local-development-only. It must not be carried into a public service unchanged.
6. Regex screening, action clamps and a prompt instruction are not a complete prompt-injection or numeric-consistency defense.
7. The source configuration establishes the model name, not its current vision capabilities. A later recognition-stage choice requires independent capability verification.

The reusable idea is **current state → computed values → constrained explanation**. The new engine adds version pins, input validation, sourced parameters, independent oracles and automated tests; Flask and UI reuse are later stages.
