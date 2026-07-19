import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('landing → ingest → space renders without crash', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('PinViz')).toBeVisible();

  // Create a tiny PNG in-memory via page and drop isn't easy; use file input.
  const fixture = path.join(__dirname, 'fixtures', 'sample.png');
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles([fixture, fixture]);

  // Processing or space should appear
  await expect(page.getByText(/Building your space|photo/i).first()).toBeVisible({
    timeout: 30_000,
  });

  // Eventually HUD should show photo count in space
  await expect(page.getByText(/\d+ photos?/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('canvas')).toBeVisible();
});
