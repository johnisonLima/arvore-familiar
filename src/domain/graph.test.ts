import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/family.fixture.json';
import {
  ancestorsOf,
  buildFamilyGraph,
  childrenIdsOf,
  childrenOf,
  descendantsOf,
  getUnionsOfPerson,
  parentIdsOf,
  parentsOf,
  personName,
  rootPerson,
  siblingsOf,
  spousesOf,
} from './graph';
import { loadFamilyData } from '../data/load';

const data = loadFamilyData(fixture);
const graph = buildFamilyGraph(data);

describe('buildFamilyGraph', () => {
  it('indexa pessoas, uniões e vínculos', () => {
    expect(graph.persons.size).toBe(22);
    expect(graph.unions.size).toBe(8);
    expect(graph.childrenOfUnion.get('u-beatriz-roberto')).toHaveLength(5);
    expect(graph.parentUnionsOf.get('p-helena')).toEqual(['u-carlos-marina']);
    expect(graph.unionsOfPerson.get('p-carlos')).toEqual([
      'u-carlos-renata',
      'u-carlos-marina',
    ]);
  });

  it('encontra a raiz', () => {
    expect(rootPerson(graph).id).toBe('p-augusto');
    expect(personName(graph, 'p-augusto')).toBe('Augusto Ferreira');
  });
});

describe('consultas de parentesco', () => {
  it('lista pais e filhos', () => {
    expect(parentIdsOf(graph, 'p-helena')).toEqual(['p-carlos', 'p-marina']);
    expect(parentsOf(graph, 'p-helena').map((person) => person.id)).toEqual([
      'p-carlos',
      'p-marina',
    ]);
    expect(childrenIdsOf(graph, 'p-beatriz')).toEqual([
      'p-ana',
      'p-bruno',
      'p-caio',
      'p-dora',
      'p-enzo',
    ]);
    expect(childrenOf(graph, 'p-beatriz')).toHaveLength(5);
  });

  it('lista cônjuges de todos os casamentos', () => {
    expect(spousesOf(graph, 'p-carlos').map((person) => person.id)).toEqual([
      'p-renata',
      'p-marina',
    ]);
    expect(spousesOf(graph, 'p-gabriel').map((person) => person.id)).toEqual(['p-sofia']);
  });

  it('distingue irmãos completos e meios-irmãos', () => {
    const helenaSiblings = siblingsOf(graph, 'p-helena');
    expect(helenaSiblings.find((sibling) => sibling.person.id === 'p-igor')?.type).toBe('full');
    expect(helenaSiblings.find((sibling) => sibling.person.id === 'p-gabriel')?.type).toBe('half');

    const gabrielSiblings = siblingsOf(graph, 'p-gabriel');
    expect(gabrielSiblings.map((sibling) => sibling.person.id).sort()).toEqual([
      'p-helena',
      'p-igor',
    ]);
    expect(gabrielSiblings.every((sibling) => sibling.type === 'half')).toBe(true);
  });

  it('lista uniões de uma pessoa', () => {
    expect(getUnionsOfPerson(graph, 'p-carlos')).toHaveLength(2);
    expect(getUnionsOfPerson(graph, 'p-sofia')).toHaveLength(1);
  });

  it('calcula descendentes com profundidade mínima', () => {
    const descendants = descendantsOf(graph, 'p-augusto');
    expect(descendants).toHaveLength(12);
    expect(descendants.find((person) => person.id === 'p-livia')?.depth).toBe(3);
    expect(descendants.find((person) => person.id === 'p-otavio')?.depth).toBe(3);

    const firstLevel = descendantsOf(graph, 'p-augusto', { maxDepth: 1 });
    expect(firstLevel.map((person) => person.id).sort()).toEqual(['p-beatriz', 'p-carlos']);
  });

  it('calcula ancestrais por todas as linhas', () => {
    const ancestors = ancestorsOf(graph, 'p-helena');
    expect(ancestors.map((person) => person.id).sort()).toEqual([
      'p-augusto',
      'p-carlos',
      'p-joana',
      'p-lucia',
      'p-marina',
      'p-paulo',
    ]);
    expect(ancestors.find((person) => person.id === 'p-joana')?.depth).toBe(2);

    const firstLevel = ancestorsOf(graph, 'p-helena', { maxDepth: 1 });
    expect(firstLevel.map((person) => person.id).sort()).toEqual(['p-carlos', 'p-marina']);
  });
});
