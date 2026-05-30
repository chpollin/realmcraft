import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 4173;
const baseURL = `http://localhost:${PORT}`;

// E2E and visual specs live under tests/e2e and tests/visual as *.spec.js.
// Unit tests (node:test) live under tests/unit as *.test.js and are run separately.
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.{js,mjs}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node serve.mjs',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
