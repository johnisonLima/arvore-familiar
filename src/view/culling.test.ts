import { describe, expect, it } from 'vitest';
import type { LayoutEdge, LayoutNode } from '../layout/tree';
import {
  edgeInRect,
  nodeInRect,
  rectsIntersect,
  unionRect,
  viewportRect,
} from './culling';

const node = (overrides: Partial<LayoutNode> = {}): LayoutNode => ({
  personId: 'p-a',
  depth: 0,
  hue: 34,
  x: 100,
  y: 200,
  width: 240,
  height: 300,
  cardX: 100,
  cardY: 200,
  cardWidth: 240,
  cardHeight: 116,
  unions: [],
  ...overrides,
});

const edge = (overrides: Partial<LayoutEdge> = {}): LayoutEdge => ({
  unionId: 'u-a',
  parentId: 'p-a',
  childId: 'p-b',
  fromX: 100,
  fromY: 300,
  toX: 400,
  toY: 800,
  hue: 34,
  dashed: false,
  ...overrides,
});

describe('viewportRect', () => {
  it('converte translate e escala no retângulo do mundo', () => {
    const rect = viewportRect({ x: -100, y: -50, z: 2 }, 800, 600);
    expect(rect).toEqual({ left: 50, top: 25, right: 450, bottom: 325 });
  });

  it('aplica margem em pixels de tela convertida para o mundo', () => {
    const rect = viewportRect({ x: 0, y: 0, z: 2 }, 800, 600, 100);
    expect(rect).toEqual({ left: -50, top: -50, right: 450, bottom: 350 });
  });

  it('protege contra zoom zero', () => {
    const rect = viewportRect({ x: 0, y: 0, z: 0 }, 100, 100);
    expect(rect.right).toBe(100);
    expect(rect.bottom).toBe(100);
  });
});

describe('interseções', () => {
  it('une retângulos', () => {
    expect(
      unionRect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: -5, top: 5, right: 5, bottom: 20 }),
    ).toEqual({ left: -5, top: 0, right: 10, bottom: 20 });
  });

  it('detecta toque nas bordas', () => {
    expect(
      rectsIntersect(
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: 10, top: 10, right: 20, bottom: 20 },
      ),
    ).toBe(true);
  });

  it('considera o bloco inteiro da pessoa, não só o cartão', () => {
    const rect = { left: 150, top: 250, right: 200, bottom: 350 };
    const tallNode = node();
    expect(nodeInRect(tallNode, rect)).toBe(true);

    const cardOnly = node({ y: 0, height: 100 });
    expect(nodeInRect(cardOnly, rect)).toBe(false);
  });

  it('inclui aresta cujo traçado cruza a viewport', () => {
    const rect = { left: 0, top: 500, right: 800, bottom: 600 };
    expect(edgeInRect(edge(), rect)).toBe(true);
    expect(edgeInRect(edge({ fromX: 900, toX: 1200, fromY: 0, toY: 10 }), rect)).toBe(false);
  });
});
