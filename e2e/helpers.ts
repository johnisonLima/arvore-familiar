import type { ConsoleMessage, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FamilyData, Person, Union } from '../src/domain/types';

export const DOCUMENT_KEY = 'arvore-familiar:document';

const AXE_PATH = fileURLToPath(new URL('../node_modules/axe-core/axe.min.js', import.meta.url));
const AXE_SOURCE = readFileSync(AXE_PATH, 'utf8');

export interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
}

/** Injeta o axe-core e devolve as violações WCAG A/AA encontradas. */
export async function analyzeAccessibility(page: Page): Promise<AxeViolation[]> {
  // Avaliação via protocolo, não <script> inline: a CSP restritiva continua válida.
  await page.evaluate(AXE_SOURCE);
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Document,
            options: unknown,
          ) => Promise<{ violations: AxeViolation[] }>;
        };
      }
    ).axe;
    const results = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return results.violations;
  });
}

export const seed = JSON.parse(
  readFileSync(new URL('../src/data/family.json', import.meta.url), 'utf8'),
) as FamilyData;

export interface OpenOptions {
  fixture?: boolean;
  document?: FamilyData;
  admin?: boolean;
}

/** Abre o app com armazenamento limpo e, opcionalmente, um documento semeado. */
export async function openApp(page: Page, options: OpenOptions = {}): Promise<void> {
  // Testes determinísticos: sem voos de câmera, o transform fica estável.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const params = new URLSearchParams();
  if (options.fixture) params.set('familia', 'fixture');
  if (options.admin !== false) params.set('admin', '1');
  await page.goto(`/?${params.toString()}`);
  await page.evaluate(() => localStorage.clear());

  if (options.document) {
    await page.evaluate(
      ({ key, data }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            format: 'arvore-familiar/document',
            formatVersion: 1,
            savedAt: new Date().toISOString(),
            data,
          }),
        );
      },
      { key: DOCUMENT_KEY, data: options.document },
    );
  }

  await page.reload();
  await page.waitForSelector('.person-card');
}

export async function storedDocument(page: Page): Promise<FamilyData | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw).data as FamilyData;
  }, DOCUMENT_KEY);
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Documento mínimo válido com nome hostil, usado nos testes de injeção. */
export function hostileDocument(name: string): FamilyData {
  const root: Person = { id: 'p-raiz', name };
  return {
    schemaVersion: 1,
    meta: { title: 'Teste hostil', rootPersonId: root.id },
    persons: { [root.id]: root },
    unions: {},
  };
}

/** Família sintética grande: `couples` casais, dois filhos por casal. */
export function largeFamily(couples: number): FamilyData {
  const persons: Record<string, Person> = {};
  const unions: Record<string, Union> = {};
  let personSeq = 0;
  let unionSeq = 0;

  const makePerson = (personName: string): Person => {
    const id = `p-l${personSeq++}`;
    const person: Person = { id, name: personName };
    persons[id] = person;
    return person;
  };

  const root = makePerson('Raiz grande');
  const queue: Array<{ person: Person; depth: number }> = [{ person: root, depth: 0 }];
  let remaining = couples;

  while (queue.length > 0 && remaining > 0) {
    const { person, depth } = queue.shift()!;
    const partner = makePerson(`Parceiro ${personSeq}`);
    const union: Union = {
      id: `u-l${unionSeq++}`,
      partners: [person.id, partner.id],
      children: [],
    };
    unions[union.id] = union;
    remaining -= 1;

    if (depth < 12 && remaining > 0) {
      for (let index = 0; index < 2 && remaining > 0; index += 1) {
        const child = makePerson(`Filho ${personSeq}`);
        union.children.push(child.id);
        queue.push({ person: child, depth: depth + 1 });
      }
    }
  }

  return {
    schemaVersion: 1,
    meta: { title: 'Família grande', rootPersonId: root.id },
    persons,
    unions,
  };
}
