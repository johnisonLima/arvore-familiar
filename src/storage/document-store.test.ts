import { describe, expect, it } from 'vitest';
import familyJson from '../data/family.json';
import type { FamilyData } from '../domain/types';
import {
  createFamilyDocumentStore,
  DOCUMENT_FORMAT,
  DOCUMENT_FORMAT_VERSION,
  DOCUMENT_STORAGE_KEY,
} from './document-store';
import { MemoryKeyValueStorage } from './key-value';

const seed = JSON.parse(JSON.stringify(familyJson)) as FamilyData;

const cloneSeed = (): FamilyData => JSON.parse(JSON.stringify(seed)) as FamilyData;

class QuotaExceededStorage extends MemoryKeyValueStorage {
  override setItem(): void {
    const error = new Error('cota excedida');
    error.name = 'QuotaExceededError';
    throw error;
  }
}

describe('createFamilyDocumentStore', () => {
  it('começa vazio', () => {
    const store = createFamilyDocumentStore(new MemoryKeyValueStorage(), true);
    expect(store.load()).toEqual({ status: 'empty' });
    expect(store.persistent).toBe(true);
  });

  it('salva e lê o documento em envelope versionado', () => {
    const storage = new MemoryKeyValueStorage();
    const store = createFamilyDocumentStore(storage, true);

    const result = store.save(seed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const loaded = store.load();
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.document.data).toEqual(seed);
    expect(loaded.document.savedAt).toBe(result.savedAt);

    const envelope = JSON.parse(storage.getItem(DOCUMENT_STORAGE_KEY) ?? '{}');
    expect(envelope.format).toBe(DOCUMENT_FORMAT);
    expect(envelope.formatVersion).toBe(DOCUMENT_FORMAT_VERSION);
    expect(envelope.data.meta.title).toBe(seed.meta.title);
  });

  it('rejeita documento inválido sem gravar', () => {
    const storage = new MemoryKeyValueStorage();
    const store = createFamilyDocumentStore(storage, true);
    const broken = cloneSeed();
    broken.meta.rootPersonId = 'p-inexistente';

    const result = store.save(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(storage.getItem(DOCUMENT_STORAGE_KEY)).toBeNull();
  });

  it('ignora JSON corrompido', () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(DOCUMENT_STORAGE_KEY, '{oops');
    const store = createFamilyDocumentStore(storage, true);

    const loaded = store.load();
    expect(loaded.status).toBe('error');
    if (loaded.status === 'error') expect(loaded.message).toContain('JSON válido');
  });

  it('ignora formato desconhecido', () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify({ hello: 'world' }));
    const store = createFamilyDocumentStore(storage, true);

    expect(store.load().status).toBe('error');
  });

  it('rejeita envelope de versão mais nova', () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(
      DOCUMENT_STORAGE_KEY,
      JSON.stringify({
        format: DOCUMENT_FORMAT,
        formatVersion: DOCUMENT_FORMAT_VERSION + 1,
        savedAt: new Date().toISOString(),
        data: seed,
      }),
    );
    const store = createFamilyDocumentStore(storage, true);

    const loaded = store.load();
    expect(loaded.status).toBe('error');
    if (loaded.status === 'error') expect(loaded.message).toContain('formato');
  });

  it('aceita documento puro gravado por versões anteriores', () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(seed));
    const store = createFamilyDocumentStore(storage, true);

    const loaded = store.load();
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.document.data).toEqual(seed);
    expect(loaded.document.savedAt).toBeNull();
  });

  it('mapeia cota excedida', () => {
    const store = createFamilyDocumentStore(new QuotaExceededStorage(), true);
    const result = store.save(seed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('quota');
      expect(result.message).toContain('cota');
    }
  });

  it('limpa a cópia local', () => {
    const storage = new MemoryKeyValueStorage();
    const store = createFamilyDocumentStore(storage, true);
    store.save(seed);

    store.clear();
    expect(storage.getItem(DOCUMENT_STORAGE_KEY)).toBeNull();
    expect(store.load()).toEqual({ status: 'empty' });
  });
});
