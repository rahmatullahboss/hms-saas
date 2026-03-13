import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  timeout: 30000,
  use: {
    // Wrangler dev serves both the API (/api/*) and static frontend assets
    baseURL: 'http://localhost:8787',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // Use wrangler dev (already running on 8787 via `npm run dev` in root)
    command: 'wrangler dev',
    url: 'http://localhost:8787',
    reuseExistingServer: true, // Reuse existing wrangler dev process
    timeout: 60000,
  },
});
