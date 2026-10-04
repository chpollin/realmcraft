import { defineConfig, devices } from '@playwright/test';

const browser = {
  ...devices['Desktop Chrome'],
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
};

// No webServer: every spec starts its own serve.mjs on a temporary
// REALMCRAFT_ROOT (tests/lib/server.mjs), so no run reads the live campaigns.
// Unit tests (node:test) live under tests/unit as *.test.js and are run separately.
export default defineConfig({
  testMatch: '**/*.spec.{js,mjs}',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'e2e', testDir: './tests/e2e', use: browser },
  ],
});
