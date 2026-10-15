import { test, expect } from '@playwright/test';
import { diagramObjects } from '../data/recognition-fixtures.mjs';

async function ink(page) {
  await page.goto('/board'); await page.locator('[data-tool="pen"]').click(); const b = await page.locator('#board-canvas').boundingBox();
  await page.mouse.move(b.x + 90, b.y + 100); await page.mouse.down(); await page.mouse.move(b.x + 110, b.y + 140, { steps: 5 }); await page.mouse.up();
  await page.locator('[data-tool="select"]').click(); await page.locator('#board-canvas polyline').click({ force: true });
}
async function open(page) { await page.locator('#primary-actions').getByRole('button', { name: /^Read selection/ }).click(); await expect(page.locator('#recognition-preview')).toHaveAttribute('src', /^data:image\/png/); }
function proposal(text = 'NH3', kind = 'chemical-formula') { return { schemaVersion: 1, kind, text, levels: null, confidence: .91, ambiguities: ['Review handwriting before use.'] }; }
async function vision(page, value = proposal()) {
  await page.route('**/api/recognition/status', route => route.fulfill({ json: { available: true, provider: 'mock-provider', model: 'mock-vision' } }));
  let calls = 0;
  await page.route('**/api/recognition/read', route => { calls++; return route.fulfill({ json: { reading: value, provider: 'mock-provider', model: 'mock-vision', needsConfirmation: true, cacheHit: false } }); });
  return () => calls;
}

test('ink/selection never calls vision until preview consent; confirmation does not solve', async ({ page }) => {
  const count = await vision(page); await ink(page); expect(count()).toBe(0); await open(page); expect(count()).toBe(0);
  await expect(page.locator('#recognize-vision')).toBeDisabled(); await page.locator('#recognition-consent').check(); await page.locator('#recognize-vision').click();
  await expect(page.locator('#recognition-text')).toHaveValue('NH3'); expect(count()).toBe(1); await expect(page.locator('#accept-recognition')).toBeDisabled();
  await page.locator('#recognition-reviewed').check(); await page.locator('#accept-recognition').click(); await expect(page.locator('#board-canvas')).toContainText('NH3');
  await expect(page.locator('#board-canvas polyline')).toHaveCount(1); await expect(page.locator('#board-canvas')).not.toContainText('8 valence electrons');
  await page.locator('#primary-actions').getByRole('button', { name: /^Answer/ }).click(); await expect(page.locator('#board-canvas')).toContainText('8 valence electrons');
  await page.screenshot({ path: 'test-results/recognition-confirmed.png', fullPage: true });
});

test('manual correction overrides an uncertain reading, validates before inserting and is undoable', async ({ page }) => {
  await vision(page, { ...proposal('CH4'), confidence: .2, ambiguities: ['Could be NH3 or CH4.'] }); await ink(page); await open(page);
  await page.locator('#recognition-consent').check(); await page.locator('#recognize-vision').click(); await expect(page.locator('#recognition-text')).toHaveValue('CH4');
  await page.locator('#recognition-text').fill('NH3'); await page.locator('#recognition-reviewed').check(); await page.locator('#accept-recognition').click();
  await expect(page.locator('#interpretation')).toContainText('Read as NH3'); await page.locator('#undo-board').click(); await expect(page.locator('#board-canvas')).not.toContainText('NH3'); await expect(page.locator('#board-canvas polyline')).toHaveCount(1);
});

test('missing provider and offline paths retain manual input; bad grammar does not become a result', async ({ page, context }) => {
  await ink(page); await open(page); await expect(page.locator('#recognition-service')).toContainText('not configured'); await expect(page.locator('#recognize-vision')).toBeDisabled();
  await page.locator('#recognition-kind').selectOption('math-equation'); await page.locator('#recognition-text').fill('run_solver(999)'); await page.locator('#recognition-reviewed').check(); await page.locator('#accept-recognition').click();
  await expect(page.locator('#recognition-status')).toContainText('rejected'); await expect(page.locator('#board-canvas')).not.toContainText('999');
  await context.setOffline(true); await expect(page.locator('#recognition-service')).toContainText('Offline'); await page.locator('#recognition-text').fill('2x+3=7'); await page.locator('#recognition-reviewed').check(); await page.locator('#accept-recognition').click();
  await expect(page.locator('#interpretation')).toContainText('math equation'); await expect(page.locator('#board-canvas')).not.toContainText('Root 1: 2'); await context.setOffline(false);
});

test('stale selection invalidates a pending result and prevents applying it', async ({ page }) => {
  await page.route('**/api/recognition/status', route => route.fulfill({ json: { available: true, provider: 'mock', model: 'mock' } }));
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/recognition/read', async route => { await gate; try { await route.fulfill({ json: { reading: proposal(), provider: 'mock', model: 'mock' } }); } catch { /* aborted stale request */ } });
  await ink(page); await open(page); await page.locator('#recognition-consent').check(); await page.locator('#recognize-vision').click();
  await page.evaluate(() => document.getElementById('undo-board').click()); release();
  await expect(page.locator('#recognition-status')).toContainText('Selection changed'); await expect(page.locator('#accept-recognition')).toBeDisabled(); await expect(page.locator('#board-canvas')).not.toContainText('NH3');
});

test('local line/arrow proposal becomes a reviewed diagram and uses the existing solver comparison', async ({ page }) => {
  await page.goto('/board');
  const data = await page.evaluate(async objects => {
    const { emptyBoard } = await import('/dist/board/schema.js'), { makeSnapshot } = await import('/dist/board/snapshot.js'), { PRESETS } = await import('/dist/lab/model.js');
    const doc = emptyBoard(); doc.objects = objects; doc.systems.reference = makeSnapshot(PRESETS.O2.state); return doc;
  }, diagramObjects());
  await page.locator('#export-board').click(); await page.locator('#import-json').setInputFiles({ name: 'synthetic-diagram.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await page.locator('#export-dialog form button').click(); await page.locator('#fit-board').click();
  // Keyboard object list: Shift rectangle selection covers all generated strokes; no provider is contacted.
  const b = await page.locator('#board-canvas').boundingBox(); await page.mouse.move(b.x + 3, b.y + 3); await page.mouse.down(); await page.mouse.move(b.x + b.width - 3, b.y + b.height - 3, { steps: 5 }); await page.mouse.up();
  await open(page); await expect(page.locator('#recognition-score')).toContainText('local geometric'); await expect(page.locator('#recognition-text')).toHaveValue(/6: ↑/);
  await page.locator('#recognition-system').selectOption('reference'); await page.locator('#recognition-reviewed').check(); await page.locator('#accept-recognition').click();
  await page.locator('#primary-actions').getByRole('button', { name: /^Check diagram/ }).click(); await expect(page.locator('#board-canvas')).toContainText('match the solver');
});

test('only explicit consent enables a selected-example benchmark export', async ({ page }) => {
  await ink(page); await open(page); await expect(page.locator('#export-recognition-example')).toBeDisabled();
  await page.locator('#recognition-dialog summary').click();
  await page.locator('#recognition-kind').selectOption('chemical-formula'); await page.locator('#recognition-text').fill('NH3'); await page.locator('#recognition-export-consent').check();
  const waiting = page.waitForEvent('download'); await page.locator('#export-recognition-example').click(); const download = await waiting; expect(download.suggestedFilename()).toContain('recognition-example.json');
});
