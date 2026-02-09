// @ts-check
/// <reference types="playwright" />

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /audit\.spec\.ts/,
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  reporter: process.env.CI
    ? [['line'], ['json', { outputFile: 'artifacts/playwright-report.json' }]]
    : 'list',
});
