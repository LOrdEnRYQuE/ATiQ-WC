import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('ATiQ reality audit passes and emits artifacts', async ({ page }) => {
  // Ensure artifacts directory exists
  fs.mkdirSync('artifacts', { recursive: true });

  const demoPath = path.resolve('tests/demo.html');
  await page.goto(`file://${demoPath}`);

  // Click the "Run Complete Reality Audit" button
  await page.getByRole('button', { name: /run complete reality audit/i }).click();

  // Wait for audit to complete (window.__ATIQAUDIT_DONE__ will be set to true)
  await page.waitForFunction(() => (window as any).__ATIQAUDIT_DONE__ === true, {
    timeout: 120_000,
  });

  // Get audit summary from window
  const summary = await page.evaluate(() => (window as any).__ATIQAUDIT_SUMMARY__);
  
  // Verify audit completed successfully
  expect(summary).toBeTruthy();
  expect(summary.status).toBe('pass');
  expect(summary.results).toBeDefined();
  expect(summary.results.length).toBeGreaterThan(0);

  // Verify artifacts were created
  const artifactsDir = path.resolve('artifacts');
  expect(fs.existsSync(artifactsDir)).toBe(true);

  // Verify audit-summary.json exists and has correct structure
  const summaryPath = path.join(artifactsDir, 'audit-summary.json');
  expect(fs.existsSync(summaryPath)).toBe(true);
  
  const summaryContent = fs.readFileSync(summaryPath, 'utf8');
  const summaryData = JSON.parse(summaryContent);
  
  expect(summaryData.version).toBe('1.0.0');
  expect(summaryData.status).toBe('pass');
  expect(summaryData.results).toBeDefined();
  expect(summaryData.results.length).toBe(4); // WebFS, Package Manager, Process, Preview Server

  // Verify receipts.ndjson exists and has correct structure
  const receiptsPath = path.join(artifactsDir, 'receipts.ndjson');
  expect(fs.existsSync(receiptsPath)).toBe(true);
  
  const receiptsContent = fs.readFileSync(receiptsPath, 'utf8');
  const receiptLines = receiptsContent.trim().split('\n');
  
  // Should have at least 4 receipt lines (one per suite)
  expect(receiptLines.length).toBeGreaterThanOrEqual(4);
  
  // Verify each receipt is valid JSON and has required fields
  receiptLines.forEach((line, index) => {
    if (line.trim()) {
      const receipt = JSON.parse(line);
      expect(receipt.timestamp).toBeTruthy();
      expect(receipt.suite).toBeTruthy();
      expect(receipt.status).toMatch(/^(pass|fail)$/);
      expect(receipt.duration).toBeGreaterThan(0);
    }
  });

  console.log('✅ ATiQ WebContainer Reality Audit PASSED');
  console.log(`📄 Artifacts created: ${summaryPath}, ${receiptsPath}`);
});
