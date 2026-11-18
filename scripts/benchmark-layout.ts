import type { FamilyData, Person, Union } from '../src/domain/types';
import { buildFamilyGraph } from '../src/domain/graph';
import { buildTreeLayout } from '../src/layout/tree';

/**
 * Gera uma família binária sintética (casais com dois filhos) até `maxPeople`.
 * Serve para medir layout/grafo em documentos maiores que o seed real, sem
 * tocar nos dados de produção.
 */
function generateFamily(maxPeople = 2000): FamilyData {
  const persons: Record<string, Person> = {};
  const unions: Record<string, Union> = {};
  let personSeq = 0;
  let unionSeq = 0;
  const nextPerson = (name: string): Person => {
    const id = `p-${personSeq++}`;
    const person: Person = { id, name };
    persons[id] = person;
    return person;
  };

  const root = nextPerson('Raiz');
  const queue: Array<{ person: Person; depth: number }> = [{ person: root, depth: 0 }];
  const maxDepth = 12;

  while (queue.length > 0 && personSeq + 2 <= maxPeople) {
    const { person, depth } = queue.shift()!;
    const partner = nextPerson(`Parceiro ${personSeq}`);
    const union: Union = {
      id: `u-${unionSeq++}`,
      partners: [person.id, partner.id],
      children: [],
    };
    unions[union.id] = union;

    if (depth < maxDepth) {
      for (let childIndex = 0; childIndex < 2 && personSeq < maxPeople; childIndex += 1) {
        const child = nextPerson(`Filho ${personSeq}`);
        union.children.push(child.id);
        queue.push({ person: child, depth: depth + 1 });
      }
    }
  }

  return {
    schemaVersion: 1,
    meta: { title: 'Família sintética', rootPersonId: root.id, updatedAt: new Date(0).toISOString() },
    persons,
    unions,
  };
}

function run(label: string, data: FamilyData): void {
  const graphStart = performance.now();
  const graph = buildFamilyGraph(data);
  const graphMs = performance.now() - graphStart;

  const runs = 5;
  let best = Number.POSITIVE_INFINITY;
  let worst = 0;
  let last = buildTreeLayout(graph, graph.data.meta.rootPersonId);

  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    last = buildTreeLayout(graph, graph.data.meta.rootPersonId);
    const elapsed = performance.now() - started;
    best = Math.min(best, elapsed);
    worst = Math.max(worst, elapsed);
  }

  console.log(
    [
      label,
      `${Object.keys(data.persons).length} pessoas`,
      `${Object.keys(data.unions).length} uniões`,
      `grafo ${graphMs.toFixed(1)} ms`,
      `layout ${best.toFixed(1)}–${worst.toFixed(1)} ms`,
      `${last.nodes.length} cartões`,
      `${last.edges.length} arestas`,
      `${Math.round(last.width)}×${Math.round(last.height)}`,
    ].join(' · '),
  );
}

run('família 2k', generateFamily(2000));
run('família 500', generateFamily(500));
