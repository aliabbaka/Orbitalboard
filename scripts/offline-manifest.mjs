import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [];
async function walk(path) { for (const entry of await readdir(path, { withFileTypes: true })) { const filename = join(path, entry.name); if (entry.isDirectory()) await walk(filename); else if (entry.name.endsWith('.js')) files.push(filename); } }
await walk(join(root, 'dist'));
// Recursively include only the locally used three.js module graph, not the entire examples library.
const three = join(root, 'node_modules/three'); const seen = new Set();
async function vendor(path) {
  path = resolve(path); if (!path.startsWith(three + '/') || seen.has(path)) return; seen.add(path);
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) { const name = match[1]; if (name === 'three') await vendor(join(three, 'build/three.module.js')); else if (name.startsWith('.')) await vendor(resolve(dirname(path), name)); }
}
await vendor(join(three, 'build/three.module.js'));
for (const path of ['controls/OrbitControls.js', 'objects/MarchingCubes.js', 'exporters/GLTFExporter.js', 'exporters/OBJExporter.js', 'exporters/STLExporter.js']) await vendor(join(three, 'examples/jsm', path));
const list = files.map(path => ({ url: '/' + relative(root, path).replaceAll('\\', '/'), path }));
for (const path of seen) list.push({ url: '/vendor/three/' + relative(three, path).replaceAll('\\', '/'), path });
for (const [url, path] of [['/', 'web/index.html'], ['/board', 'web/board.html'], ['/tools', 'web/tools.html'], ['/styles.css', 'web/styles.css'], ['/board.css', 'web/board.css'], ['/tools.css', 'web/tools.css'], ['/favicon.svg', 'web/favicon.svg'], ['/vendor/qrcode/qrcode.mjs', 'node_modules/qrcode-generator/dist/qrcode.mjs'], ['/vendor/fflate/browser.js', 'node_modules/fflate/esm/browser.js']]) list.push({ url, path: join(root, path) });
const hash = createHash('sha256'); for (const item of [...list].sort((a, b) => a.url.localeCompare(b.url))) { hash.update(item.url); hash.update(await readFile(item.path)); }
const manifest = { version: 'orbitalboard-0.4-' + hash.digest('hex').slice(0, 16), assets: [...new Set(list.map(item => item.url))] };
await writeFile(join(root, 'web/offline-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Offline manifest: ${manifest.assets.length} public code/shell assets; no user/API data.`);
