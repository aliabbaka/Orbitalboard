"""Local SQLite boards. Public IDs are not edit credentials; owner tokens are stored hashed."""
import hashlib
from contextlib import contextmanager
import hmac
import json
from pathlib import Path
import re
import secrets
import sqlite3
import subprocess
import time

MAX_BYTES = 4 * 1024 * 1024
ID = re.compile(r"^[A-Za-z0-9_-]{24}$")


class BoardError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def validate_document(document, root):
    try:
        raw = json.dumps(document, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as error:
        raise BoardError("Board must be finite JSON data.") from error
    if len(raw.encode()) > MAX_BYTES:
        raise BoardError("Board exceeds the 4 MiB limit.", 413)
    try:
        process = subprocess.run(["node", str(root / "scripts/validate-board.mjs")], input=raw,
                                 text=True, capture_output=True, cwd=root, timeout=5, check=False)
        result = json.loads(process.stdout)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        raise BoardError("Board validator unavailable. Build the project first.", 503) from error
    if not result.get("ok"):
        raise BoardError(result.get("error", "Invalid board."))
    return raw


class BoardStore:
    def __init__(self, path, root, quota=100):
        self.path = Path(path)
        self.root = root
        self.quota = quota

    @contextmanager
    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=5)
        db.execute("CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, document TEXT NOT NULL, revision INTEGER NOT NULL, updated REAL NOT NULL)")
        try:
            with db:
                yield db
        finally:
            db.close()

    def create(self, document):
        raw = validate_document(document, self.root)
        board_id, owner = secrets.token_urlsafe(18), secrets.token_urlsafe(32)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute("SELECT COUNT(*) FROM boards").fetchone()[0] >= self.quota:
                raise BoardError("This server's board quota is full. Save locally or export JSON instead.", 507)
            db.execute("INSERT INTO boards VALUES (?, ?, ?, 1, ?)", (board_id, hashlib.sha256(owner.encode()).hexdigest(), raw, time.time()))
        return {"id": board_id, "ownerToken": owner, "revision": 1}

    def get(self, board_id):
        if not ID.fullmatch(board_id):
            raise BoardError("Board not found.", 404)
        with self.connect() as db:
            row = db.execute("SELECT document, revision FROM boards WHERE id=?", (board_id,)).fetchone()
        if not row:
            raise BoardError("Board not found.", 404)
        return {"id": board_id, "document": json.loads(row[0]), "revision": row[1]}

    def owned(self, db, board_id, authorization):
        if not ID.fullmatch(board_id):
            raise BoardError("Board not found.", 404)
        row = db.execute("SELECT owner_hash, revision FROM boards WHERE id=?", (board_id,)).fetchone()
        if not row:
            raise BoardError("Board not found.", 404)
        token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token) or not hmac.compare_digest(row[0], hashlib.sha256(token.encode()).hexdigest()):
            raise BoardError("An owner token is required. The public link grants view access only.", 403)
        return row[1]

    def update(self, board_id, document, authorization, revision):
        # Check ownership before doing expensive validation; check again in the write transaction.
        with self.connect() as db:
            self.owned(db, board_id, authorization)
        raw = validate_document(document, self.root)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            current = self.owned(db, board_id, authorization)
            if revision != str(current):
                raise BoardError("Board changed elsewhere. Reload or remix; your local work has not been discarded.", 409)
            db.execute("UPDATE boards SET document=?, revision=?, updated=? WHERE id=?", (raw, current + 1, time.time(), board_id))
        return {"id": board_id, "revision": current + 1}

    def delete(self, board_id, authorization):
        with self.connect() as db:
            self.owned(db, board_id, authorization)
            db.execute("DELETE FROM boards WHERE id=?", (board_id,))
