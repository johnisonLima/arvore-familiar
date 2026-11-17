import { getUnionsOfPerson, type FamilyGraph } from '../domain/graph';
import type { PersonId, Union, UnionId } from '../domain/types';

/**
 * Layout plano de descendência.
 *
 * Cada pessoa ocupa um bloco vertical: cartão, barras de união e, para cada
 * união, uma linha de filhos. As uniões ficam empilhadas, então segundos
 * casamentos e meios-irmãos nunca se misturam na mesma linha.
 *
 * O bloco de uma pessoa tem a largura do maior grupo de filhos (ou do cartão)
 * e a altura de todos os grupos empilhados. Os filhos são centralizados na
 * largura do bloco do genitor.
 */

const HUE_PALETTE = [34, 342, 205, 153, 262, 18, 300, 110] as const;
const ROOT_HUE = 34;

export interface TreeLayoutOptions {
  /** Gerações incluindo a raiz. `undefined` mostra todas. */
  maxGenerations?: number;
  cardWidth?: number;
  cardHeight?: number;
  siblingGap?: number;
  groupGap?: number;
  rowGap?: number;
  barHeight?: number;
}

export interface LayoutUnion {
  unionId: UnionId;
  partnerIds: PersonId[];
  /** Todos os filhos declarados na união, inclusive os não expandidos. */
  childIds: PersonId[];
  /** Filhos efetivamente posicionados nesta árvore. */
  children: PersonId[];
  hiddenChildCount: number;
  expanded: boolean;
  barX: number;
  barY: number;
  barWidth: number;
  barHeight: number;
  rowY: number | null;
  hue: number;
}

export interface LayoutNode {
  personId: PersonId;
  depth: number;
  hue: number;
  /** Bloco de conteúdo (cartão + grupos), não apenas o cartão. */
  x: number;
  y: number;
  width: number;
  height: number;
  cardX: number;
  cardY: number;
  cardWidth: number;
  cardHeight: number;
  unions: LayoutUnion[];
}

export interface LayoutEdge {
  unionId: UnionId;
  parentId: PersonId;
  childId: PersonId;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hue: number;
  dashed: boolean;
}

export interface TreeLayout {
  rootId: PersonId;
  nodes: LayoutNode[];
  byId: ReadonlyMap<PersonId, LayoutNode>;
  edges: LayoutEdge[];
  width: number;
  height: number;
  generations: number;
  unionCount: number;
  hiddenPeopleCount: number;
}

interface ResolvedOptions {
  maxGenerations: number;
  cardWidth: number;
  cardHeight: number;
  siblingGap: number;
  groupGap: number;
  rowGap: number;
  barHeight: number;
}

interface RawUnion {
  union: Union;
  partnerIds: PersonId[];
  childIds: PersonId[];
  childNodes: RawNode[];
  hiddenChildCount: number;
  expanded: boolean;
  barX: number;
  barY: number;
  rowY: number | null;
}

interface RawNode {
  personId: PersonId;
  depth: number;
  hue: number;
  unions: RawUnion[];
  width: number;
  height: number;
  x: number;
  y: number;
  cardX: number;
  cardY: number;
}

const DEFAULTS: Omit<ResolvedOptions, 'maxGenerations'> = {
  cardWidth: 240,
  cardHeight: 116,
  siblingGap: 32,
  groupGap: 16,
  rowGap: 38,
  barHeight: 30,
};

const resolveOptions = (options: TreeLayoutOptions): ResolvedOptions => {
  const maxGenerations = options.maxGenerations ?? Number.POSITIVE_INFINITY;
  if (maxGenerations < 1) {
    throw new Error('maxGenerations deve ser pelo menos 1 (a própria raiz).');
  }
  return {
    ...DEFAULTS,
    ...options,
    maxGenerations,
  };
};

const rowWidthOf = (nodes: RawNode[], siblingGap: number): number =>
  nodes.reduce((total, node, index) => total + node.width + (index > 0 ? siblingGap : 0), 0);

const unionOrder = (graph: FamilyGraph): Map<UnionId, number> => {
  const order = new Map<UnionId, number>();
  let index = 0;
  for (const unionId of graph.unions.keys()) {
    order.set(unionId, index);
    index += 1;
  }
  return order;
};

const byStartThenDocumentOrder =
  (order: Map<UnionId, number>) =>
  (a: Union, b: Union): number => {
    const aYear = a.start?.year ?? Number.POSITIVE_INFINITY;
    const bYear = b.start?.year ?? Number.POSITIVE_INFINITY;
    if (aYear !== bYear) return aYear - bYear;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  };

const buildRawTree = (
  graph: FamilyGraph,
  rootId: PersonId,
  options: ResolvedOptions,
): { root: RawNode; hiddenPeopleCount: number } => {
  const order = unionOrder(graph);
  const compareUnions = byStartThenDocumentOrder(order);
  const depthLimit = options.maxGenerations - 1;
  const visited = new Set<PersonId>([rootId]);
  const displayedUnions = new Set<UnionId>();
  let branchHueIndex = 0;
  let hiddenPeopleCount = 0;

  const build = (personId: PersonId, depth: number, hue: number): RawNode => {
    const node: RawNode = {
      personId,
      depth,
      hue,
      unions: [],
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      cardX: 0,
      cardY: 0,
    };

    const unions = getUnionsOfPerson(graph, personId).slice().sort(compareUnions);

    for (const union of unions) {
      // Uma união entre dois descendentes apareceria dos dois lados. Mostramos
      // apenas a primeira ocorrência para não posicionar o mesmo ramo duas vezes.
      if (displayedUnions.has(union.id)) continue;
      displayedUnions.add(union.id);

      const raw: RawUnion = {
        union,
        partnerIds: union.partners.filter((partnerId) => partnerId !== personId),
        childIds: [...union.children],
        childNodes: [],
        hiddenChildCount: 0,
        expanded: depth < depthLimit,
        barX: 0,
        barY: 0,
        rowY: null,
      };

      if (raw.expanded) {
        for (const childId of union.children) {
          if (visited.has(childId)) {
            raw.hiddenChildCount += 1;
            hiddenPeopleCount += 1;
            continue;
          }
          visited.add(childId);
          const childHue =
            depth === 0
              ? HUE_PALETTE[branchHueIndex++ % HUE_PALETTE.length] ?? ROOT_HUE
              : hue;
          raw.childNodes.push(build(childId, depth + 1, childHue));
        }
      } else {
        raw.hiddenChildCount = union.children.length;
        hiddenPeopleCount += union.children.length;
      }

      node.unions.push(raw);
    }

    return node;
  };

  return { root: build(rootId, 0, ROOT_HUE), hiddenPeopleCount };
};

const measure = (node: RawNode, options: ResolvedOptions): void => {
  for (const union of node.unions) {
    for (const child of union.childNodes) measure(child, options);
  }

  let width = options.cardWidth;

  for (const union of node.unions) {
    if (union.childNodes.length === 0) continue;
    width = Math.max(width, rowWidthOf(union.childNodes, options.siblingGap));
  }

  node.width = width;

  let y = options.cardHeight;
  for (const union of node.unions) {
    const barTop = y + options.groupGap;
    let bottom = barTop + options.barHeight;
    if (union.childNodes.length > 0) {
      const rowTop = bottom + options.rowGap;
      const rowHeight = Math.max(...union.childNodes.map((child) => child.height));
      bottom = rowTop + rowHeight;
    }
    y = bottom;
  }
  node.height = y;
};

const place = (node: RawNode, x: number, y: number, options: ResolvedOptions): void => {
  node.x = x;
  node.y = y;
  node.cardX = x + (node.width - options.cardWidth) / 2;
  node.cardY = y;

  let cursor = y + options.cardHeight;

  for (const union of node.unions) {
    union.barX = node.cardX;
    union.barY = cursor + options.groupGap;
    let bottom = union.barY + options.barHeight;

    if (union.childNodes.length > 0) {
      const width = rowWidthOf(union.childNodes, options.siblingGap);
      const rowX = x + (node.width - width) / 2;
      const rowY = bottom + options.rowGap;
      union.rowY = rowY;

      let childX = rowX;
      for (const child of union.childNodes) {
        place(child, childX, rowY, options);
        childX += child.width + options.siblingGap;
      }

      bottom = rowY + Math.max(...union.childNodes.map((child) => child.height));
    }

    cursor = bottom;
  }
};

const isDashed = (union: Union): boolean =>
  union.status === 'divorced' || union.status === 'separated';

const flatten = (
  root: RawNode,
  options: ResolvedOptions,
): Pick<TreeLayout, 'nodes' | 'byId' | 'edges' | 'generations' | 'unionCount'> => {
  const nodes: LayoutNode[] = [];
  const byId = new Map<PersonId, LayoutNode>();
  const edges: LayoutEdge[] = [];
  let generations = 0;
  let unionCount = 0;

  const visit = (raw: RawNode): void => {
    generations = Math.max(generations, raw.depth + 1);
    unionCount += raw.unions.length;

    const unions: LayoutUnion[] = raw.unions.map((union) => ({
      unionId: union.union.id,
      partnerIds: union.partnerIds,
      childIds: union.childIds,
      children: union.childNodes.map((child) => child.personId),
      hiddenChildCount: union.hiddenChildCount,
      expanded: union.expanded,
      barX: union.barX,
      barY: union.barY,
      barWidth: options.cardWidth,
      barHeight: options.barHeight,
      rowY: union.rowY,
      hue: raw.hue,
    }));

    const node: LayoutNode = {
      personId: raw.personId,
      depth: raw.depth,
      hue: raw.hue,
      x: raw.x,
      y: raw.y,
      width: raw.width,
      height: raw.height,
      cardX: raw.cardX,
      cardY: raw.cardY,
      cardWidth: options.cardWidth,
      cardHeight: options.cardHeight,
      unions,
    };

    nodes.push(node);
    byId.set(node.personId, node);

    for (const union of raw.unions) {
      for (const child of union.childNodes) {
        edges.push({
          unionId: union.union.id,
          parentId: raw.personId,
          childId: child.personId,
          fromX: union.barX + options.cardWidth / 2,
          fromY: union.barY + options.barHeight,
          toX: child.cardX + options.cardWidth / 2,
          toY: child.cardY,
          hue: raw.hue,
          dashed: isDashed(union.union),
        });
        visit(child);
      }
    }
  };

  visit(root);

  return { nodes, byId, edges, generations, unionCount };
};

export function buildTreeLayout(
  graph: FamilyGraph,
  rootId: PersonId,
  options: TreeLayoutOptions = {},
): TreeLayout {
  if (!graph.persons.has(rootId)) {
    throw new Error(`Pessoa raiz não encontrada: ${rootId}`);
  }

  const resolved = resolveOptions(options);
  const { root, hiddenPeopleCount } = buildRawTree(graph, rootId, resolved);

  measure(root, resolved);
  place(root, 0, 0, resolved);

  return {
    rootId,
    ...flatten(root, resolved),
    width: root.width,
    height: root.height,
    hiddenPeopleCount,
  };
}
