import { expect, test } from '@playwright/test';
import { collectErrors, hostileDocument, openApp, seed } from './helpers';

test('aplica CSP e não executa HTML vindo dos dados', async ({ page }) => {
  const errors = collectErrors(page);
  const hostileName = '<img src=x onerror="window.__xss=1">Família';
  await openApp(page, { document: hostileDocument(hostileName) });

  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /default-src 'self'/,
  );
  await expect(page.locator('.person-card__name')).toHaveText(hostileName);
  await expect(page.locator('.person-card img')).toHaveCount(0);

  const executed = await page.evaluate(
    () => (window as unknown as { __xss?: number }).__xss ?? null,
  );
  expect(executed).toBeNull();
  expect(errors).toEqual([]);
});

test('rejeita JSON inválido e chaves de protótipo na importação', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /Dados/ }).click();
  const input = page.locator('.data-panel input[type="file"]');

  await input.setInputFiles({
    name: 'quebrado.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ nao é json'),
  });
  await expect(page.locator('.data-panel__error')).toBeVisible();
  await expect(page.locator('.data-panel__error')).toContainText('JSON inválido');

  const hostile = JSON.stringify(seed).replace(
    '"persons":{',
    '"persons":{"__proto__":{"id":"__proto__","name":"Intruso"},',
  );
  await input.setInputFiles({
    name: 'proto.json',
    mimeType: 'application/json',
    buffer: Buffer.from(hostile),
  });
  await expect(page.locator('.data-panel__error')).toContainText('chave reservada');
  await expect(page.locator('.hud__name')).toHaveText(
    seed.persons[seed.meta.rootPersonId].name,
  );
});

test('modo fixture edita apenas a sessão', async ({ page }) => {
  await openApp(page, { fixture: true });
  await page.getByRole('button', { name: /Editar/ }).click();
  await page.locator('.editor__section').first().locator('input[name="name"]').fill('Nome Só da Sessão');
  await page.getByRole('button', { name: 'Salvar pessoa' }).click();

  await expect(page.locator('.hud__name')).toHaveText('Nome Só da Sessão');
  await expect(page.locator('.editor__status')).toContainText('fixture');

  const keys = await page.evaluate(() => ({
    document: localStorage.getItem('arvore-familiar:document'),
    view: localStorage.getItem('arvore-familiar:view'),
  }));
  expect(keys.document).toBeNull();
  expect(keys.view).toBeNull();
});

test('exporta JSON com e sem dados privados', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /Dados/ }).click();

  const first = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar JSON' }).click();
  const exported = await first;
  expect(exported.suggestedFilename()).toMatch(/^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/);

  const second = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar sem privados' }).click();
  const redacted = await second;
  expect(redacted.suggestedFilename()).toContain('sem-privados');
});
