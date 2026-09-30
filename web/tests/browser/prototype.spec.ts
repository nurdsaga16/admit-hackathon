import { test, expect } from '@playwright/test';
test('real Chromium WASM matches Python Keras and features on 32 synthetic inputs', async ({ page }) => {
  await page.goto('/tests/parity.html');
  const result = await page.evaluate(async () => {
    // Vite serves the same production modules to an actual browser.
    const { GestureModel } = await import('/src/model.ts');
    const { features, normalize } = await import('/src/core.ts');
    const fixture = await (await fetch('/tests/fixtures/parity.json')).json();
    const model = await GestureModel.load();
    let featureError = 0, normalizedError = 0, outputError = 0, argmaxMatches = 0;
    const diff = (a: number[], b: number[]) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
    try {
      for (const sample of fixture.cases) {
        let input = Float32Array.from(sample.normalized.flat());
        if (sample.frames) {
          const rows = Array.from({ length: 5 }, (_, i) => features(sample.frames.slice(i * 7, i * 7 + 7), model.meta.featureOrder));
          featureError = Math.max(featureError, diff(rows.flat(), sample.features.flat()));
          input = normalize(rows, model.meta);
          normalizedError = Math.max(normalizedError, diff(Array.from(input), sample.normalized.flat()));
        }
        const output = await model.predictNormalized(input);
        if (!output.every(Number.isFinite)) throw new Error('Nonfinite output');
        outputError = Math.max(outputError, diff(output, sample.output));
        if (output.indexOf(Math.max(...output)) === sample.output.indexOf(Math.max(...sample.output))) argmaxMatches++;
      }
      return { featureError, normalizedError, outputError, argmaxMatches, count: fixture.cases.length };
    } finally { await model.dispose(); }
  });
  console.log('BROWSER_PARITY', JSON.stringify(result));
  expect(result.featureError).toBeLessThanOrEqual(1e-10);
  expect(result.normalizedError).toBeLessThanOrEqual(2e-6);
  expect(result.outputError).toBeLessThanOrEqual(1e-5);
  expect(result.argmaxMatches).toBe(result.count);
});
test('denied camera permission is actionable and creates no messages', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.goto('/?mode=local');
  await page.getByRole('button', { name: 'Включить камеру' }).click();
  await expect(page.getByRole('alert')).toContainText('Разреши камеру');
  await expect(page.getByRole('button', { name: 'Подтвердить слово' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Включить камеру' })).toBeEnabled();
});
test('mobile layout fits screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mode=local');
  await expect(page.getByText('afternoon', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
test('real MediaPipe and model load with synthetic camera; stop releases tracks and restart works', async ({ baseURL }) => {
  const { chromium } = await import('@playwright/test');
  const cameraBrowser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const page = await cameraBrowser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as any).__streams = [];
    navigator.mediaDevices.getUserMedia = async c => { const s = await get(c); (window as any).__streams.push(s); return s; };
  });
  try {
    await page.goto(`${baseURL}/?mode=local`);
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Включить камеру' }).click();
      await expect(page.getByText('Руки не видны.', { exact: false })).toBeVisible({ timeout: 60000 });
      await expect(page.getByRole('button', { name: 'Подтвердить слово' })).toBeDisabled();
      if (i === 0) await page.screenshot({ path: 'test-results/camera.png', fullPage: true });
      await page.getByRole('button', { name: 'Остановить' }).click();
      await expect(page.getByRole('button', { name: 'Включить камеру' })).toBeEnabled();
      expect(await page.evaluate(() => (window as any).__streams.every((s: MediaStream) => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally { await cameraBrowser.close(); }
});
