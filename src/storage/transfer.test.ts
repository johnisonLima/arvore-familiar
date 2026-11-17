import { describe, expect, it } from 'vitest';
import familyJson from '../data/family.json';
import type { FamilyData } from '../domain/types';
import { validateFamilyData } from '../domain/validate';
import { DOCUMENT_FORMAT, DOCUMENT_FORMAT_VERSION } from './document-store';
import {
  exportFileName,
  FamilyImportError,
  hasPrivatePeople,
  normalizeFamilyData,
  parseFamilyDocument,
  readFamilyFile,
  redactPrivateData,
  serializeFamilyData,
} from './transfer';

const seed = JSON.parse(JSON.stringify(familyJson)) as FamilyData;

const cloneSeed = (): FamilyData => JSON.parse(JSON.stringify(seed)) as FamilyData;

const expectImportError = (callback: () => unknown, kind: string): FamilyImportError => {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(FamilyImportError);
    const importError = error as FamilyImportError;
    expect(importError.kind).toBe(kind);
    return importError;
  }
  throw new Error('esperava FamilyImportError');
};

describe('serializeFamilyData', () => {
  it('faz round-trip do documento', () => {
    const text = serializeFamilyData(seed);
    expect(parseFamilyDocument(text)).toEqual(seed);
  });

  it('ordena chaves de pessoas e uniões de forma estável', () => {
    const serialized = serializeFamilyData(seed);
    const parsed = JSON.parse(serialized);

    const personKeys = Object.keys(parsed.persons);
    expect(personKeys).toEqual([...personKeys].sort());
    const unionKeys = Object.keys(parsed.unions);
    expect(unionKeys).toEqual([...unionKeys].sort());

    expect(serializeFamilyData(seed)).toBe(serialized);
  });

  it('não altera o documento original', () => {
    const before = JSON.stringify(seed);
    serializeFamilyData(seed);
    expect(JSON.stringify(seed)).toBe(before);
  });

  it('termina com quebra de linha', () => {
    expect(serializeFamilyData(seed).endsWith('\n')).toBe(true);
  });
});

describe('normalizeFamilyData', () => {
  it('copia meta e ordena mapas', () => {
    const normalized = normalizeFamilyData(seed);
    expect(normalized.meta).not.toBe(seed.meta);
    expect(Object.keys(normalized.persons)).toEqual(Object.keys(normalized.persons).sort());
  });
});

describe('parseFamilyDocument', () => {
  it('aceita o envelope interno', () => {
    const text = JSON.stringify({
      format: DOCUMENT_FORMAT,
      formatVersion: DOCUMENT_FORMAT_VERSION,
      savedAt: new Date().toISOString(),
      data: seed,
    });
    expect(parseFamilyDocument(text)).toEqual(seed);
  });

  it('rejeita JSON inválido', () => {
    const error = expectImportError(() => parseFamilyDocument('{nope'), 'json');
    expect(error.message).toContain('JSON inválido');
  });

  it('rejeita documento que falha na validação e expõe os erros', () => {
    const broken = cloneSeed();
    broken.meta.rootPersonId = 'p-inexistente';
    const error = expectImportError(
      () => parseFamilyDocument(JSON.stringify(broken)),
      'document',
    );
    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues.some((issue) => issue.code === 'MISSING_ROOT')).toBe(true);
  });

  it('rejeita schema desconhecido', () => {
    const broken = cloneSeed() as unknown as Record<string, unknown>;
    broken.schemaVersion = 99;
    expectImportError(() => parseFamilyDocument(JSON.stringify(broken)), 'document');
  });
});

describe('readFamilyFile', () => {
  const fileOf = (text: string, name = 'familia.json'): File =>
    ({ name, size: Buffer.byteLength(text), text: async () => text }) as unknown as File;

  it('lê e valida um arquivo', async () => {
    await expect(readFamilyFile(fileOf(serializeFamilyData(seed)))).resolves.toEqual(seed);
  });

  it('rejeita arquivo grande antes de ler', async () => {
    const file = {
      name: 'grande.json',
      size: 5 * 1024 * 1024 + 1,
      text: async () => {
        throw new Error('não deveria ler');
      },
    } as unknown as File;

    await expect(readFamilyFile(file)).rejects.toBeInstanceOf(FamilyImportError);
    await expect(readFamilyFile(file)).rejects.toMatchObject({ kind: 'too-large' });
  });
});

describe('redactPrivateData', () => {
  it('remove detalhes pessoais mantendo referências válidas', () => {
    const data = cloneSeed();
    const person = data.persons['p-carlos-albuquerque'];
    if (!person) throw new Error('pessoa do seed não encontrada');
    person.private = true;
    person.birthPlace = 'Local sensível';
    person.bio = 'Biografia sensível';
    person.aliases = ['Apelido'];
    person.photo = 'https://exemplo.test/foto.jpg';

    const redacted = redactPrivateData(data);
    const result = redacted.persons['p-carlos-albuquerque'];
    if (!result) throw new Error('pessoa redigida não encontrada');

    expect(result).toMatchObject({
      id: 'p-carlos-albuquerque',
      name: person.name,
      private: true,
    });
    expect(result).not.toHaveProperty('birth');
    expect(result).not.toHaveProperty('death');
    expect(result).not.toHaveProperty('birthPlace');
    expect(result).not.toHaveProperty('bio');
    expect(result).not.toHaveProperty('aliases');
    expect(result).not.toHaveProperty('photo');

    expect(validateFamilyData(redacted).ok).toBe(true);
    expect(redacted.unions).toEqual(data.unions);
    expect(hasPrivatePeople(data)).toBe(true);
  });

  it('mantém dados de pessoas não privadas', () => {
    const redacted = redactPrivateData(seed);
    expect(redacted.persons['p-antonio-albuquerque']).toEqual(
      seed.persons['p-antonio-albuquerque'],
    );
    expect(hasPrivatePeople(seed)).toBe(false);
  });

  it('gera documento exportável que passa na validação', () => {
    const data = cloneSeed();
    const person = data.persons['p-carlos-albuquerque'];
    if (!person) throw new Error('pessoa do seed não encontrada');
    person.private = true;

    const text = serializeFamilyData(redactPrivateData(data));
    expect(validateFamilyData(JSON.parse(text)).ok).toBe(true);
  });
});

describe('exportFileName', () => {
  it('gera nome slug com data e sufixo', () => {
    const date = new Date(2026, 10, 17);
    expect(exportFileName(seed, { date })).toBe('familia-albuquerque-2026-11-17.json');
    expect(exportFileName(seed, { date, suffix: 'sem privados' })).toBe(
      'familia-albuquerque-2026-11-17-sem-privados.json',
    );
  });
});
