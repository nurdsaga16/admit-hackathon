import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', grepInvert: /real Chromium WASM|module integration/,
  timeout: 90000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3002', headless: true },
  webServer: { command: 'node ../server/index.mjs', url: 'http://127.0.0.1:3002/api/health', env: { PORT: '3002', STUN_URLS: '' } },
});
