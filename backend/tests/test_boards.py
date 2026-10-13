import json
import tempfile
import unittest
from pathlib import Path

from backend.app import create_app


def document():
    return {"schemaVersion": 1, "engines": {"eht": "0.1.0", "parameters": "sto3g-yaehmop-1.0.0", "formula": "1.0.0"},
            "id": "local-board", "title": "Test board", "viewBox": [0, 0, 1100, 700], "objects": [], "systems": {}, "media": {}, "pins": [], "events": [], "cursor": 0}


class BoardTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = str(Path(self.directory.name) / 'boards.sqlite3')
        self.app = create_app({"TESTING": True, "BOARD_DB": self.path, "RATE_LIMIT": 100})
        self.client = self.app.test_client()

    def tearDown(self):
        self.directory.cleanup()

    def save(self):
        response = self.client.post('/api/boards', json={"document": document()})
        self.assertEqual(response.status_code, 201, response.get_data(as_text=True))
        return response.get_json()

    def test_create_read_persistence_and_owner_separation(self):
        saved = self.save()
        self.assertEqual(len(saved['id']), 24)
        self.assertEqual(len(saved['ownerToken']), 43)
        public = self.client.get('/api/boards/' + saved['id']).get_json()
        self.assertNotIn('ownerToken', public)
        self.assertEqual(public['document'], document())
        restarted = create_app({"TESTING": True, "BOARD_DB": self.path}).test_client()
        self.assertEqual(restarted.get('/api/boards/' + saved['id']).get_json()['document'], document())
        self.assertEqual(self.client.get('/b/' + saved['id']).status_code, 200)

    def test_public_id_is_not_edit_permission_and_revision_conflicts_preserve_data(self):
        saved = self.save(); url = '/api/boards/' + saved['id']
        self.assertEqual(self.client.put(url, json={"document": document()}).status_code, 403)
        self.assertEqual(self.client.delete(url).status_code, 403)
        headers = {'Authorization': 'Bearer ' + saved['ownerToken'], 'If-Match': '1'}
        changed = document(); changed['title'] = 'Owner changed'
        response = self.client.put(url, json={"document": changed}, headers=headers)
        self.assertEqual(response.status_code, 200); self.assertEqual(response.get_json()['revision'], 2)
        self.assertEqual(self.client.put(url, json={"document": document()}, headers=headers).status_code, 409)
        self.assertEqual(self.client.get(url).get_json()['document']['title'], 'Owner changed')
        self.assertEqual(self.client.delete(url, headers=headers).status_code, 200)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_version_schema_and_injection_shaped_assets_are_rejected(self):
        for key, value in [('schemaVersion', 99), ('engines', {"eht": "fake", "parameters": "fake", "formula": "fake"}), ('media', {"evil": "data:image/svg+xml,<svg onload='evil()'/>"})]:
            bad = document(); bad[key] = value
            self.assertEqual(self.client.post('/api/boards', json={"document": bad}).status_code, 400)
        self.assertEqual(self.client.post('/api/boards', json={'document': document(), 'ownerToken': 'client-made-token'}).status_code, 400)
        self.assertEqual(self.client.get('/api/boards/not-a-valid-id').status_code, 404)

    def test_limits_cross_origin_and_runtime_module_route(self):
        self.assertEqual(self.client.post('/api/boards', json={"document": document()}, headers={'Origin': 'https://attacker.invalid'}).status_code, 403)
        self.assertEqual(self.client.post('/api/boards', data='x' * (4 * 1024 * 1024 + 100000), content_type='application/json').status_code, 413)
        with self.client.get('/vendor/qrcode/qrcode.mjs') as response:
            self.assertEqual(response.status_code, 200)
        quota = create_app({"TESTING": True, "BOARD_DB": self.path, "BOARD_QUOTA": 1, "RATE_LIMIT": 100}).test_client()
        self.assertEqual(quota.post('/api/boards', json={"document": document()}).status_code, 201)
        self.assertEqual(quota.post('/api/boards', json={"document": document()}).status_code, 507)


if __name__ == '__main__':
    unittest.main()
