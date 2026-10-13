import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

async function write(page, text = 'NH3') {
  await page.locator('[data-tool="text"]').click(); await page.locator('#board-canvas').click({ position: { x: 90, y: 95 } });
  await page.locator('#object-text').fill(text); await page.locator('#insert-text').click();
  await expect(page.locator('#interpretation')).toContainText(text.includes('NH3') ? 'Read as NH3' : 'selected');
}
async function primary(page, label) { await page.locator('#primary-actions').getByRole('button', { name: new RegExp(`^${label}`) }).click(); }
async function model(page) {
  await page.goto('/board'); await write(page); await primary(page, '3D model');
  const frame = page.frameLocator('#lab-frame'); await expect(frame.locator('#view-trust')).toHaveText('✓ COMPUTED'); await expect(frame.locator('#pin-lab')).toBeEnabled(); return frame;
}

test('typed selection requires an action; answer, undo, redo, replay and local JSON round-trip', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.goto('/board'); await write(page);
  await expect(page.locator('#board-canvas')).not.toContainText('8 valence electrons');
  await primary(page, 'Answer'); await expect(page.locator('#board-canvas')).toContainText('8 valence electrons');
  await page.locator('#undo-board').click(); await expect(page.locator('#board-canvas')).not.toContainText('8 valence electrons');
  await page.locator('#redo-board').click(); await expect(page.locator('#board-canvas')).toContainText('8 valence electrons');
  await page.locator('#save-local').click(); await expect(page.locator('#board-status')).toContainText('saved locally');
  await page.reload(); await page.locator('#restore-local').click(); await expect(page.locator('#board-canvas')).toContainText('8 valence electrons');
  await page.locator('#export-board').click(); const download = page.waitForEvent('download'); await page.locator('#board-json').click();
  const file = await download; const document = JSON.parse(await readFile(await file.path(), 'utf8')); expect(document.schemaVersion).toBe(1); expect(document.engines.eht).toBe('0.1.0'); expect(document.events).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('system builder, orbital results and student diagram checks need no AI', async ({ page }) => {
  await page.goto('/board'); await page.locator('#system-builder').click(); await page.locator('#builder-preset').selectOption('O2'); await page.locator('#builder-load-preset').click(); await page.locator('#insert-system').click();
  await primary(page, 'Orbitals'); await expect(page.locator('#board-canvas')).toContainText('2 unpaired');
  await primary(page, 'Your diagram'); await page.locator('#ladder-text').fill('1: ↑↓\n2: ↑↓\n3: ↑↓\n4: ↑↓\n5: ↑↓\n6: ↑↓\n7:\n8:'); await page.locator('#apply-ladder').click();
  await primary(page, 'Check diagram'); await expect(page.locator('#board-canvas')).toContainText('mismatches');
});

test('lab pin, editable notes, source-preserving reopening, PNG/SVG and Markdown assets', async ({ page, context }) => {
  const frame = await model(page); const energy = await frame.locator('#selected-energy').textContent();
  await frame.locator('#pin-lab').click(); await expect(page.locator('#pin-count')).toHaveText('1'); await page.locator('#close-lab').click();
  await page.getByLabel('Pin title', { exact: true }).fill('Ammonia HOMO'); await page.getByLabel('Pin title', { exact: true }).press('Tab');
  await page.getByLabel('Pin caption', { exact: true }).fill('My own revision note.'); await page.getByLabel('Pin caption', { exact: true }).press('Tab');
  const popupPromise = context.waitForEvent('page'); await page.locator('.pin-card').getByRole('button', { name: 'Reopen', exact: true }).click(); const popup = await popupPromise;
  await expect(popup.locator('#view-trust')).toHaveText('✓ COMPUTED'); await expect(popup.locator('#selected-energy')).toHaveText(energy); await expect(popup.locator('#charge')).toBeDisabled();
  const svgDownload = page.waitForEvent('download'); await page.locator('.pin-card').getByRole('button', { name: 'SVG', exact: true }).click(); const svg = await readFile(await (await svgDownload).path(), 'utf8');
  expect(svg).toContain('sto3g-yaehmop-1.0.0'); expect(svg).toContain('My own revision note.'); expect(svg).toContain('snapshot='); expect(svg).toContain('<desc>');
  const pngDownload = page.waitForEvent('download'); await page.locator('.pin-card').getByRole('button', { name: 'PNG', exact: true }).click(); const pngFile = await pngDownload; await pngFile.saveAs('test-results/note-card.png'); const png = await readFile(await pngFile.path()); expect(png.subarray(1, 4).toString()).toBe('PNG');
  const decoded = PNG.sync.read(png), qr = jsQR(new Uint8ClampedArray(decoded.data), decoded.width, decoded.height); expect(qr?.data).toContain('/#snapshot=');
  const zipDownload = page.waitForEvent('download'); await page.locator('#download-sheet').click(); const zip = await readFile(await (await zipDownload).path()); expect(zip.subarray(0, 2).toString()).toBe('PK');
  await page.screenshot({ path: 'test-results/board-notebook.png', fullPage: true });
});

test('public links are read-only, owner updates are separate, remix leaves original unchanged', async ({ page, browser }) => {
  await page.goto('/board'); await write(page); await primary(page, 'Answer'); await page.locator('#share-board').click(); await page.locator('#save-shared').click();
  await expect(page.locator('#shared-link')).toHaveValue(/\/b\/[A-Za-z0-9_-]{24}$/); const url = await page.locator('#shared-link').inputValue(); await expect(page.locator('#share-qr svg')).toBeVisible();
  const readerContext = await browser.newContext(); const reader = await readerContext.newPage(); await reader.goto(url);
  await expect(reader.locator('#board-access')).toContainText('READ ONLY'); await expect(reader.locator('#board-canvas')).toContainText('8 valence electrons'); await expect(reader.locator('[data-tool="pen"]')).toBeDisabled(); await expect(reader.locator('#owner-edit')).toBeHidden();
  await reader.locator('#remix-board').click(); await expect(reader.locator('[data-tool="pen"]')).toBeEnabled(); await reader.reload(); await expect(reader.locator('#board-access')).toContainText('READ ONLY');
  const id = url.split('/').at(-1); const response = await readerContext.request.put(new URL(`/api/boards/${id}`, url).href, { data: { document: {} } }); expect(response.status()).toBe(403);
  await readerContext.close();
});

test('ink is semantic, rectangle selection supports mixed content, erasing is undoable', async ({ page }) => {
  await page.goto('/board'); await page.locator('[data-tool="pen"]').click(); const canvas = await page.locator('#board-canvas').boundingBox();
  await page.mouse.move(canvas.x + 80, canvas.y + 80); await page.mouse.down(); await page.mouse.move(canvas.x + 140, canvas.y + 130, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('#board-canvas polyline')).toHaveCount(1); const darkStroke = await page.locator('#board-canvas polyline').getAttribute('stroke');
  await page.locator('#board-theme').click(); expect(await page.locator('#board-canvas polyline').getAttribute('stroke')).not.toBe(darkStroke);
  await page.locator('[data-tool="select"]').click(); await page.mouse.move(canvas.x + 60, canvas.y + 60); await page.mouse.down(); await page.mouse.move(canvas.x + 160, canvas.y + 150, { steps: 4 }); await page.mouse.up(); await expect(page.locator('#interpretation')).toContainText('Ink stays ink');
  await page.locator('[data-tool="eraser"]').click(); await page.locator('#board-canvas polyline').click({ force: true }); await expect(page.locator('#board-canvas polyline')).toHaveCount(0);
  await page.locator('#undo-board').click(); await expect(page.locator('#board-canvas polyline')).toHaveCount(1);
});

test('model files re-import with named phases and current source metadata', async ({ page }) => {
  await page.goto('/'); await page.locator('#preset').selectOption('H2'); await page.locator('#solve').click(); await expect(page.locator('#pin-lab')).toBeEnabled();
  await page.locator('#export-model').click();
  for (const format of ['glb', 'obj', 'ply', 'cube', 'xyz']) {
    await page.locator('#model-format').selectOption(format); const waiting = page.waitForEvent('download'); await page.locator('#model-download').click(); const file = await waiting; const buffer = await readFile(await file.path()); expect(buffer.length).toBeGreaterThan(100);
    if (format === 'glb') {
      const imported = await page.evaluate(async bytes => {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'); const data = new Uint8Array(bytes).buffer;
        const gltf = await new GLTFLoader().parseAsync(data, ''); const names = []; let version = null;
        gltf.scene.traverse(o => { names.push(o.name); if (o.userData.solverVersion) version = o.userData.solverVersion; }); return { names, version };
      }, [...buffer]); expect(imported.names).toContain('phase_positive'); expect(imported.version).toBe('0.1.0');
    }
  }
  await page.locator('#model-format').selectOption('stl'); await page.locator('#model-download').click(); await expect(page.locator('#model-export-status')).toContainText('restricted');
  await page.locator('#export-phase').selectOption('positive'); await page.locator('#export-atoms').uncheck(); const waiting = page.waitForEvent('download'); await page.locator('#model-download').click(); const stl = await readFile(await (await waiting).path(), 'utf8'); expect(stl).toContain('facet normal');
});

test('print-friendly study sheet is actual PDF, not an unchecked browser stub', async ({ page }) => {
  const frame = await model(page); await frame.locator('#pin-lab').click(); await expect(page.locator('#pin-count')).toHaveText('1'); await page.locator('#close-lab').click();
  await page.evaluate(() => { window.print = () => {}; }); await page.locator('#print-sheet').click(); await expect(page.locator('#print-area img')).toHaveCount(1);
  await page.emulateMedia({ media: 'print' }); const pdf = await page.pdf({ format: 'A4', printBackground: true }); expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
});

test('mobile board and malformed imports retain current work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/board'); await write(page);
  await page.locator('#export-board').click(); await page.locator('#import-json').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":99}') });
  await expect(page.locator('#board-status')).toContainText('current work retained'); await expect(page.locator('#board-canvas')).toContainText('NH3'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/board-mobile.png', fullPage: true });
});

test('pinning a new board does not overwrite an older local notebook', async ({ page }) => {
  const frame = await model(page); await frame.locator('#pin-lab').click(); await expect(page.locator('#pin-count')).toHaveText('1'); await page.locator('#close-lab').click();
  await page.getByLabel('Pin title', { exact: true }).fill('First retained note'); await page.getByLabel('Pin title', { exact: true }).press('Tab');
  await expect(page.locator('#board-status')).toContainText('Notebook note saved locally');
  await page.goto('/board'); await write(page, 'Second board note'); await primary(page, 'Pin'); await expect(page.locator('#board-status')).toContainText('saved in the local notebook');
  await page.locator('#restore-notebook').click(); await expect(page.locator('#pin-count')).toHaveText('2'); await expect(page.getByLabel('Pin title', { exact: true }).first()).toHaveValue('Board snapshot'); await expect(page.getByLabel('Pin title', { exact: true }).nth(1)).toHaveValue('First retained note');
});

test('board-region pins reopen their frozen text after the source is edited', async ({ page, context }) => {
  await page.goto('/board'); await write(page, 'Original frozen region'); await primary(page, 'Pin'); await expect(page.locator('#pin-count')).toHaveText('1');
  await primary(page, 'Edit text'); await page.locator('#object-text').fill('New unrelated draft text'); await page.locator('#insert-text').click();
  const waiting = context.waitForEvent('page'); await page.locator('.pin-card').getByRole('button', { name: 'Reopen', exact: true }).click(); const reopened = await waiting;
  await expect(reopened.locator('#board-access')).toContainText('READ ONLY'); await expect(reopened.locator('#board-canvas')).toContainText('Original frozen region'); await expect(reopened.locator('#board-canvas')).not.toContainText('New unrelated draft text');
});
