import { expect, test } from '@playwright/test';
import { collectErrors, openApp, seed } from './helpers';

test('carrega o seed, reenraíza e guarda a preferência', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);

  const rootName = seed.persons[seed.meta.rootPersonId].name;
  await expect(page.locator('.hud__name')).toHaveText(rootName);
  await expect(page.locator('.hud__stats')).toContainText('pessoas');

  const rootCard = page.locator('.person-card.is-root');
  await rootCard.focus();
  let targetId: string | null = null;
  for (const key of ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
    await page.keyboard.press(key);
    targetId = await page.evaluate(
      () => document.activeElement?.getAttribute('data-person-id') ?? null,
    );
    if (targetId && targetId !== seed.meta.rootPersonId) break;
  }
  expect(targetId).toBeTruthy();
  await page.keyboard.press('Enter');

  await expect(page.locator('.hud__name')).not.toHaveText(rootName);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('arvore-familiar:view');
        return raw ? JSON.parse(raw).rootId : null;
      }),
    )
    .toBe(targetId);

  expect(errors).toEqual([]);
});

test('navega entre cartões pelo teclado e pelo skip link', async ({ page }) => {
  await openApp(page);

  // O primeiro Tab alcança o link de pular navegação.
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tree-stage')).toBeFocused();

  // Setas a partir do palco entram no cartão atual e já navegam.
  for (const key of ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
    await page.keyboard.press(key);
    const focused = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-person-id'),
    );
    if (focused) break;
  }
  const stageTarget = await page.evaluate(
    () => document.activeElement?.getAttribute('data-person-id') ?? null,
  );
  expect(stageTarget).not.toBeNull();

  const root = page.locator('.person-card.is-root');
  await root.focus();
  const before = await page.evaluate(
    () => document.activeElement?.getAttribute('data-person-id') ?? null,
  );

  let after = before;
  for (const key of ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
    await page.keyboard.press(key);
    after = await page.evaluate(
      () => document.activeElement?.getAttribute('data-person-id') ?? null,
    );
    if (after !== before && after !== null) break;
  }

  expect(after).not.toBeNull();
  expect(after).not.toBe(before);
});

test('enquadra e aproxima sem perder a âncora do documento', async ({ page }) => {
  await openApp(page);
  const world = page.locator('.tree-world');

  await page.getByRole('button', { name: 'Aproximar' }).click();
  await expect(world).toHaveAttribute('data-lod', /full|medium/);

  await page.getByRole('button', { name: 'Enquadrar toda a árvore' }).click();
  await expect(page.locator('.hud__name')).toBeVisible();
});
