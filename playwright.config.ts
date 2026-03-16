/// <reference types="node" />
/**
 * Playwright configuration for Ozzyl HMS E2E + Smoke Tests
 *
 * Runs against:
 *   - Production: https://hms-saas-production.rahmatullahzisan.workers.dev
 *   - Staging:    https://hms-saas-staging.rahmatullahzisan.workers.dev
 *   - Local:      http://localhost:8787
 *
 * Usage:
 *   npx playwright test                              # run vs BASE_URL (default: local)
 *   BASE_URL=https://hms-saas-production.rahmatullahzisan.workers.dev npx playwright test
 *   npx playwright test --project=smoke             # smoke only
 *   npx playwright test --project=api               # API e2e only
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL =
  process.env.BASE_URL ||
  'https://hms-saas-production.rahmatullahzisan.workers.dev';

export default defineConfig({
  testDir: './test/e2e',
  outputDir: './test/e2e/results',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { outputFolder: 'test/e2e/report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },

  projects: [
    // ─── API Smoke — pure fetch, no browser needed ───
    {
      name: 'smoke',
      testMatch: '**/smoke/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Full API E2E — tests every endpoint ──────────
    {
      name: 'api',
      testMatch: '**/api/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Browser E2E — UI flows ──────────────────────
    {
      name: 'e2e',
      testMatch: '**/browser/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
