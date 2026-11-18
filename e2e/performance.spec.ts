import { expect, test } from '@playwright/test';
import { largeFamily, openApp } from './helpers';

test('documento grande renderiza apenas a viewport', async ({ page }) => {
  await openApp(page, { document: largeFamily(400) });

  const counts = await page.locator('.tree-world').evaluate((node) => ({
    total: Number((node as HTMLElement).dataset.totalCards),
    visible: Number((node as HTMLElement).dataset.visibleCards),
  }));

  expect(counts.total).toBeGreaterThan(700);
  expect(counts.visible).toBeGreaterThan(0);
  expect(counts.visible).toBeLessThan(counts.total);

  // Apenas um cartão entra na ordem de tabulação (roving tabindex).
  await expect(page.locator('.person-card:not([tabindex="-1"])')).toHaveCount(1);

  // A camada de GPU só é promovida durante gestos.
  const willChange = await page
    .locator('.tree-world')
    .evaluate((node) => getComputedStyle(node).willChange);
  expect(willChange).toBe('auto');
});

test('arrastar recalcula os cartões visíveis', async ({ page }) => {
  await openApp(page, { document: largeFamily(400) });

  const ids = () =>
    page
      .locator('.person-card')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.personId));

  const before = await ids();

  const box = await page.locator('.tree-stage').boundingBox();
  if (!box) throw new Error('Stage sem dimensões');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 900, box.y + box.height / 2 - 400, {
    steps: 10,
  });
  await page.mouse.up();

  await expect.poll(ids).not.toEqual(before);
});

