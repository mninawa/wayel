import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Wayel monorepo.
 *
 * Spins up all three Angular dev servers in parallel via the root `dev:*`
 * scripts so each `e2e/*.spec.ts` can target its app on a stable port.
 * Locally the runner reuses any server you already have running; in CI it
 * always boots fresh.
 *
 * Tests are deliberately app-isolated (no cross-app navigation) so the
 * suite stays fast and independent — touching the production rendering
 * path of each app is the goal, not full integration coverage.
 */

const CI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  /** `apps/client-portal` is not in this workspace; staff-invite E2E targets it separately. */
  testIgnore: ['**/client-staff-invite.spec.ts'],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 1 : undefined,
  reporter: CI ? [['list'], ['github']] : 'list',

  use: {
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: CI ? 'retain-on-failure' : 'off',
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      name: 'REMOVED',
      command: 'npm run dev:admin',
      url: 'http://127.0.0.1:4200/login',
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'customer-portal',
      command: 'npm run dev:external',
      url: 'http://127.0.0.1:4400/',
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
