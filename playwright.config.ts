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
  process.env['BASE_URL'] ||
  'https://hms-saas-production.rahmatullahzisan.workers.dev';

export default defineConfig({
  testDir: './test/e2e',
  outputDir: './test/e2e/results',

  // Global setup: login once before all workers → writes .auth-state.json
  globalSetup: process.env['E2E_EMAIL'] ? './test/e2e/global-setup.ts' : undefined,
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
      testMatch: '**/smoke/api-smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Pharmacy API Smoke — all pharmacy endpoints ─
    {
      name: 'pharmacy-smoke',
      testMatch: '**/smoke/pharmacy-smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Full API E2E — tests every endpoint ──────────
    {
      name: 'api',
      testMatch: '**/api/modules.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Browser E2E — UI flows ──────────────────────
    {
      name: 'e2e',
      testMatch: '**/browser/ui-flows.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Authenticated API Smoke (login + all GETs) ──
    {
      name: 'auth-smoke',
      testMatch: '**/smoke/auth-smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Authenticated API CRUD tests ────────────────
    {
      name: 'auth-api',
      testMatch: '**/api/auth-modules.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Extended write coverage (20 additional modules) ─
    {
      name: 'auth-extended',
      testMatch: '**/api/auth-modules-extended.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Extended write coverage 2 (30+ additional modules) ─
    {
      name: 'auth-extended2',
      testMatch: '**/api/auth-modules-extended2.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Deep write coverage 3 (75+ deep write endpoint tests) ─
    {
      name: 'auth-extended3',
      testMatch: '**/api/auth-modules-extended3.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Patient Portal E2E (OTP auth + all portal writes) ─
    {
      name: 'patient-portal',
      testMatch: '**/api/patient-portal.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Authenticated Browser E2E ──────────────────
    {
      name: 'auth-e2e',
      testMatch: '**/browser/auth-ui-flows.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Super Admin API E2E ─────────────────────────
    {
      name: 'super-admin-api',
      testMatch: '**/api/super-admin-api.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Shareholders E2E (43 tests, full coverage) ──
    {
      name: 'shareholders',
      testMatch: '**/api/shareholders.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // ─── Super Admin Browser E2E (Production — real API, no mocks) ──
    {
      name: 'super-admin-browser',
      testMatch: '**/browser/super-admin-prod.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        serviceWorkers: 'block',
      },
    },
    // ─── Nursing + E-Prescribing E2E (new modules) ──
    {
      name: 'nursing-eprescribing',
      testMatch: '**/api/nursing-eprescribing.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
