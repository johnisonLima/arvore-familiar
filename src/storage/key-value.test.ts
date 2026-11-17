import { describe, expect, it } from 'vitest';
import {
  browserLocalStorage,
  MemoryKeyValueStorage,
  resolveBrowserStorage,
} from './key-value';

class BrokenProbeStorage extends MemoryKeyValueStorage {
  override setItem(): void {
    throw new Error('storage bloqueado');
  }
}

describe('MemoryKeyValueStorage', () => {
  it('grava, lê e remove valores', () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem('a', '1');
    expect(storage.getItem('a')).toBe('1');
    expect(storage.getItem('b')).toBeNull();
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
    expect(storage.size).toBe(0);
  });
});

describe('resolveBrowserStorage', () => {
  it('usa o storage real quando o probe funciona', () => {
    const storage = new MemoryKeyValueStorage();
    const resolved = resolveBrowserStorage(storage as unknown as Storage);
    expect(resolved.persistent).toBe(true);
    expect(resolved.storage).toBe(storage);
  });

  it('cai para memória quando a gravação falha', () => {
    const resolved = resolveBrowserStorage(
      new BrokenProbeStorage() as unknown as Storage,
    );
    expect(resolved.persistent).toBe(false);
    expect(resolved.storage).not.toBeInstanceOf(BrokenProbeStorage);
    expect(() => resolved.storage.setItem('x', '1')).not.toThrow();
  });

  it('cai para memória sem storage', () => {
    const resolved = resolveBrowserStorage(null);
    expect(resolved.persistent).toBe(false);
  });
});

describe('browserLocalStorage', () => {
  it('não lança quando window não existe', () => {
    expect(browserLocalStorage()).toBeNull();
  });
});
