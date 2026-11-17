/**
 * Adaptador mínimo de armazenamento chave/valor.
 *
 * `Storage` do navegador já satisfaz esta interface. O adaptador em memória é
 * usado como fallback quando o localStorage está indisponível (modo privado,
 * política de cookies ou cota) e nos testes.
 */

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryKeyValueStorage implements KeyValueStorage {
  readonly #items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#items.set(key, value);
  }

  removeItem(key: string): void {
    this.#items.delete(key);
  }

  clear(): void {
    this.#items.clear();
  }

  get size(): number {
    return this.#items.size;
  }
}

export interface ResolvedStorage {
  storage: KeyValueStorage;
  /** `true` quando a gravação sobrevive ao recarregamento da página. */
  persistent: boolean;
}

const PROBE_KEY = 'arvore-familiar:probe';

export function resolveBrowserStorage(candidate: Storage | null | undefined): ResolvedStorage {
  if (!candidate) {
    return { storage: new MemoryKeyValueStorage(), persistent: false };
  }

  try {
    candidate.setItem(PROBE_KEY, '1');
    candidate.removeItem(PROBE_KEY);
    return { storage: candidate, persistent: true };
  } catch {
    return { storage: new MemoryKeyValueStorage(), persistent: false };
  }
}

/** Acesso seguro a `window.localStorage`; pode lançar em iframes restritos. */
export function browserLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
