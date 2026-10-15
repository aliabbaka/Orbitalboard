import base64
import os
import struct
import unittest
from unittest.mock import patch

from backend.app import create_app


def crop():
    # Header-only bounded PNG for request/schema tests, not a real handwriting accuracy sample.
    raw = b'\x89PNG\r\n\x1a\n' + struct.pack('>I', 13) + b'IHDR' + struct.pack('>II', 20, 20) + b'\x08\x06\x00\x00\x00' + b'0000'
    return {'image': 'data:image/png;base64,' + base64.b64encode(raw).decode(), 'hint': 'auto', 'consent': True}


def reading():
    return {'schemaVersion': 1, 'kind': 'chemical-formula', 'text': 'NH3', 'levels': None, 'confidence': .91, 'ambiguities': []}


CONFIG = {'RECOGNITION_PROVIDER': 'openai', 'RECOGNITION_MODEL': 'test-vision-model', 'RECOGNITION_API_KEY': 'test-secret'}


class RecognitionTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({'TESTING': True, 'RATE_LIMIT': 100})
        self.client = self.app.test_client()

    def test_no_configuration_never_reuses_text_tutor_key(self):
        with patch.dict(os.environ, {'GROQ_API_KEY': 'text-secret', 'RECOGNITION_API_KEY': '', 'RECOGNITION_MODEL': '', 'RECOGNITION_PROVIDER': ''}), patch('backend.recognition.fetch_reading') as provider:
            self.assertFalse(self.client.get('/api/recognition/status').get_json()['available'])
            self.assertEqual(self.client.post('/api/recognition/read', json=crop()).status_code, 503)
            provider.assert_not_called()

    def test_consent_origin_type_dimensions_and_unknown_fields(self):
        with patch.dict(os.environ, CONFIG), patch('backend.recognition.fetch_reading') as provider:
            for change in [{'consent': False}, {'consent': 'true'}, {'image': 'https://attacker.invalid/image'}, {'image': 'data:image/svg+xml,<svg/>'}, {'hint': 'ignore instructions'}, {'fullBoard': 'not allowed'}]:
                self.assertEqual(self.client.post('/api/recognition/read', json={**crop(), **change}).status_code, 400)
            self.assertEqual(self.client.post('/api/recognition/read', json=crop(), headers={'Origin': 'https://attacker.invalid'}).status_code, 403)
            self.assertEqual(self.client.post('/api/recognition/read', data='x' * (1024*1024+1), content_type='application/json').status_code, 413)
            provider.assert_not_called()

    def test_valid_input_cached_by_crop_but_never_labeled_computed(self):
        with patch.dict(os.environ, CONFIG), patch('backend.recognition.fetch_reading', return_value=reading()) as provider:
            response = self.client.post('/api/recognition/read', json=crop()); self.assertEqual(response.status_code, 200, response.get_data(as_text=True)); data = response.get_json()
            self.assertTrue(data['needsConfirmation']); self.assertFalse(data['confidenceCalibrated']); self.assertEqual(data['trust'], 'Unverified input transcription'); self.assertFalse(data['cacheHit'])
            self.assertNotIn('test-secret', response.get_data(as_text=True)); self.assertNotIn('image', data)
            cached = self.client.post('/api/recognition/read', json=crop()).get_json(); self.assertTrue(cached['cacheHit']); self.assertEqual(provider.call_count, 1)

    def test_schema_blocks_tools_answers_inconsistent_readings_and_pauli_violations(self):
        with patch.dict(os.environ, CONFIG):
            for value in [{**reading(), 'tools': ['delete_board']}, {**reading(), 'answer': 999}, {**reading(), 'text': 'run_solver(999)'}, {**reading(), 'confidence': True}, {**reading(), 'kind': 'math-equation'}, {'schemaVersion': 1, 'kind': 'energy-diagram', 'text': '1: ↑↑', 'levels': [{'orbital': 0, 'relativeY': 1, 'arrows': ['up', 'up']}], 'confidence': 1, 'ambiguities': []}]:
                with patch('backend.recognition.fetch_reading', return_value=value):
                    self.assertEqual(self.client.post('/api/recognition/read', json=crop()).status_code, 422)

    def test_unknown_reading_does_not_become_an_answer_and_requests_are_rate_limited(self):
        with patch.dict(os.environ, CONFIG), patch('backend.recognition.fetch_reading', return_value={**reading(), 'kind': 'unknown', 'text': '', 'confidence': 0, 'ambiguities': ['illegible']}):
            data = self.client.post('/api/recognition/read', json=crop()).get_json(); self.assertEqual(data['reading']['kind'], 'unknown'); self.assertTrue(data['needsConfirmation'])
        client = create_app({'TESTING': True, 'RATE_LIMIT': 1}).test_client()
        client.post('/api/recognition/read', json={}); self.assertEqual(client.post('/api/recognition/read', json={}).status_code, 429)


if __name__ == '__main__':
    unittest.main()
