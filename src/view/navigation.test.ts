import { describe, expect, it } from 'vitest';
import type { LayoutNode } from '../layout/tree';
import { findDirectionalNode } from './navigation';

const at = (personId: string, cardX: number, cardY: number): LayoutNode => ({
  personId,
  depth: 0,
  hue: 34,
  x: cardX,
  y: cardY,
  width: 240,
  height: 140,
  cardX,
  cardY,
  cardWidth: 240,
  cardHeight: 116,
  unions: [],
});

const grid = [
  at('p-center', 400, 400),
  at('p-left', 100, 390),
  at('p-right', 700, 410),
  at('p-up', 410, 100),
  at('p-down', 390, 700),
  at('p-diagonal', 720, 900),
];

describe('findDirectionalNode', () => {
  it('encontra o vizinho em cada direção', () => {
    expect(findDirectionalNode(grid, 'p-center', 'left')).toBe('p-left');
    expect(findDirectionalNode(grid, 'p-center', 'right')).toBe('p-right');
    expect(findDirectionalNode(grid, 'p-center', 'up')).toBe('p-up');
    expect(findDirectionalNode(grid, 'p-center', 'down')).toBe('p-down');
  });

  it('prefere alinhamento no eixo principal', () => {
    const nodes = [
      at('p-from', 400, 400),
      at('p-near-row', 700, 420),
      at('p-far-diagonal', 900, 900),
    ];
    expect(findDirectionalNode(nodes, 'p-from', 'right')).toBe('p-near-row');
  });

  it('retorna null quando não há cartão na direção', () => {
    expect(findDirectionalNode([at('p-only', 0, 0)], 'p-only', 'right')).toBeNull();
    expect(findDirectionalNode(grid, 'p-desconhecido', 'right')).toBeNull();
  });
});
