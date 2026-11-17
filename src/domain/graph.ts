import type { FamilyData, Person, PersonId, Union, UnionId } from './types';

export interface FamilyGraph {
  data: FamilyData;
  persons: ReadonlyMap<PersonId, Person>;
  unions: ReadonlyMap<UnionId, Union>;
  unionsOfPerson: ReadonlyMap<PersonId, readonly UnionId[]>;
  parentUnionsOf: ReadonlyMap<PersonId, readonly UnionId[]>;
  childrenOfUnion: ReadonlyMap<UnionId, readonly PersonId[]>;
}

export interface Sibling {
  person: Person;
  type: 'full' | 'half';
  sharedParentIds: PersonId[];
}

export interface Descendant {
  id: PersonId;
  depth: number;
  viaUnionId: UnionId;
}

export interface Ancestor {
  id: PersonId;
  depth: number;
  viaUnionId: UnionId;
}

const pushToMap = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
};

const requirePerson = (graph: FamilyGraph, personId: PersonId): Person => {
  const person = graph.persons.get(personId);
  if (!person) throw new Error(`Pessoa não encontrada no grafo: ${personId}`);
  return person;
};

const requireUnion = (graph: FamilyGraph, unionId: UnionId): Union => {
  const union = graph.unions.get(unionId);
  if (!union) throw new Error(`União não encontrada no grafo: ${unionId}`);
  return union;
};

const unique = <T>(values: T[]): T[] => [...new Set(values)];

export function buildFamilyGraph(data: FamilyData): FamilyGraph {
  const persons = new Map<PersonId, Person>(Object.entries(data.persons));
  const unions = new Map<UnionId, Union>(Object.entries(data.unions));
  const unionsOfPerson = new Map<PersonId, UnionId[]>();
  const parentUnionsOf = new Map<PersonId, UnionId[]>();
  const childrenOfUnion = new Map<UnionId, PersonId[]>();

  for (const union of unions.values()) {
    for (const partnerId of union.partners) {
      pushToMap(unionsOfPerson, partnerId, union.id);
    }
    for (const childId of union.children) {
      pushToMap(childrenOfUnion, union.id, childId);
      pushToMap(parentUnionsOf, childId, union.id);
    }
  }

  return {
    data,
    persons,
    unions,
    unionsOfPerson,
    parentUnionsOf,
    childrenOfUnion,
  };
}

export function getUnionsOfPerson(graph: FamilyGraph, personId: PersonId): Union[] {
  return (graph.unionsOfPerson.get(personId) ?? []).map((unionId) =>
    requireUnion(graph, unionId),
  );
}

export function getParentUnions(graph: FamilyGraph, personId: PersonId): Union[] {
  return (graph.parentUnionsOf.get(personId) ?? []).map((unionId) =>
    requireUnion(graph, unionId),
  );
}

export function parentIdsOf(graph: FamilyGraph, personId: PersonId): PersonId[] {
  const parentIds: PersonId[] = [];
  for (const union of getParentUnions(graph, personId)) {
    for (const partnerId of union.partners) {
      if (partnerId !== personId) parentIds.push(partnerId);
    }
  }
  return unique(parentIds);
}

export function parentsOf(graph: FamilyGraph, personId: PersonId): Person[] {
  return parentIdsOf(graph, personId).map((parentId) => requirePerson(graph, parentId));
}

export function childrenIdsOf(graph: FamilyGraph, personId: PersonId): PersonId[] {
  const childIds: PersonId[] = [];
  for (const union of getUnionsOfPerson(graph, personId)) {
    childIds.push(...union.children);
  }
  return unique(childIds);
}

export function childrenOf(graph: FamilyGraph, personId: PersonId): Person[] {
  return childrenIdsOf(graph, personId).map((childId) => requirePerson(graph, childId));
}

export function spousesOf(graph: FamilyGraph, personId: PersonId): Person[] {
  const spouseIds: PersonId[] = [];
  for (const union of getUnionsOfPerson(graph, personId)) {
    for (const partnerId of union.partners) {
      if (partnerId !== personId) spouseIds.push(partnerId);
    }
  }
  return unique(spouseIds).map((spouseId) => requirePerson(graph, spouseId));
}

export function siblingsOf(graph: FamilyGraph, personId: PersonId): Sibling[] {
  const result = new Map<PersonId, Sibling>();
  const ownParentIds = parentIdsOf(graph, personId);

  // Irmãos não são apenas os filhos da mesma união: um genitor pode ter
  // filhos em outra união, gerando meios-irmãos. Percorremos todas as uniões
  // em que cada genitor é parceiro e filtramos pela interseção de pais.
  for (const parentId of ownParentIds) {
    for (const union of getUnionsOfPerson(graph, parentId)) {
      for (const siblingId of union.children) {
        if (siblingId === personId) continue;
        const siblingParentIds = parentIdsOf(graph, siblingId);
        const sharedParentIds = ownParentIds.filter((candidateParentId) =>
          siblingParentIds.includes(candidateParentId),
        );
        if (sharedParentIds.length === 0) continue;
        const fullSibling =
          sharedParentIds.length === ownParentIds.length &&
          sharedParentIds.length === siblingParentIds.length;
        const type: Sibling['type'] = fullSibling ? 'full' : 'half';
        const current = result.get(siblingId);
        if (!current || (current.type === 'half' && type === 'full')) {
          result.set(siblingId, {
            person: requirePerson(graph, siblingId),
            type,
            sharedParentIds,
          });
        }
      }
    }
  }

  return [...result.values()];
}

export function descendantsOf(
  graph: FamilyGraph,
  personId: PersonId,
  options: { maxDepth?: number } = {},
): Descendant[] {
  const { maxDepth } = options;
  const result = new Map<PersonId, Descendant>();
  const queue: Array<{ id: PersonId; depth: number }> = [{ id: personId, depth: 0 }];
  const visited = new Set<PersonId>([personId]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) continue;
    if (maxDepth !== undefined && current.depth >= maxDepth) continue;

    for (const union of getUnionsOfPerson(graph, current.id)) {
      for (const childId of union.children) {
        if (visited.has(childId)) continue;
        visited.add(childId);
        const depth = current.depth + 1;
        result.set(childId, { id: childId, depth, viaUnionId: union.id });
        queue.push({ id: childId, depth });
      }
    }
  }

  return [...result.values()];
}

export function ancestorsOf(
  graph: FamilyGraph,
  personId: PersonId,
  options: { maxDepth?: number } = {},
): Ancestor[] {
  const { maxDepth } = options;
  const result = new Map<PersonId, Ancestor>();
  const queue: Array<{ id: PersonId; depth: number }> = [{ id: personId, depth: 0 }];
  const visited = new Set<PersonId>([personId]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) continue;
    if (maxDepth !== undefined && current.depth >= maxDepth) continue;

    for (const union of getParentUnions(graph, current.id)) {
      for (const parentId of union.partners) {
        if (parentId === current.id || visited.has(parentId)) continue;
        visited.add(parentId);
        const depth = current.depth + 1;
        result.set(parentId, { id: parentId, depth, viaUnionId: union.id });
        queue.push({ id: parentId, depth });
      }
    }
  }

  return [...result.values()];
}

export function rootPerson(graph: FamilyGraph): Person {
  return requirePerson(graph, graph.data.meta.rootPersonId);
}

export function personName(graph: FamilyGraph, personId: PersonId): string {
  return requirePerson(graph, personId).name;
}
