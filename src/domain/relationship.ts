import {
  ancestorsOf,
  childrenOf,
  descendantsOf,
  parentsOf,
  siblingsOf,
  spousesOf,
  type FamilyGraph,
} from './graph';
import type { Person, PersonId, UnionId } from './types';

export type RelationshipKind = 'spouse' | 'parent' | 'child' | 'sibling';

export interface RelationshipStep {
  kind: RelationshipKind;
  personId: PersonId;
  unionId: UnionId;
}

export interface RelationshipPath {
  personIds: PersonId[];
  steps: RelationshipStep[];
  distance: number;
}

export type KinshipCategory =
  | 'self'
  | 'parent'
  | 'child'
  | 'spouse'
  | 'sibling'
  | 'grandparent'
  | 'grandchild'
  | 'great-grandparent'
  | 'great-grandchild'
  | 'uncle'
  | 'nephew'
  | 'cousin'
  | 'step-parent'
  | 'step-child'
  | 'parent-in-law'
  | 'child-in-law'
  | 'sibling-in-law'
  | 'extended'
  | 'unknown';

export interface KinshipDescription {
  term: string;
  category: KinshipCategory;
  path: RelationshipPath | null;
  detail?: string;
}

const neighborsOf = (graph: FamilyGraph, personId: PersonId): RelationshipStep[] => {
  const edges: RelationshipStep[] = [];

  for (const unionId of graph.unionsOfPerson.get(personId) ?? []) {
    const union = graph.unions.get(unionId);
    if (!union) continue;
    for (const partnerId of union.partners) {
      if (partnerId !== personId) {
        edges.push({ kind: 'spouse', personId: partnerId, unionId });
      }
    }
    for (const childId of union.children) {
      edges.push({ kind: 'child', personId: childId, unionId });
    }
  }

  for (const unionId of graph.parentUnionsOf.get(personId) ?? []) {
    const union = graph.unions.get(unionId);
    if (!union) continue;
    for (const partnerId of union.partners) {
      if (partnerId !== personId) {
        edges.push({ kind: 'parent', personId: partnerId, unionId });
      }
    }
    for (const siblingId of union.children) {
      if (siblingId !== personId) {
        edges.push({ kind: 'sibling', personId: siblingId, unionId });
      }
    }
  }

  return edges;
};

export function findRelationshipPath(
  graph: FamilyGraph,
  from: PersonId,
  to: PersonId,
): RelationshipPath | null {
  if (!graph.persons.has(from) || !graph.persons.has(to)) return null;
  if (from === to) return { personIds: [from], steps: [], distance: 0 };

  const previous = new Map<PersonId, { from: PersonId; step: RelationshipStep }>();
  const visited = new Set<PersonId>([from]);
  const queue: PersonId[] = [from];
  let found = false;

  for (let index = 0; index < queue.length && !found; index += 1) {
    const current = queue[index];
    if (!current) continue;
    for (const edge of neighborsOf(graph, current)) {
      if (visited.has(edge.personId)) continue;
      visited.add(edge.personId);
      previous.set(edge.personId, { from: current, step: edge });
      if (edge.personId === to) {
        found = true;
        break;
      }
      queue.push(edge.personId);
    }
  }

  if (!found) return null;

  const personIds: PersonId[] = [];
  const steps: RelationshipStep[] = [];
  let current: PersonId | undefined = to;
  while (current !== undefined) {
    personIds.push(current);
    const entry = previous.get(current);
    if (!entry) break;
    steps.push(entry.step);
    current = entry.from;
  }
  personIds.reverse();
  steps.reverse();

  return { personIds, steps, distance: steps.length };
}

const bySex = (person: Person, male: string, female: string, neutral: string): string => {
  if (person.sex === 'M') return male;
  if (person.sex === 'F') return female;
  return neutral;
};

const includesPerson = (people: Person[], personId: PersonId): boolean =>
  people.some((person) => person.id === personId);

const directSibling = (graph: FamilyGraph, from: PersonId, to: PersonId) =>
  siblingsOf(graph, from).find((sibling) => sibling.person.id === to);

export function describeKinship(
  graph: FamilyGraph,
  from: PersonId,
  to: PersonId,
): KinshipDescription {
  const path = findRelationshipPath(graph, from, to);
  const target = graph.persons.get(to);
  if (!target || !graph.persons.has(from)) {
    return { term: 'sem parentesco registrado', category: 'unknown', path: null };
  }
  if (from === to) {
    return { term: 'a própria pessoa', category: 'self', path };
  }

  const parent = parentsOf(graph, from).find((person) => person.id === to);
  if (parent) {
    return {
      term: bySex(parent, 'pai', 'mãe', 'pai/mãe'),
      category: 'parent',
      path,
    };
  }

  const child = childrenOf(graph, from).find((person) => person.id === to);
  if (child) {
    return {
      term: bySex(child, 'filho', 'filha', 'filho(a)'),
      category: 'child',
      path,
    };
  }

  const spouse = spousesOf(graph, from).find((person) => person.id === to);
  if (spouse) {
    return {
      term: bySex(spouse, 'esposo', 'esposa', 'cônjuge'),
      category: 'spouse',
      path,
    };
  }

  const sibling = directSibling(graph, from, to);
  if (sibling) {
    const term =
      sibling.type === 'full'
        ? bySex(sibling.person, 'irmão', 'irmã', 'irmão(ã)')
        : bySex(sibling.person, 'meio-irmão', 'meia-irmã', 'meio-irmão(ã)');
    return { term, category: 'sibling', path };
  }

  for (const fromParent of parentsOf(graph, from)) {
    if (parentsOf(graph, fromParent.id).some((person) => person.id === to)) {
      return {
        term: bySex(target, 'avô', 'avó', 'avô(ó)'),
        category: 'grandparent',
        path,
      };
    }
    if (
      siblingsOf(graph, fromParent.id).some((person) => person.person.id === to)
    ) {
      return {
        term: bySex(target, 'tio', 'tia', 'tio(a)'),
        category: 'uncle',
        path,
      };
    }
  }

  for (const fromChild of childrenOf(graph, from)) {
    if (childrenOf(graph, fromChild.id).some((person) => person.id === to)) {
      return {
        term: bySex(target, 'neto', 'neta', 'neto(a)'),
        category: 'grandchild',
        path,
      };
    }
  }

  if (ancestorsOf(graph, from, { maxDepth: 3 }).some((ancestor) => ancestor.id === to)) {
    return {
      term: bySex(target, 'bisavô', 'bisavó', 'bisavô(ó)'),
      category: 'great-grandparent',
      path,
    };
  }

  if (descendantsOf(graph, from, { maxDepth: 3 }).some((descendant) => descendant.id === to)) {
    return {
      term: bySex(target, 'bisneto', 'bisneta', 'bisneto(a)'),
      category: 'great-grandchild',
      path,
    };
  }

  for (const fromSibling of siblingsOf(graph, from)) {
    if (childrenOf(graph, fromSibling.person.id).some((person) => person.id === to)) {
      return {
        term: bySex(target, 'sobrinho', 'sobrinha', 'sobrinho(a)'),
        category: 'nephew',
        path,
      };
    }
  }

  for (const fromParent of parentsOf(graph, from)) {
    for (const parentSibling of siblingsOf(graph, fromParent.id)) {
      if (childrenOf(graph, parentSibling.person.id).some((person) => person.id === to)) {
        return {
          term: bySex(target, 'primo', 'prima', 'primo(a)'),
          category: 'cousin',
          path,
        };
      }
    }
  }

  for (const fromParent of parentsOf(graph, from)) {
    const stepParent = spousesOf(graph, fromParent.id).find(
      (person) => person.id === to && !includesPerson(parentsOf(graph, from), person.id),
    );
    if (stepParent) {
      return {
        term: bySex(stepParent, 'padrasto', 'madrasta', 'padrasto(a)'),
        category: 'step-parent',
        path,
      };
    }
  }

  for (const fromSpouse of spousesOf(graph, from)) {
    const stepChild = childrenOf(graph, fromSpouse.id).find(
      (person) => person.id === to && !includesPerson(childrenOf(graph, from), person.id),
    );
    if (stepChild) {
      return {
        term: bySex(stepChild, 'enteado', 'enteada', 'enteado(a)'),
        category: 'step-child',
        path,
      };
    }
  }

  for (const fromSpouse of spousesOf(graph, from)) {
    if (parentsOf(graph, fromSpouse.id).some((person) => person.id === to)) {
      return {
        term: bySex(target, 'sogro', 'sogra', 'sogro(a)'),
        category: 'parent-in-law',
        path,
      };
    }
  }

  for (const fromChild of childrenOf(graph, from)) {
    if (spousesOf(graph, fromChild.id).some((person) => person.id === to)) {
      return {
        term: bySex(target, 'genro', 'nora', 'genro(a)'),
        category: 'child-in-law',
        path,
      };
    }
  }

  for (const fromSibling of siblingsOf(graph, from)) {
    if (spousesOf(graph, fromSibling.person.id).some((person) => person.id === to)) {
      return {
        term: bySex(target, 'cunhado', 'cunhada', 'cunhado(a)'),
        category: 'sibling-in-law',
        path,
      };
    }
  }

  if (path) {
    return {
      term: 'parente',
      category: 'extended',
      path,
      detail: `${path.distance} ${path.distance === 1 ? 'passo' : 'passos'} de separação`,
    };
  }

  return { term: 'sem parentesco registrado', category: 'unknown', path: null };
}
