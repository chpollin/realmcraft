import { defineConfig, devices } from '@playwright/test';

// Own port and no server reuse, so a run never hits the game-master's live
// server on 4173 (which mirrors the running campaign's savegame.json).
const PORT = Number(process.env.PORT) || 4391;
const baseURL = `http://localhost:${PORT}`;

const browser = {
  ...devices['Desktop Chrome'],
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
};

// Unit tests (node:test) live under tests/unit as *.test.js and are run separately.
export default defineConfig({
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
    { name: 'e2e', testDir: './tests/e2e', use: browser },
    {
      name: 'visual',
      testDir: './tests/visual',
      use: browser,
      // Keeps the checked-in baseline names (<view>-chromium-<platform>.png)
      // independent of the project name.
      snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-chromium{-snapshotSuffix}{ext}',
    },
  ],
  webServer: {
    command: 'node serve.mjs',
    url: baseURL,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
