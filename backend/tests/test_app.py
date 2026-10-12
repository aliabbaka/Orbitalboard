import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

from backend.app import create_app
from backend.tutor import TutorError, build_context, verify_explanation

ROOT = Path(__file__).resolve().parents[2]
SYSTEMS = json.loads((ROOT / "tests/data/systems.json").read_text())["systems"]
O2 = next(case["state"] for case in SYSTEMS if case["name"] == "O2")


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"TESTING": True, "RATE_LIMIT": 100})
        self.client = self.app.test_client()

    def test_lab_assets_csp_and_local_dependencies(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Molecular lab", response.data)
        self.assertNotIn(b"__CSP_NONCE__", response.data)
        self.assertIn("nonce-", response.headers["Content-Security-Policy"])
        self.assertNotIn("unsafe-eval", response.headers["Content-Security-Policy"])
        for path in ["/styles.css", "/dist/lab/app.js", "/vendor/three/build/three.module.js", "/vendor/three/build/three.core.js", "/methods"]:
            with self.client.get(path) as asset:
                self.assertEqual(asset.status_code, 200, path)
        for path in ["/vendor/three/package.json", "/dist/../package.json", "/vendor/three/../../backend/.env.example"]:
            self.assertEqual(self.client.get(path).status_code, 404)
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_server_recomputes_instead_of_trusting_client_values(self):
        response = self.client.post("/api/tutor/context", json={"state": O2, "orbitalIndex": 5, "derived": {"unpairedElectrons": 999}})
        self.assertEqual(response.status_code, 200)
        context = response.get_json()
        self.assertEqual(context["facts"]["unpairedElectrons"]["value"], 2)
        self.assertEqual(context["solverVersion"], "0.1.0")
        self.assertTrue(any(w["code"] == "D2" for w in context["warnings"]))

    def test_errors_and_body_limit(self):
        for body in [{}, {"state": {}}, {"state": O2, "orbitalIndex": 999}, {"state": O2, "orbitalIndex": True}, {"state": {**O2, "charge": "1"}}]:
            self.assertEqual(self.client.post("/api/tutor/context", json=body).status_code, 400)
        self.assertEqual(self.client.post("/api/tutor/context", data='{}').status_code, 400)
        self.assertEqual(self.client.post("/api/tutor/context", data='x' * 70000, content_type="application/json").status_code, 413)

    def test_cross_origin_and_rate_limit(self):
        self.assertEqual(self.client.post("/api/tutor/context", json={"state": O2}, headers={"Origin": "https://attacker.invalid"}).status_code, 403)
        client = create_app({"TESTING": True, "RATE_LIMIT": 2}).test_client()
        self.assertEqual(client.post("/api/tutor/context", json={}).status_code, 400)
        self.assertEqual(client.post("/api/tutor/context", json={}).status_code, 400)
        response = client.post("/api/tutor/context", json={})
        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response.headers)

    def test_missing_key_is_explicit_and_never_calls_provider(self):
        with patch.dict(os.environ, {}, clear=True), patch("backend.app.fetch_explanation") as provider:
            self.assertFalse(self.client.get("/api/health").get_json()["tutorAvailable"])
            response = self.client.post("/api/tutor/explain", json={"state": O2})
            self.assertEqual(response.status_code, 503)
            provider.assert_not_called()

    def test_checked_ai_prose_stays_unverified_and_uncited_numbers_are_blocked(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-secret"}):
            with patch("backend.app.fetch_explanation", return_value={"segments": [{"text": "There are 2 unpaired electrons.", "cites": ["unpairedElectrons"]}]}):
                response = self.client.post("/api/tutor/explain", json={"state": O2})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.get_json()["trust"], "Explained by AI")
                self.assertFalse(response.get_json()["verified"])
                self.assertNotIn("test-secret", response.get_data(as_text=True))
            with patch("backend.app.fetch_explanation", return_value={"segments": [{"text": "There are 777 unpaired electrons.", "cites": ["unpairedElectrons"]}]}):
                response = self.client.post("/api/tutor/explain", json={"state": O2})
                self.assertEqual(response.status_code, 422)
                self.assertNotIn("777", response.get_data(as_text=True))


class NumericGateTests(unittest.TestCase):
    def setUp(self):
        self.context = {"solverVersion": "0.1.0", "parameterVersion": "test", "facts": {"energy": {"value": -14.748, "unit": "eV"}, "count": {"value": 2, "unit": "electrons"}}}

    def test_valid_rounded_and_unicode_negative_values(self):
        for text in ["The energy is -14.75 eV.", "The energy is −14.748 eV.", "The energy is -1.4748e1 eV."]:
            verify_explanation({"segments": [{"text": text, "cites": ["energy"]}]}, self.context)

    def test_reject_missing_citation_tool_fields_html_and_invented_values(self):
        bad = [{"segments": [{"text": "Energy 10 eV.", "cites": ["energy"]}]},
               {"segments": [{"text": "The electron count is 777.", "cites": ["count"]}]},
               {"segments": [{"text": "Energy 1e9999 eV.", "cites": ["energy"]}]},
               {"segments": [{"text": "Energy -14.75 eV.", "cites": ["count"]}]},
               {"segments": [{"text": "Text", "cites": ["missing"]}]},
               {"segments": [{"text": "<script>alert(2)</script>", "cites": ["count"]}]},
               {"segments": [{"text": "Text", "cites": []}]},
               {"segments": [], "set_param": {"charge": 2}}]
        for note in bad:
            with self.assertRaises(TutorError):
                verify_explanation(note, self.context)

    def test_boolean_index_rejected(self):
        with self.assertRaises(ValueError):
            build_context({"orbitals": []}, True)


if __name__ == "__main__":
    unittest.main()
