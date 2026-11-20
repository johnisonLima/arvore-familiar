import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/family.fixture.json';
import familyJson from '../data/family.json';
import { loadFamilyData } from '../data/load';
import { buildFamilyGraph } from '../domain/graph';
import { buildTreeLayout } from './tree';

const fixtureGraph = buildFamilyGraph(loadFamilyData(fixture));
const seedGraph = buildFamilyGraph(loadFamilyData(familyJson));

const fullFixture = buildTreeLayout(fixtureGraph, 'p-augusto');

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

describe('buildTreeLayout — fixture sintética', () => {
  it('posiciona todos os descendentes e uniões alcançáveis', () => {
    expect(fullFixture.nodes).toHaveLength(13);
    expect(fullFixture.unionCount).toBe(7);
    expect(fullFixture.generations).toBe(4);
    expect(fullFixture.rootId).toBe('p-augusto');
    expect(fullFixture.nodes[0]?.personId).toBe('p-augusto');
  });

  it('mantém as duas uniões de Carlos em linhas separadas', () => {
    const carlos = fullFixture.byId.get('p-carlos');
    expect(carlos?.unions).toHaveLength(2);

    const [first, second] = carlos?.unions ?? [];
    expect(first?.unionId).toBe('u-carlos-renata');
    expect(first?.children).toEqual(['p-gabriel']);
    expect(second?.unionId).toBe('u-carlos-marina');
    expect(second?.children).toEqual(['p-helena', 'p-igor']);

    expect(first?.rowY).not.toBeNull();
    expect(second?.rowY).not.toBeNull();
    expect(first?.rowY).not.toBe(second?.rowY);
  });

  it('registra união sem filhos como barra, sem arestas', () => {
    const gabriel = fullFixture.byId.get('p-gabriel');
    const union = gabriel?.unions.find((item) => item.unionId === 'u-gabriel-sofia');

    expect(union).toBeDefined();
    expect(union?.childIds).toEqual([]);
    expect(union?.rowY).toBeNull();
    expect(fullFixture.edges.some((edge) => edge.unionId === 'u-gabriel-sofia')).toBe(false);
  });

  it('limita a árvore por gerações relativas à raiz', () => {
    const layout = buildTreeLayout(fixtureGraph, 'p-augusto', { maxGenerations: 2 });

    expect(layout.nodes.map((node) => node.personId).sort()).toEqual([
      'p-augusto',
      'p-beatriz',
      'p-carlos',
    ]);
    expect(layout.generations).toBe(2);
    expect(layout.hiddenPeopleCount).toBe(8);

    const root = layout.byId.get('p-augusto');
    expect(root?.unions[0]?.children).toEqual(['p-beatriz', 'p-carlos']);

    const carlos = layout.byId.get('p-carlos');
    expect(carlos?.unions.every((union) => union.children.length === 0)).toBe(true);
    expect(carlos?.unions.reduce((total, union) => total + union.hiddenChildCount, 0)).toBe(3);
    expect(layout.edges).toHaveLength(2);
  });

  it('recolhe filhos por união sem removê-los do documento ou da contagem', () => {
    const layout = buildTreeLayout(fixtureGraph, 'p-augusto', {
      collapsedUnions: new Set(['u-augusto-lucia']),
    });
    const union = layout.byId.get('p-augusto')?.unions.find((item) => item.unionId === 'u-augusto-lucia');

    expect(union?.childIds).toEqual(['p-beatriz', 'p-carlos']);
    expect(union?.children).toEqual([]);
    expect(union?.hiddenChildCount).toBe(2);
    expect(layout.nodes.map((node) => node.personId)).not.toContain('p-beatriz');
    expect(layout.hiddenPeopleCount).toBeGreaterThanOrEqual(2);
  });

  it('mostra apenas a raiz com uma geração', () => {
    const layout = buildTreeLayout(fixtureGraph, 'p-augusto', { maxGenerations: 1 });

    expect(layout.nodes).toHaveLength(1);
    expect(layout.unionCount).toBe(1);
    expect(layout.edges).toHaveLength(0);
    expect(layout.hiddenPeopleCount).toBe(2);
  });

  it('reenraíza em Carlos e descarta a família de Beatriz', () => {
    const layout = buildTreeLayout(fixtureGraph, 'p-carlos');

    expect(layout.nodes.map((node) => node.personId)).toEqual(
      expect.arrayContaining(['p-carlos', 'p-gabriel', 'p-helena', 'p-igor', 'p-livia']),
    );
    expect(layout.byId.has('p-beatriz')).toBe(false);
    expect(layout.byId.has('p-dora')).toBe(false);
    expect(layout.generations).toBe(3);
    expect(layout.unionCount).toBe(4);
  });

  it('herda a cor do ramo para descendentes e troca por ramo', () => {
    const beatriz = fullFixture.byId.get('p-beatriz');
    const carlos = fullFixture.byId.get('p-carlos');
    const helena = fullFixture.byId.get('p-helena');
    const livia = fullFixture.byId.get('p-livia');

    expect(beatriz?.hue).not.toBe(carlos?.hue);
    expect(helena?.hue).toBe(carlos?.hue);
    expect(livia?.hue).toBe(helena?.hue);
  });

  it('não sobrepõe cartões', () => {
    for (let first = 0; first < fullFixture.nodes.length; first += 1) {
      for (let second = first + 1; second < fullFixture.nodes.length; second += 1) {
        const a = fullFixture.nodes[first];
        const b = fullFixture.nodes[second];
        if (!a || !b) continue;
        expect(
          overlaps(
            { x: a.cardX, y: a.cardY, width: a.cardWidth, height: a.cardHeight },
            { x: b.cardX, y: b.cardY, width: b.cardWidth, height: b.cardHeight },
          ),
        ).toBe(false);
      }
    }
  });

  it('mantém cartões e barras dentro dos limites do layout', () => {
    for (const node of fullFixture.nodes) {
      expect(node.cardX).toBeGreaterThanOrEqual(0);
      expect(node.cardY).toBeGreaterThanOrEqual(0);
      expect(node.cardX + node.cardWidth).toBeLessThanOrEqual(fullFixture.width + 0.001);
      expect(node.cardY + node.cardHeight).toBeLessThanOrEqual(fullFixture.height + 0.001);

      for (const union of node.unions) {
        expect(union.barX).toBeGreaterThanOrEqual(0);
        expect(union.barY + union.barHeight).toBeLessThanOrEqual(
          fullFixture.height + 0.001,
        );
      }
    }
  });

  it('é determinístico', () => {
    const again = buildTreeLayout(fixtureGraph, 'p-augusto');
    expect(again.nodes).toEqual(fullFixture.nodes);
    expect(again.edges).toEqual(fullFixture.edges);
    expect(again.width).toBe(fullFixture.width);
    expect(again.height).toBe(fullFixture.height);
  });
});

describe('buildTreeLayout — seed real', () => {
  it('posiciona a família migrada', () => {
    const layout = buildTreeLayout(seedGraph, 'p-antonio-albuquerque');

    expect(layout.nodes).toHaveLength(17);
    expect(layout.unionCount).toBe(8);
    expect(layout.generations).toBe(4);
    expect(layout.hiddenPeopleCount).toBe(0);
  });

  it('mostra Helena Lima na barra de união, sem criar cartão', () => {
    const layout = buildTreeLayout(seedGraph, 'p-antonio-albuquerque');
    const root = layout.byId.get('p-antonio-albuquerque');
    const union = root?.unions[0];

    expect(union?.partnerIds).toEqual(['p-helena-lima']);
    expect(union?.childIds).toEqual([
      'p-beatriz-albuquerque',
      'p-carlos-albuquerque',
      'p-dora-albuquerque',
    ]);
    expect(layout.byId.has('p-helena-lima')).toBe(false);
  });

  it('reconhece a união sem filhos de Fernanda e Tiago', () => {
    const layout = buildTreeLayout(seedGraph, 'p-antonio-albuquerque');
    const fernanda = layout.byId.get('p-fernanda-mendes');
    const union = fernanda?.unions.find(
      (item) => item.unionId === 'u-fernanda-mendes-tiago-prado',
    );

    expect(union?.partnerIds).toEqual(['p-tiago-prado']);
    expect(union?.childIds).toEqual([]);
    expect(union?.rowY).toBeNull();
  });
});
