import type { FamilyData, Person } from '../domain/types';
import { loadFamilyData } from '../data/load';
import { validateFamilyData, type ValidationIssue } from '../domain/validate';
import { DOCUMENT_FORMAT } from './document-store';

/**
 * Importação e exportação de documentos familiares.
 *
 * O arquivo exportado é o documento puro (sem envelope), legível por outras
 * ferramentas. A importação também aceita o envelope interno para facilitar
 * backup/restauração manual.
 */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ImportErrorKind = 'json' | 'document' | 'too-large';

export class FamilyImportError extends Error {
  readonly kind: ImportErrorKind;
  readonly issues: ValidationIssue[];

  constructor(kind: ImportErrorKind, message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = 'FamilyImportError';
    this.kind = kind;
    this.issues = issues;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sortByKey = <T>(record: Record<string, T>): Record<string, T> => {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const value = record[key];
    if (value !== undefined) sorted[key] = value;
  }
  return sorted;
};

/** Ordena chaves para que exportações iguais gerem arquivos iguais. */
export function normalizeFamilyData(data: FamilyData): FamilyData {
  return {
    schemaVersion: data.schemaVersion,
    meta: { ...data.meta },
    persons: sortByKey(data.persons),
    unions: sortByKey(data.unions),
  };
}

export function serializeFamilyData(data: FamilyData, pretty = true): string {
  return `${JSON.stringify(normalizeFamilyData(data), null, pretty ? 2 : 0)}\n`;
}

/**
 * Remove detalhes pessoais de quem tem `private: true`, mantendo id e nome para
 * que as referências das uniões continuem válidas. O resultado passa na
 * validação e pode ser compartilhado.
 */
export function redactPrivateData(data: FamilyData): FamilyData {
  const persons: Record<string, Person> = {};

  for (const [id, person] of Object.entries(data.persons)) {
    if (!person.private) {
      persons[id] = { ...person };
      continue;
    }

    persons[id] = {
      id: person.id,
      name: person.name,
      ...(person.sex ? { sex: person.sex } : {}),
      private: true,
    };
  }

  return {
    schemaVersion: data.schemaVersion,
    meta: { ...data.meta },
    persons,
    unions: { ...data.unions },
  };
}

export function hasPrivatePeople(data: FamilyData): boolean {
  return Object.values(data.persons).some((person) => person.private === true);
}

/** Aceita o documento puro ou o envelope interno usado pelo localStorage. */
export function parseFamilyDocument(text: string): FamilyData {
  if (text.length > MAX_IMPORT_BYTES) {
    throw new FamilyImportError(
      'too-large',
      `O arquivo excede o limite de ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FamilyImportError('json', `JSON inválido: ${message}`);
  }

  const candidate =
    isRecord(parsed) && parsed.format === DOCUMENT_FORMAT && isRecord(parsed.data)
      ? parsed.data
      : parsed;

  const validation = validateFamilyData(candidate);
  if (!validation.ok) {
    throw new FamilyImportError(
      'document',
      `O documento tem ${validation.errors.length} erro(s) de validação.`,
      validation.errors,
    );
  }

  return loadFamilyData(candidate);
}

export async function readFamilyFile(file: File): Promise<FamilyData> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new FamilyImportError(
      'too-large',
      `"${file.name}" excede o limite de ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB.`,
    );
  }
  return parseFamilyDocument(await file.text());
}

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'arvore-familiar';

const pad = (value: number): string => String(value).padStart(2, '0');

export interface ExportNameOptions {
  suffix?: string;
  date?: Date;
}

export function exportFileName(data: FamilyData, options: ExportNameOptions = {}): string {
  const date = options.date ?? new Date();
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const suffix = options.suffix ? `-${slugify(options.suffix)}` : '';
  return `${slugify(data.meta.title)}-${stamp}${suffix}.json`;
}
