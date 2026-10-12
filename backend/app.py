import html
import logging
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import threading
import time
from collections import OrderedDict, deque

from flask import Flask, abort, jsonify, request, send_from_directory

from backend.tutor import TutorError, build_context, fetch_explanation, verify_explanation

ROOT = Path(__file__).resolve().parents[1]


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(MAX_CONTENT_LENGTH=65536, RATE_LIMIT=12, RATE_WINDOW=60)
    if config:
        app.config.update(config)
    calls = OrderedDict()
    lock = threading.Lock()

    @app.before_request
    def guard():
        if request.path.startswith("/api/tutor/"):
            # Same-origin browser calls only; no broad CORS or proxy-header trust.
            origin = request.headers.get("Origin")
            if origin and origin != request.host_url.rstrip("/"):
                return jsonify(error="Cross-origin tutor requests are not allowed."), 403
            address = request.remote_addr or "unknown"
            now = time.monotonic()
            with lock:
                if address not in calls:
                    if len(calls) >= 2048:
                        calls.popitem(last=False)
                    calls[address] = deque()
                recent = calls[address]
                while recent and now - recent[0] >= app.config["RATE_WINDOW"]:
                    recent.popleft()
                if len(recent) >= app.config["RATE_LIMIT"]:
                    response = jsonify(error="Too many tutor requests. Wait a minute and try again.")
                    response.headers["Retry-After"] = str(app.config["RATE_WINDOW"])
                    return response, 429
                recent.append(now)
                calls.move_to_end(address)

    @app.after_request
    def headers(response):
        nonce = getattr(request, "csp_nonce", None)
        script = "'self'" + (f" 'nonce-{nonce}'" if nonce else "")
        response.headers["Content-Security-Policy"] = f"default-src 'self'; script-src {script}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store" if request.path.startswith("/api/") or request.path == "/" else "no-cache"
        return response

    @app.get("/")
    def index():
        request.csp_nonce = secrets.token_urlsafe(18)
        return (ROOT / "web/index.html").read_text().replace("__CSP_NONCE__", request.csp_nonce)

    @app.get("/styles.css")
    @app.get("/favicon.svg")
    def assets():
        return send_from_directory(ROOT / "web", request.path.lstrip("/"))

    @app.get("/dist/<path:filename>")
    def modules(filename):
        if not filename.endswith(".js"):
            abort(404)
        return send_from_directory(ROOT / "dist", filename)

    @app.get("/vendor/three/<path:filename>")
    def three(filename):
        if not filename.endswith(".js") or not filename.startswith(("build/", "examples/jsm/")):
            abort(404)
        return send_from_directory(ROOT / "node_modules/three", filename)

    @app.get("/methods")
    def methods():
        text = html.escape((ROOT / "docs/methods.md").read_text())
        return f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OrbitalBoard · Methods</title><link rel="stylesheet" href="/styles.css"><main class="methods-page"><a href="/">← Back to the lab</a><pre>{text}</pre></main></html>'

    @app.get("/api/health")
    def health():
        return jsonify(ok=True, stage="0.2", tutorAvailable=bool(os.environ.get("GROQ_API_KEY")),
                       engineAvailable=bool(shutil.which("node")) and (ROOT / "dist/index.js").is_file())

    def recompute():
        if not request.is_json:
            raise ValueError("Send a JSON object with a system state.")
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or not isinstance(body.get("state"), dict):
            raise ValueError("Provide a system state object.")
        try:
            process = subprocess.run(["node", str(ROOT / "scripts/solve-stdin.mjs")],
                                     input=json.dumps(body["state"], allow_nan=False), capture_output=True,
                                     text=True, cwd=ROOT, timeout=5, check=False)
            output = json.loads(process.stdout)
        except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
            raise TutorError("The server engine is unavailable. Build the project and install Node.js.") from error
        if not output.get("ok"):
            raise ValueError(output.get("error", "Invalid system state."))
        return body, build_context(output["result"], body.get("orbitalIndex", 0))

    @app.post("/api/tutor/context")
    def context():
        try:
            _, data = recompute()
            return jsonify(data)
        except ValueError as error:
            return jsonify(error=str(error)), 400
        except TutorError as error:
            return jsonify(error=str(error)), 503

    @app.post("/api/tutor/explain")
    def explain():
        if not os.environ.get("GROQ_API_KEY"):
            return jsonify(error="AI is not configured. The lab works without it."), 503
        try:
            body, data = recompute()
            question = body.get("question", "Explain this selected orbital and its model limits.")
            if not isinstance(question, str) or not question.strip() or len(question) > 1000:
                raise ValueError("Question must be 1–1000 characters.")
            return jsonify(verify_explanation(fetch_explanation(data, question), data))
        except ValueError as error:
            return jsonify(error=str(error)), 400
        except TutorError as error:
            return jsonify(error=str(error)), 422

    @app.errorhandler(413)
    def oversized(_):
        return jsonify(error="Request exceeds the 64 KiB limit."), 413

    return app


app = create_app()

if __name__ == "__main__":
    if os.environ.get("ORBITALBOARD_QUIET") == "1":
        logging.getLogger("werkzeug").setLevel(logging.ERROR)
    port = int(os.environ.get("PORT", "5001"))
    print(f"OrbitalBoard lab: http://127.0.0.1:{port}", flush=True)
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
