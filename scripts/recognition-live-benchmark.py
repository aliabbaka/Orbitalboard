"""Explicit-cost live benchmark client. Never runs in CI or from a board event.

Run only with representative consented exports, provider configuration on the server,
and a separate --allow-upload flag. Export consent alone is not upload permission.
"""
import argparse
import json
from pathlib import Path
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=Path)
parser.add_argument('--server', default='http://127.0.0.1:5001')
parser.add_argument('--allow-upload', action='store_true')
parser.add_argument('--pilot', action='store_true', help='Allow fewer than 200 samples/5 writers; never qualifies as release evidence.')
args = parser.parse_args()
if not args.allow_upload:
    raise SystemExit('Refusing provider calls/cost: --allow-upload is required in addition to local example-export consent.')
samples = []
for path in sorted(args.directory.glob('*.json')):
    if path.stat().st_size > 1024 * 1024:
        raise SystemExit('An example exceeds its file cap.')
    sample = json.loads(path.read_text())
    if sample.get('grammarVersion') != 'ink-grammar-1.0.0' or sample.get('consent') != 'user-requested-local-export' or sample.get('origin') != 'user-contributed-unverified' or not sample.get('image'):
        raise SystemExit('Live evaluation accepts only versioned consented user exports with their selected PNG; synthetic geometry is excluded.')
    samples.append(sample)
writers = {s['writer'] for s in samples if s.get('writer')}
if not samples or (not args.pilot and (len(samples) < 200 or len(writers) < 5)):
    raise SystemExit('Need at least 200 representative examples across 5 pseudonymous writers, or explicitly choose --pilot. Samples still require human provenance/label review.')
with urllib.request.urlopen(args.server.rstrip('/') + '/api/recognition/status', timeout=5) as response:
    provider = json.load(response)
if not provider.get('available'):
    raise SystemExit('Vision provider is not configured. No images were uploaded.')
exact, failures, elapsed = 0, 0, []
for sample in samples:
    request = urllib.request.Request(args.server.rstrip('/') + '/api/recognition/read', method='POST',
        data=json.dumps({'image': sample['image'], 'hint': 'auto', 'consent': True}).encode(), headers={'Content-Type': 'application/json'})
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            result = json.load(response)
        expected = sample['corrected']
        if result['reading']['kind'] == expected['kind'] and result['reading']['text'] == expected['text']:
            exact += 1
    except (urllib.error.URLError, KeyError, ValueError):
        failures += 1
    elapsed.append((time.perf_counter() - start) * 1000)
    # Respect the local request cap; do not silently hammer a paid service.
    if len(elapsed) % 6 == 0:
        time.sleep(61)
elapsed.sort()
print(json.dumps({'provider': provider.get('provider'), 'model': provider.get('model'), 'samples': len(samples), 'writers': len(writers),
    'exact': exact, 'exactMatchRate': exact / len(samples), 'requestFailures': failures, 'p95ms': elapsed[max(0, int(.95 * len(elapsed) + .999) - 1)],
    'qualification': 'PILOT/UNVERIFIED: targets and writer/label provenance require agreement and review; counts alone do not prove handwriting readiness.'}, indent=2))
