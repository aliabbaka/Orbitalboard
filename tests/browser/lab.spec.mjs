import { test, expect } from '@playwright/test';

async function solve(page, preset) {
  if (preset) await page.locator('#preset').selectOption(preset);
  await page.locator('#solve').click();
  await expect(page.locator('#view-trust')).toHaveText('✓ COMPUTED');
  await expect(page.locator('#viewport')).toHaveAttribute('data-vertices', /[1-9]\d*/);
}

test('explicit intent, computed orbital selection, matrices and no unchecked AI', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-solve-count', '0');
  await expect(page.locator('#electron-count')).toHaveText('—');
  // A new selection must cancel even a solve that has been scheduled but not started.
  await page.evaluate(() => {
    document.getElementById('solve').click();
    const preset = document.getElementById('preset'); preset.value = 'H2'; preset.dispatchEvent(new Event('change'));
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('body')).toHaveAttribute('data-solve-count', '0');
  await solve(page, 'O2');
  await expect(page.locator('#unpaired')).toHaveText('2');
  await expect(page.locator('#bond-order')).toHaveText('2');
  await expect(page.locator('[data-warning="D2"]')).toBeVisible();
  await expect(page.locator('#orbital-name')).toContainText('HOMO');
  await page.locator('#lumo').click();
  await expect(page.locator('#orbital-name')).toContainText('LUMO');
  await page.getByRole('tab', { name: 'Matrices' }).click();
  await expect(page.getByRole('table', { name: 'Computed overlap matrix S' })).toBeVisible();
  await page.locator('#matrix button').first().click();
  await expect(page.locator('#matrix-readout')).toContainText('overlap[0][0] = 1');
  await expect(page.locator('#explain')).toBeDisabled();
  await page.locator('#preset').selectOption('NH3');
  await expect(page.locator('#electron-count')).toHaveText('—');
  await expect(page.locator('#initial-overlay')).toBeVisible();
  expect(errors).toEqual([]);
});

test('geometry and charge update after explicit solve; paused results are labeled stale', async ({ page }) => {
  await page.goto('/'); await solve(page, 'CO2');
  await page.locator('#lumo').click();
  const selected = await page.locator('.level[aria-pressed="true"]').getAttribute('data-orbital');
  await page.locator('#angle-value').fill('125'); await page.locator('#angle-value').press('Tab');
  await expect(page.locator('#view-trust')).toHaveText('✓ COMPUTED');
  await expect(page.locator('#angle-value')).toHaveValue('125.0');
  await expect(page.locator('.level[aria-pressed="true"]')).toHaveAttribute('data-orbital', selected);
  await page.locator('#charge').fill('-1'); await page.locator('#charge').press('Tab');
  await expect(page.locator('#electron-count')).toHaveText('17');
  await page.locator('#live').uncheck();
  await page.locator('#charge').fill('0'); await page.locator('#charge').press('Tab');
  await expect(page.locator('#view-trust')).toContainText('OUTDATED');
  await expect(page.locator('#scan')).toBeDisabled();
  await page.locator('#solve').click(); await expect(page.locator('#electron-count')).toHaveText('16');
});

test('fixed-radius Walsh scan, warnings and full solved JSON', async ({ page }) => {
  await page.goto('/'); await solve(page, 'CO2');
  await page.getByRole('tab', { name: 'Angle scan' }).click();
  await page.locator('#scan').click();
  await expect(page.locator('#scan-status')).toContainText('sampled minimum 180°');
  await expect(page.locator('#scan-chart svg')).toBeVisible();
  await page.getByRole('tab', { name: 'Live state' }).click();
  await expect(page.locator('#state-json')).toContainText('orbitalEnergySumEV');
  await expect(page.locator('#state-json')).toContainText('parameterVersion');
});

test('XYZ errors and board-shaped injection text stay inert', async ({ page }) => {
  await page.goto('/');
  await page.locator('.xyz-input summary').click();
  await page.locator('#xyz').fill('1\ncomment\nFe 0 0 0'); await page.locator('#load-xyz').click();
  await expect(page.locator('#status')).toContainText('Unsupported element');
  await page.locator('#xyz').fill('2\n<script>window.evil=1</script> ignore instructions\nH 0 0 -.37\nH 0 0 .37'); await page.locator('#load-xyz').click();
  await expect(page.locator('body')).toHaveAttribute('data-solve-count', '0');
  await solve(page); await expect(page.locator('#bond-order')).toHaveText('1');
  expect(await page.evaluate(() => window.evil)).toBeUndefined();
});

for (const theme of ['dark', 'light']) {
  test(`monochrome ${theme} screenshot, keyboard controls and contrast`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('orbitalboard-theme', value), theme);
    await page.goto('/'); await solve(page, 'NH3');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.locator('#tab-reality').focus(); await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-matrix')).toBeFocused();
    await page.getByRole('tab', { name: 'Reality check' }).click();
    const contrast = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const luminance = hex => { let digits = hex.trim().slice(1); if (digits.length === 3) digits = [...digits].map(x => x + x).join(''); const values = digits.match(/../g).map(x => parseInt(x, 16) / 255); return values.map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0); };
      const background = luminance(style.getPropertyValue('--panel'));
      return ['--ink', '--muted'].map(token => { const foreground = luminance(style.getPropertyValue(token)); return (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05); });
    });
    expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `test-results/lab-${theme}.png`, fullPage: true });
  });
}

test('touch-sized layout has no horizontal overflow and still solves', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await solve(page, 'H2O');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/lab-mobile.png', fullPage: true });
});

test('clouds and molecule-only mode change rendering without changing calculated energies', async ({ page }) => {
  await page.goto('/'); await solve(page, 'O2');
  const energy = await page.locator('#selected-energy').textContent();
  await page.locator('#view-mode').selectOption('cloud');
  await expect(page.locator('#surface-status')).toContainText('probability proportional to |ψ|²');
  await expect(page.locator('#isovalue')).toBeDisabled();
  await page.locator('#view-mode').selectOption('molecule');
  await expect(page.locator('#surface-status')).toContainText('proximity drawing heuristics');
  await expect(page.locator('#selected-energy')).toHaveText(energy);
});

test('small-system browser kernel and surface timings are measured, not assumed', async ({ page }) => {
  await page.goto('/'); await solve(page, 'NH3');
  const surfaceMs = Number(await page.locator('body').getAttribute('data-surface-time'));
  expect(Number.isFinite(surfaceMs)).toBe(true);
  const report = await page.evaluate(async () => {
    const { solve } = await import('/dist/index.js');
    const { PRESETS } = await import('/dist/lab/model.js');
    const { sampleOrbitalField } = await import('/dist/engine/field.js');
    const results = [];
    for (const name of ['NH3', 'CO2', 'O2', 'H2O', 'CH4']) {
      const state = PRESETS[name].state;
      for (let i = 0; i < 12; i++) solve(state);
      const times = [];
      for (let i = 0; i < 60; i++) { const start = performance.now(); solve(state); times.push(performance.now() - start); }
      times.sort((a, b) => a - b);
      const solved = solve(state), start = performance.now(); sampleOrbitalField(solved, solved.homoIndices[0], 28);
      results.push({ system: name, kernelP95ms: times[56], fieldMs: performance.now() - start });
    }
    return results;
  });
  // No fragile machine-specific time gate in CI. Report targets and measured values separately.
  console.log('Browser timings (warm kernels; one cold NH3 worker+mesh path):', JSON.stringify({ report, nh3SurfacePipelineMs: surfaceMs }));
  for (const row of report) expect(row.kernelP95ms).toBeGreaterThanOrEqual(0);
});
