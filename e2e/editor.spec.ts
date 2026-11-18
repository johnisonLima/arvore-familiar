import { expect, test } from '@playwright/test';
import { collectErrors, openApp, seed, storedDocument } from './helpers';

const rootName = seed.persons[seed.meta.rootPersonId].name;
const documentCount = Object.keys(seed.persons).length;

const personForm = (page: import('@playwright/test').Page) =>
  page.locator('.editor__section').first().locator('form').first();

async function openEditor(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: /Editar/ }).click();
  await expect(page.locator('.editor')).toBeVisible();
  await expect(page.locator('select[aria-label="Pessoa em edição"]')).toBeFocused();
}

test('edita a pessoa raiz, preserva a câmera e persiste no reload', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await openEditor(page);
  await expect(page.locator('.editor')).toHaveAttribute('aria-labelledby', 'family-editor-title');

  const transformBefore = await page
    .locator('.tree-world')
    .evaluate((node) => (node as HTMLElement).style.transform);

  await personForm(page).locator('input[name="name"]').fill('Antônio Editado');
  await page.getByRole('button', { name: 'Salvar pessoa' }).click();

  await expect(page.locator('.hud__name')).toHaveText('Antônio Editado');
  await expect(page.locator('.editor__status')).toContainText(/salva/i);

  const transformAfter = await page
    .locator('.tree-world')
    .evaluate((node) => (node as HTMLElement).style.transform);
  expect(transformAfter).toBe(transformBefore);

  const saved = await storedDocument(page);
  expect(saved?.persons[seed.meta.rootPersonId].name).toBe('Antônio Editado');

  await page.reload();
  await expect(page.locator('.hud__name')).toHaveText('Antônio Editado');
  expect(errors).toEqual([]);
});

test('rejeita ano inválido sem substituir o documento', async ({ page }) => {
  await openApp(page);
  await openEditor(page);

  const storedBefore = await storedDocument(page);
  await personForm(page).locator('input[name="name"]').fill('Nome que não deve salvar');
  await personForm(page).locator('input[name="birthYear"]').fill('-3');
  await page.getByRole('button', { name: 'Salvar pessoa' }).click();

  await expect(page.locator('.editor__error')).toBeVisible();
  await expect(page.locator('.editor__error')).toContainText('ano inteiro positivo');
  await expect(personForm(page).locator('input[name="birthYear"]')).toHaveValue('-3');
  await expect(page.locator('.hud__name')).toHaveText(rootName);

  const storedAfter = await storedDocument(page);
  expect(storedAfter?.persons[seed.meta.rootPersonId].name).toBe(
    storedBefore?.persons[seed.meta.rootPersonId].name,
  );
});

test('cria pessoa, cria filho e exclui com confirmação', async ({ page }) => {
  await openApp(page);
  await openEditor(page);

  const before = await page.locator('.hud__stats').textContent();

  await page.getByRole('button', { name: '+ Nova' }).click();
  await personForm(page).locator('input[name="name"]').fill('Pessoa de Teste');
  await page.getByRole('button', { name: 'Criar pessoa' }).click();

  await expect(page.locator('.editor select[aria-label="Pessoa em edição"]')).toHaveValue(
    /p-pessoa-de-teste/,
  );
  let saved = await storedDocument(page);
  expect(Object.keys(saved?.persons ?? {})).toHaveLength(documentCount + 1);
  expect(Object.values(saved?.persons ?? {}).some((person) => person.name === 'Pessoa de Teste')).toBe(
    true,
  );

  await page.locator('.editor select[aria-label="Pessoa em edição"]').selectOption({
    label: rootName,
  });
  const childForm = page.locator('.editor__form--inline').first();
  await childForm.locator('input[name="name"]').fill('Filho de Teste');
  await childForm.getByRole('button', { name: 'Criar' }).click();
  await expect(page.locator('.hud__stats')).not.toHaveText(before ?? '');
  saved = await storedDocument(page);
  expect(Object.keys(saved?.persons ?? {})).toHaveLength(documentCount + 2);
  expect(Object.values(saved?.persons ?? {}).some((person) => person.name === 'Filho de Teste')).toBe(
    true,
  );

  await page.locator('.editor select[aria-label="Pessoa em edição"]').selectOption({
    label: 'Pessoa de Teste',
  });
  await page.getByRole('button', { name: 'Excluir pessoa' }).click();
  await page.getByRole('button', { name: 'Confirmar exclusão' }).first().click();

  saved = await storedDocument(page);
  expect(Object.keys(saved?.persons ?? {})).toHaveLength(documentCount + 1);
  expect(Object.values(saved?.persons ?? {}).some((person) => person.name === 'Pessoa de Teste')).toBe(
    false,
  );
  await expect(
    page.locator('.editor select[aria-label="Pessoa em edição"]'),
  ).toBeFocused();
});

test('Escape fecha o editor e devolve o foco ao botão', async ({ page }) => {
  await openApp(page);
  await openEditor(page);

  await page.keyboard.press('Escape');
  await expect(page.locator('.editor')).toBeHidden();
  await expect(page.locator('.hud__button--edit')).toBeFocused();
});

test('restaura o foco no campo depois do autosave', async ({ page }) => {
  await openApp(page);
  await openEditor(page);

  const bio = page.locator('.editor textarea[name="bio"]');
  await bio.fill('Biografia atualizada');
  await page.keyboard.press('Control+Enter');

  await expect(bio).toBeFocused();
  await expect(bio).toHaveValue('Biografia atualizada');
});

test('salva apelidos e foto enviada no documento e apresenta apelidos no cartão', async ({ page }) => {
  await openApp(page);
  await openEditor(page);
  const form = personForm(page);
  await form.locator('textarea[name="aliases"]').fill('Nena\nMariazinha');
  await form.locator('input[type="file"][accept^="image/"]').setInputFiles({
    name: 'foto original.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(form.locator('span.editor__hint')).toContainText(/Nome sugerido: p-/);
  await form.getByRole('button', { name: 'Salvar pessoa' }).click();

  const saved = await storedDocument(page);
  const root = saved?.persons[seed.meta.rootPersonId];
  expect(root?.aliases).toEqual(['Nena', 'Mariazinha']);
  expect(root?.photo).toMatch(/^data:image\/png;base64,/);
  await expect(page.locator('.person-card.is-root .person-card__place')).toHaveText('Nena, Mariazinha');
  await expect(page.locator('.person-card.is-root .person-card__photo')).toBeVisible();
});

test('oculta os controles no modo público e mostra no modo admin', async ({ page }) => {
  await openApp(page, { admin: false });
  await expect(page.locator('.hud__button--edit')).toBeHidden();
  await expect(page.locator('.data-panel')).toBeHidden();
  await page.goto('/?admin=1');
  await expect(page.locator('.hud__button--edit')).toBeVisible();
  await expect(page.locator('.data-panel')).toBeVisible();
});
