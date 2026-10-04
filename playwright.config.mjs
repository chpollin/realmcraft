import { defineConfig, devices } from '@playwright/test';

const browser = {
  ...devices['Desktop Chrome'],
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
};

// Unit tests (node:test) live under tests/unit as *.test.js and are run separately.
// Every spec starts its own serve.mjs on a temporary campaign root
// (tests/fixtures/server.mjs), so the config starts no server.
export default defineConfig({
  testMatch: '**/*.spec.{js,mjs}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'e2e', testDir: './tests/e2e', use: browser },
  ],
});
