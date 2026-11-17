import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStorage } from './key-value';
import {
  createViewStore,
  VIEW_FORMAT,
  VIEW_FORMAT_VERSION,
  VIEW_STORAGE_KEY,
} from './view-store';

const writeEnvelope = (
  storage: MemoryKeyValueStorage,
  preferences: Record<string, unknown>,
): void => {
  storage.setItem(
    VIEW_STORAGE_KEY,
    JSON.stringify({
      format: VIEW_FORMAT,
      formatVersion: VIEW_FORMAT_VERSION,
      savedAt: new Date().toISOString(),
      ...preferences,
    }),
  );
};

describe('createViewStore', () => {
  it('começa vazio e expõe a persistência', () => {
    const store = createViewStore(new MemoryKeyValueStorage(), false);
    expect(store.load()).toEqual({ status: 'empty' });
    expect(store.persistent).toBe(false);
  });

  it('salva e lê raiz e gerações', () => {
    const storage = new MemoryKeyValueStorage();
    const store = createViewStore(storage, true);

    expect(store.save({ rootId: 'p-carlos-albuquerque', generations: 3 })).toBe(true);

    const loaded = store.load();
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.preferences.rootId).toBe('p-carlos-albuquerque');
    expect(loaded.preferences.generations).toBe(3);
    expect(loaded.preferences.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('aceita raiz nula e todas as gerações', () => {
    const storage = new MemoryKeyValueStorage();
    const store = createViewStore(storage, true);
    store.save({ rootId: null, generations: 'all' });

    const loaded = store.load();
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.preferences.rootId).toBeNull();
    expect(loaded.preferences.generations).toBe('all');
  });

  it('rejeita preferências inválidas ao salvar', () => {
    const store = createViewStore(new MemoryKeyValueStorage(), true);
    expect(store.save({ rootId: '', generations: 3 })).toBe(false);
    expect(store.save({ rootId: null, generations: 0 as never })).toBe(false);
    expect(store.save({ rootId: null, generations: 1.5 as never })).toBe(false);
  });

  it('ignora JSON inválido', () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(VIEW_STORAGE_KEY, 'nope');
    const store = createViewStore(storage, true);

    const loaded = store.load();
    expect(loaded.status).toBe('error');
    if (loaded.status === 'error') expect(loaded.message).toContain('JSON inválido');
  });

  it('ignora envelope com formato ou versão desconhecidos', () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ format: 'outro' }));
    expect(createViewStore(storage, true).load().status).toBe('error');

    writeEnvelope(storage, { formatVersion: VIEW_FORMAT_VERSION + 1 });
    expect(createViewStore(storage, true).load().status).toBe('error');
  });

  it('ignora gerações fora do intervalo', () => {
    const storage = new MemoryKeyValueStorage();
    writeEnvelope(storage, { rootId: 'p-x', generations: 0 });
    expect(createViewStore(storage, true).load().status).toBe('error');

    writeEnvelope(storage, { rootId: '', generations: 3 });
    expect(createViewStore(storage, true).load().status).toBe('error');
  });

  it('limpa as preferências', () => {
    const storage = new MemoryKeyValueStorage();
    const store = createViewStore(storage, true);
    store.save({ rootId: 'p-x', generations: 2 });

    store.clear();
    expect(storage.getItem(VIEW_STORAGE_KEY)).toBeNull();
    expect(store.load()).toEqual({ status: 'empty' });
  });
});
