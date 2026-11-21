import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests for the Milestone 1 flows.
 *
 * Prerequisites: database migrated + seeded, and Playwright browsers installed
 * (`pnpm --filter web exec playwright install chromium`).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'pnpm --filter api start',
          cwd: '../..',
          url: 'http://localhost:4000/api/v1/health',
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'pnpm --filter web dev',
          cwd: '../..',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
