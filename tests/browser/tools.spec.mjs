import { test, expect } from '@playwright/test';

async function choose(page, title) { await page.locator('#solver-list').getByRole('button', { name: title, exact: true }).click(); }
async function run(page) { await page.locator('#run-solver').click(); await expect(page.locator('#result-trust')).toContainText('✓ COMPUTED'); }

test('registry formulas, exact balance and units are computed only after an action', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tools'); await expect(page.locator('body')).toHaveAttribute('data-calculation-count', '0');
  await expect(page.locator('#solver-list button')).toHaveCount(21); await run(page);
  await expect(page.locator('[data-value="equation"]')).toContainText('2H2 + O2 → 2H2O');
  await choose(page, 'Molar mass'); await page.locator('#field-formula').fill('Ca(OH)2'); await run(page); await expect(page.locator('[data-value="mass"]')).toContainText('74.092');
  await choose(page, 'Units / dimensions checker'); await page.getByLabel('Quantity unit', { exact: true }).fill('g'); await page.locator('#field-target').fill('L'); await page.locator('#run-solver').click(); await expect(page.locator('#solver-status')).toContainText('Inconsistent units');
  expect(errors).toEqual([]);
});

test('math derivatives, polynomial integrals and pH/titration show methods and model limits', async ({ page }) => {
  await page.goto('/tools'); await choose(page, 'Differentiate'); await page.locator('#field-expression').fill('x^3'); await run(page); await expect(page.locator('[data-value="derivative"]')).toContainText('3');
  await choose(page, 'Integrate polynomial'); await run(page); await expect(page.locator('[data-value="integral"]')).toContainText('3');
  await page.locator('#field-expression').fill('sin(x)'); await page.locator('#run-solver').click(); await expect(page.locator('#solver-status')).toContainText('polynomial');
  await choose(page, 'pH / pOH'); await run(page); await expect(page.locator('[data-value="pH"]')).toContainText('3.000'); await expect(page.locator('#solver-warnings')).toContainText('25 °C');
  await choose(page, 'Strong acid/base titration'); await run(page); await expect(page.locator('#solver-graph svg')).toBeVisible(); await expect(page.locator('[data-value="equivalenceVolume"]')).toContainText('25');
  await page.screenshot({ path: 'test-results/tier2-tools.png', fullPage: true });
});

test('periodic source facts are distinct from EHT element verification', async ({ page }) => {
  await page.goto('/tools'); await page.locator('#tab-periodic').click(); await page.getByRole('button', { name: 'Lithium Li, atomic number 3', exact: true }).click(); await expect(page.locator('#element-details')).toContainText('6.94');
  await page.getByRole('button', { name: 'Technetium Tc, atomic number 43', exact: true }).click(); await expect(page.locator('#element-details')).toContainText('No CIAAW standard weight');
  await page.screenshot({ path: 'test-results/periodic-reference.png', fullPage: true });
});

test('board typed equation dispatch, source-frozen results and old document migration', async ({ page }) => {
  await page.goto('/board'); await page.locator('[data-tool="text"]').click(); await page.locator('#board-canvas').click({ position: { x: 90, y: 90 } }); await page.locator('#object-text').fill('2x + 3 = 7'); await page.locator('#insert-text').click();
  await expect(page.locator('#interpretation')).toContainText('math equation'); await expect(page.locator('#board-canvas')).not.toContainText('Root 1:');
  await page.locator('#primary-actions').getByRole('button', { name: /^Answer/ }).click(); await expect(page.locator('#board-canvas')).toContainText('Root 1: 2');
  const migrated = await page.evaluate(async () => {
    const { emptyBoard, parseBoard } = await import('/dist/board/schema.js'); const legacy = emptyBoard(); legacy.schemaVersion = 1; delete legacy.engines.registry; return parseBoard(legacy);
  }); expect(migrated.schemaVersion).toBe(2); expect(migrated.engines.eht).toBe('0.1.0');
});

test('offline calculators, board, orbital worker and periodic data reload without cached private APIs', async ({ page, context }) => {
  await page.goto('/tools'); await expect(page.locator('#offline-status')).toHaveText('OFFLINE ASSETS READY', { timeout: 30000 }); await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true); await page.reload(); await choose(page, 'Molar mass'); await run(page); await expect(page.locator('[data-value="mass"]')).toContainText('18.015');
  await page.goto('/board'); await expect(page.locator('#board-canvas')).toBeVisible();
  await page.goto('/'); await page.locator('#preset').selectOption('O2'); await page.locator('#solve').click(); await expect(page.locator('#unpaired')).toHaveText('2');
  const cachedPrivate = await page.evaluate(async () => { const urls = []; for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) urls.push(request.url); return urls.some(url => new URL(url).pathname.startsWith('/api/') || new URL(url).pathname.startsWith('/b/')); });
  expect(cachedPrivate).toBe(false); await expect(page.locator('#explain')).toBeDisabled(); await context.setOffline(false);
});

test('calculator workbench can insert its source-backed result into a board without AI', async ({ page }) => {
  await page.goto('/board'); await page.locator('#calculator-tools').click(); const tools = page.frameLocator('#tools-frame'); await expect(tools.locator('#solver-title')).toContainText('Balance');
  await tools.locator('#run-solver').click(); await expect(tools.locator('#result-trust')).toContainText('✓ COMPUTED'); await tools.locator('#add-calculation-board').click();
  await expect(page.locator('#tools-dialog')).not.toBeVisible(); await expect(page.locator('#board-canvas')).toContainText('2H2 + O2 → 2H2O');
});
