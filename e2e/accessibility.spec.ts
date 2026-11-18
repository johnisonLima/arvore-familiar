import { expect, test } from '@playwright/test';
import { analyzeAccessibility, openApp, seed } from './helpers';

test('não tem violações WCAG A/AA na árvore', async ({ page }) => {
  await openApp(page);
  expect(await analyzeAccessibility(page)).toEqual([]);
});

test('não tem violações WCAG A/AA com o editor aberto', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /Editar/ }).click();
  await expect(page.locator('.editor')).toBeVisible();

  expect(await analyzeAccessibility(page)).toEqual([]);
});

test('expõe estados e regiões vivas para leitores de tela', async ({ page }) => {
  await openApp(page);

  const editButton = page.locator('.hud__button--edit');
  await expect(editButton).toHaveAttribute('aria-pressed', 'false');
  await editButton.click();
  await expect(editButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.editor__status')).toHaveAttribute('aria-live', 'polite');
  await page.keyboard.press('Escape');

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
  const targetName = targetId ? seed.persons[targetId]?.name : null;
  await page.keyboard.press('Enter');

  await expect(page.locator('.hud__name')).toHaveText(targetName ?? '');
  const live = page.locator('.tree-app .sr-only[role="status"]');
  await expect(live).toContainText('Raiz:');
});
