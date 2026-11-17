import type { FamilyData } from '../domain/types';
import { validateFamilyData, type ValidationIssue } from '../domain/validate';
import type { KeyValueStorage } from './key-value';

/**
 * Documento persistido no navegador.
 *
 * O envelope tem formato e versão próprios para permitir migrar a camada de
 * armazenamento sem tocar no schema da família (`schemaVersion`). Um documento
 * exportado para arquivo é gravado sem envelope; ao importar, os dois formatos
 * são aceitos.
 */

export const DOCUMENT_STORAGE_KEY = 'arvore-familiar:document';
export const DOCUMENT_FORMAT = 'arvore-familiar/document';
export const DOCUMENT_FORMAT_VERSION = 1;

export interface StoredFamilyDocument {
  data: FamilyData;
  /** ISO 8601 da última gravação; `null` para documento legado sem envelope. */
  savedAt: string | null;
}

export interface DocumentEnvelope {
  format: string;
  formatVersion: number;
  savedAt: string;
  data: FamilyData;
}

export type DocumentLoadResult =
  | { status: 'empty' }
  | { status: 'ok'; document: StoredFamilyDocument }
  | { status: 'error'; message: string; issues: ValidationIssue[] };

export type DocumentSaveErrorCode = 'invalid' | 'quota' | 'unavailable';

export type DocumentSaveResult =
  | { ok: true; savedAt: string }
  | { ok: false; code: DocumentSaveErrorCode; message: string; issues: ValidationIssue[] };

export interface FamilyDocumentStore {
  readonly persistent: boolean;
  load(): DocumentLoadResult;
  save(data: FamilyData): DocumentSaveResult;
  clear(): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isEnvelope = (value: unknown): value is DocumentEnvelope =>
  isRecord(value) &&
  value.format === DOCUMENT_FORMAT &&
  typeof value.formatVersion === 'number' &&
  typeof value.savedAt === 'string' &&
  isRecord(value.data);

const summarize = (issues: ValidationIssue[]): string =>
  issues
    .slice(0, 3)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join(' · ');

const normalizeTimestamp = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
};

const isQuotaError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const name = 'name' in error ? String((error as { name: unknown }).name) : '';
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Extrai o documento de um envelope interno ou de um JSON exportado. */
const unwrapDocument = (parsed: unknown): FamilyData | null => {
  if (isEnvelope(parsed)) return parsed.data;
  if (isRecord(parsed) && 'schemaVersion' in parsed) return parsed as unknown as FamilyData;
  return null;
};

export function createFamilyDocumentStore(
  storage: KeyValueStorage,
  persistent: boolean,
): FamilyDocumentStore {
  return {
    persistent,

    load(): DocumentLoadResult {
      let raw: string | null;
      try {
        raw = storage.getItem(DOCUMENT_STORAGE_KEY);
      } catch (error) {
        return {
          status: 'error',
          message: `Não foi possível ler o armazenamento local: ${errorMessage(error)}`,
          issues: [],
        };
      }

      if (raw === null) return { status: 'empty' };

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return {
          status: 'error',
          message: `A cópia local não contém JSON válido: ${errorMessage(error)}`,
          issues: [],
        };
      }

      if (isRecord(parsed) && parsed.format === DOCUMENT_FORMAT) {
        if (parsed.formatVersion !== DOCUMENT_FORMAT_VERSION) {
          return {
            status: 'error',
            message: `Cópia local no formato ${String(parsed.formatVersion)}; esta versão lê o formato ${DOCUMENT_FORMAT_VERSION}.`,
            issues: [],
          };
        }
      }

      const data = unwrapDocument(parsed);
      if (!data) {
        return {
          status: 'error',
          message: 'A cópia local não é um documento familiar reconhecido.',
          issues: [],
        };
      }

      const validation = validateFamilyData(data);
      if (!validation.ok) {
        return {
          status: 'error',
          message: `A cópia local é inválida: ${summarize(validation.errors)}`,
          issues: validation.errors,
        };
      }

      return {
        status: 'ok',
        document: {
          data,
          savedAt: isEnvelope(parsed) ? normalizeTimestamp(parsed.savedAt) : null,
        },
      };
    },

    save(data: FamilyData): DocumentSaveResult {
      const validation = validateFamilyData(data);
      if (!validation.ok) {
        return {
          ok: false,
          code: 'invalid',
          message: `Documento inválido: ${summarize(validation.errors)}`,
          issues: validation.errors,
        };
      }

      const savedAt = new Date().toISOString();
      const envelope: DocumentEnvelope = {
        format: DOCUMENT_FORMAT,
        formatVersion: DOCUMENT_FORMAT_VERSION,
        savedAt,
        data,
      };

      try {
        storage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(envelope));
        return { ok: true, savedAt };
      } catch (error) {
        return {
          ok: false,
          code: isQuotaError(error) ? 'quota' : 'unavailable',
          message:
            isQuotaError(error)
              ? 'A cota do armazenamento local foi excedida.'
              : `Não foi possível gravar no armazenamento local: ${errorMessage(error)}`,
          issues: [],
        };
      }
    },

    clear(): void {
      try {
        storage.removeItem(DOCUMENT_STORAGE_KEY);
      } catch {
        // Limpar uma cópia inacessível não deve impedir o uso da sessão.
      }
    },
  };
}
