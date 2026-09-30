import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 90000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true },
  webServer: [
    { command: 'npm --prefix ../server start', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: !process.env.CI, env: { STUN_URLS: '' } },
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
  ],
});
