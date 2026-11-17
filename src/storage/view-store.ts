import type { KeyValueStorage } from './key-value';

/**
 * Preferências de visualização persistidas separadamente do documento.
 *
 * Elas não fazem parte do schema da família: são estado de interface e podem
 * ser descartadas sem perda de dados genealógicos.
 */

export const VIEW_STORAGE_KEY = 'arvore-familiar:view';
export const VIEW_FORMAT = 'arvore-familiar/view';
export const VIEW_FORMAT_VERSION = 1;

export type GenerationPreference = number | 'all';

export interface ViewPreferences {
  rootId: string | null;
  generations: GenerationPreference;
}

export interface StoredViewPreferences extends ViewPreferences {
  savedAt: string | null;
}

export type ViewLoadResult =
  | { status: 'empty' }
  | { status: 'ok'; preferences: StoredViewPreferences }
  | { status: 'error'; message: string };

export interface ViewStore {
  readonly persistent: boolean;
  load(): ViewLoadResult;
  save(preferences: ViewPreferences): boolean;
  clear(): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isGenerationPreference = (value: unknown): value is GenerationPreference =>
  value === 'all' ||
  (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 99);

const normalizePreferences = (value: unknown): ViewPreferences | null => {
  if (!isRecord(value)) return null;

  const rootId =
    value.rootId === null || value.rootId === undefined
      ? null
      : typeof value.rootId === 'string' && value.rootId.trim().length > 0
        ? value.rootId
        : null;

  if (value.rootId !== null && value.rootId !== undefined && rootId === null) return null;
  if (!isGenerationPreference(value.generations)) return null;

  return { rootId, generations: value.generations };
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function createViewStore(storage: KeyValueStorage, persistent: boolean): ViewStore {
  return {
    persistent,

    load(): ViewLoadResult {
      let raw: string | null;
      try {
        raw = storage.getItem(VIEW_STORAGE_KEY);
      } catch (error) {
        return {
          status: 'error',
          message: `Não foi possível ler as preferências: ${errorMessage(error)}`,
        };
      }

      if (raw === null) return { status: 'empty' };

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return {
          status: 'error',
          message: `Preferências com JSON inválido: ${errorMessage(error)}`,
        };
      }

      if (!isRecord(parsed) || parsed.format !== VIEW_FORMAT) {
        return { status: 'error', message: 'Preferências de visualização não reconhecidas.' };
      }
      if (parsed.formatVersion !== VIEW_FORMAT_VERSION) {
        return {
          status: 'error',
          message: `Preferências no formato ${String(parsed.formatVersion)}; esperado ${VIEW_FORMAT_VERSION}.`,
        };
      }

      const preferences = normalizePreferences(parsed);
      if (!preferences) {
        return { status: 'error', message: 'Preferências de visualização inválidas.' };
      }

      return {
        status: 'ok',
        preferences: {
          ...preferences,
          savedAt:
            typeof parsed.savedAt === 'string' && !Number.isNaN(Date.parse(parsed.savedAt))
              ? parsed.savedAt
              : null,
        },
      };
    },

    save(preferences: ViewPreferences): boolean {
      const normalized = normalizePreferences(preferences);
      if (!normalized) return false;

      try {
        storage.setItem(
          VIEW_STORAGE_KEY,
          JSON.stringify({
            format: VIEW_FORMAT,
            formatVersion: VIEW_FORMAT_VERSION,
            savedAt: new Date().toISOString(),
            ...normalized,
          }),
        );
        return true;
      } catch {
        return false;
      }
    },

    clear(): void {
      try {
        storage.removeItem(VIEW_STORAGE_KEY);
      } catch {
        // Preferências são descartáveis.
      }
    },
  };
}
