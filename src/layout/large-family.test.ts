import { describe, expect, it } from 'vitest';
import type { FamilyData, Person, Union } from '../domain/types';
import { buildFamilyGraph } from '../domain/graph';
import { buildTreeLayout } from './tree';

/** Família sintética com `couples` casais e dois filhos por casal. */
function largeFamily(couples: number): FamilyData {
  const persons: Record<string, Person> = {};
  const unions: Record<string, Union> = {};
  let personSeq = 0;
  let unionSeq = 0;

  const makePerson = (name: string): Person => {
    const id = `p-n${personSeq++}`;
    const person: Person = { id, name };
    persons[id] = person;
    return person;
  };

  const root = makePerson('Raiz');
  const queue: Array<{ person: Person; depth: number }> = [{ person: root, depth: 0 }];
  let remaining = couples;

  while (queue.length > 0 && remaining > 0) {
    const { person, depth } = queue.shift()!;
    const partner = makePerson(`Parceiro ${personSeq}`);
    const union: Union = {
      id: `u-n${unionSeq++}`,
      partners: [person.id, partner.id],
      children: [],
    };
    unions[union.id] = union;
    remaining -= 1;

    if (depth < 10 && remaining > 0) {
      for (let index = 0; index < 2 && remaining > 0; index += 1) {
        const child = makePerson(`Filho ${personSeq}`);
        union.children.push(child.id);
        queue.push({ person: child, depth: depth + 1 });
      }
    }
  }

  return {
    schemaVersion: 1,
    meta: { title: 'Família grande', rootPersonId: root.id },
    persons,
    unions,
  };
}

describe('buildTreeLayout — documento grande', () => {
  it('posiciona centenas de pessoas com coordenadas finitas', () => {
    const data = largeFamily(400);
    const graph = buildFamilyGraph(data);
    const layout = buildTreeLayout(graph, data.meta.rootPersonId);
    const expectedPeople = Object.keys(data.persons).length;

    expect(expectedPeople).toBeGreaterThan(700);
    expect(layout.nodes.length).toBeGreaterThan(700);
    expect(layout.nodes.length).toBeLessThan(expectedPeople);
    expect(layout.generations).toBeGreaterThan(5);
    expect(Number.isFinite(layout.width)).toBe(true);
    expect(Number.isFinite(layout.height)).toBe(true);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.edges.length).toBeGreaterThan(0);

    for (const node of layout.nodes) {
      expect(Number.isFinite(node.cardX)).toBe(true);
      expect(Number.isFinite(node.cardY)).toBe(true);
    }
  });
});
