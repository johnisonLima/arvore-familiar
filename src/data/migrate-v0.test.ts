import { describe, expect, it } from 'vitest';
import familyJson from './family.json';
import { loadFamilyData } from './load';
import { LEGACY_ROOT } from './legacy-seed';
import { migrateLegacyFamily, parseLegacyYears } from './migrate-v0';
import { buildFamilyGraph, childrenOf, descendantsOf, parentsOf, rootPerson, getUnionsOfPerson } from '../domain/graph';
import { validateFamilyData } from '../domain/validate';

const fixedNow = '2026-01-01T00:00:00.000Z';
const migration = migrateLegacyFamily(LEGACY_ROOT, { now: fixedNow });
const data = migration.data;
const graph = buildFamilyGraph(data);

describe('parseLegacyYears', () => {
  it('interpreta intervalo de vida', () => {
    expect(parseLegacyYears('1928 – 2009')).toEqual({
      birth: { year: 1928 },
      death: { year: 2009 },
    });
  });

  it('interpreta nascimento', () => {
    expect(parseLegacyYears('n. 1953')).toEqual({ birth: { year: 1953 } });
  });

  it('preserva texto não estruturado em raw', () => {
    expect(parseLegacyYears('c. 1900')).toEqual({ birth: { raw: 'c. 1900' } });
  });

  it('ignora texto vazio', () => {
    expect(parseLegacyYears('')).toEqual({});
  });
});

describe('migrateLegacyFamily', () => {
  it('produz as contagens esperadas do seed', () => {
    expect(Object.keys(data.persons)).toHaveLength(25);
    expect(Object.keys(data.unions)).toHaveLength(8);
    const childLinks = Object.values(data.unions).reduce(
      (total, union) => total + union.children.length,
      0,
    );
    expect(childLinks).toBe(16);
  });

  it('produz dados válidos e sem avisos', () => {
    const validation = validateFamilyData(data);
    expect(validation.ok).toBe(true);
    expect(validation.warnings).toEqual([]);
    expect(migration.warnings).toEqual([]);
  });

  it('define a raiz e o título', () => {
    expect(data.meta.rootPersonId).toBe('p-antonio-albuquerque');
    expect(data.meta.title).toBe('Família Albuquerque');
    expect(rootPerson(graph).name).toBe('Antônio Albuquerque');
  });

  it('recria os filhos e os pais do seed', () => {
    expect(childrenOf(graph, 'p-antonio-albuquerque').map((person) => person.name)).toEqual([
      'Beatriz Albuquerque',
      'Carlos Albuquerque',
      'Dora Albuquerque',
    ]);
    expect(parentsOf(graph, 'p-pedro-costa').map((person) => person.name)).toEqual([
      'Júlia Teixeira',
      'Daniel Costa',
    ]);
    expect(parentsOf(graph, 'p-pedro-costa')).toHaveLength(2);
  });

  it('preserva a união sem filhos de Fernanda e Tiago', () => {
    const union = data.unions['u-fernanda-mendes-tiago-prado'];
    expect(union).toBeDefined();
    expect(union?.children).toEqual([]);
    expect(union?.partners).toEqual(['p-fernanda-mendes', 'p-tiago-prado']);
  });

  it('mantém um único casamento por pessoa no seed legado', () => {
    expect(getUnionsOfPerson(graph, 'p-carlos-albuquerque')).toHaveLength(1);
  });

  it('reconhece os 16 descendentes da raiz', () => {
    expect(descendantsOf(graph, 'p-antonio-albuquerque')).toHaveLength(16);
  });

  it('mantém family.json sincronizado com a migração', () => {
    expect(familyJson.persons).toEqual(data.persons);
    expect(familyJson.unions).toEqual(data.unions);
    expect(loadFamilyData(familyJson).schemaVersion).toBe(1);
  });
});
