import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/family.fixture.json';
import { loadFamilyData } from '../data/load';
import { buildFamilyGraph } from './graph';
import { describeKinship, findRelationshipPath } from './relationship';

const data = loadFamilyData(fixture);
const graph = buildFamilyGraph(data);

describe('findRelationshipPath', () => {
  it('encontra o caminho entre bisavô e bisneta', () => {
    const path = findRelationshipPath(graph, 'p-augusto', 'p-livia');
    expect(path?.personIds).toEqual(['p-augusto', 'p-carlos', 'p-helena', 'p-livia']);
    expect(path?.steps.map((step) => step.kind)).toEqual(['child', 'child', 'child']);
    expect(path?.distance).toBe(3);
  });

  it('encontra o caminho entre meios-irmãos passando pelo pai', () => {
    const path = findRelationshipPath(graph, 'p-gabriel', 'p-helena');
    expect(path?.personIds).toEqual(['p-gabriel', 'p-carlos', 'p-helena']);
    expect(path?.steps.map((step) => step.kind)).toEqual(['parent', 'child']);
  });

  it('retorna null para pessoa inexistente', () => {
    expect(findRelationshipPath(graph, 'p-ana', 'p-inexistente')).toBeNull();
  });

  it('retorna caminho vazio para a mesma pessoa', () => {
    expect(findRelationshipPath(graph, 'p-ana', 'p-ana')).toEqual({
      personIds: ['p-ana'],
      steps: [],
      distance: 0,
    });
  });
});

describe('describeKinship', () => {
  it.each([
    ['p-helena', 'p-carlos', 'pai'],
    ['p-carlos', 'p-helena', 'filha'],
    ['p-carlos', 'p-marina', 'esposa'],
    ['p-helena', 'p-igor', 'irmão'],
    ['p-gabriel', 'p-helena', 'meia-irmã'],
    ['p-helena', 'p-augusto', 'avô'],
    ['p-augusto', 'p-helena', 'neta'],
    ['p-ana', 'p-carlos', 'tio'],
    ['p-carlos', 'p-ana', 'sobrinha'],
    ['p-ana', 'p-gabriel', 'primo'],
    ['p-gabriel', 'p-marina', 'madrasta'],
    ['p-marina', 'p-gabriel', 'enteado'],
    ['p-carlos', 'p-joana', 'sogra'],
    ['p-joana', 'p-carlos', 'genro'],
    ['p-beatriz', 'p-renata', 'cunhada'],
    ['p-livia', 'p-augusto', 'bisavô'],
    ['p-augusto', 'p-livia', 'bisneta'],
  ])('descreve %s → %s como %s', (from, to, term) => {
    const description = describeKinship(graph, from, to);
    expect(description.term).toBe(term);
    expect(description.path).not.toBeNull();
  });

  it('usa fallback para parentesco distante', () => {
    const description = describeKinship(graph, 'p-ana', 'p-livia');
    expect(description.category).toBe('extended');
    expect(description.term).toBe('parente');
    expect(description.detail).toContain('passos');
  });

  it('trata a própria pessoa', () => {
    expect(describeKinship(graph, 'p-ana', 'p-ana')).toMatchObject({
      term: 'a própria pessoa',
      category: 'self',
    });
  });

  it('trata pessoa inexistente', () => {
    expect(describeKinship(graph, 'p-ana', 'p-inexistente')).toMatchObject({
      term: 'sem parentesco registrado',
      category: 'unknown',
      path: null,
    });
  });
});
