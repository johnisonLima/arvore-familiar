import {
  CURRENT_SCHEMA_VERSION,
  type FamilyData,
  type PartialDate,
  type Person,
  type PersonId,
  type Union,
  type UnionId,
} from '../domain/types';
import type { LegacyPerson } from './legacy-seed';

export interface MigrationOptions {
  now?: string;
  title?: string;
  description?: string;
}

export interface MigrationResult {
  data: FamilyData;
  warnings: string[];
}

export interface ParsedLegacyYears {
  birth?: PartialDate;
  death?: PartialDate;
}

const normalizeName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const slugify = (value: string): string =>
  normalizeName(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sem-nome';

const uniqueId = (base: string, used: Set<string>): string => {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  const id = `${base}-${suffix}`;
  used.add(id);
  return id;
};

export function parseLegacyYears(value: string): ParsedLegacyYears {
  const text = value.trim();
  if (!text) return {};

  const range = text.match(/^(\d{4})\s*[–—-]\s*(\d{4})$/);
  if (range) {
    return {
      birth: { year: Number(range[1]) },
      death: { year: Number(range[2]) },
    };
  }

  const birth = text.match(/^n\.?\s*(\d{4})$/i);
  if (birth) return { birth: { year: Number(birth[1]) } };

  const singleYear = text.match(/^(\d{4})$/);
  if (singleYear) return { birth: { year: Number(singleYear[1]) } };

  return { birth: { raw: text } };
}

const personFromLegacy = (node: LegacyPerson, id: PersonId): Person => {
  const person: Person = {
    id,
    name: node.name.trim(),
  };
  if (node.place.trim()) person.birthPlace = node.place.trim();
  if (node.bio.trim()) person.bio = node.bio.trim();

  const dates = parseLegacyYears(node.years);
  if (dates.birth) person.birth = dates.birth;
  if (dates.death) person.death = dates.death;

  return person;
};

/**
 * Migra a árvore de linhagem única do protótipo para o modelo de uniões.
 *
 * Regras:
 * - cada card vira uma pessoa;
 * - cada cônjuge textual vira uma pessoa; se o nome casar com exatamente um card,
 *   a pessoa existente é reutilizada;
 * - cada card com cônjuge ou filhos gera uma união.
 *
 * Nomes de cônjuges que não são cards não são fundidos entre si: duas pessoas
 * diferentes com o mesmo nome continuam separadas.
 */
export function migrateLegacyFamily(
  root: LegacyPerson,
  options: MigrationOptions = {},
): MigrationResult {
  const persons: Record<PersonId, Person> = {};
  const unions: Record<UnionId, Union> = {};
  const usedPersonIds = new Set<PersonId>();
  const usedUnionIds = new Set<UnionId>();
  const warnings: string[] = [];
  const cardPersons = new Map<LegacyPerson, Person>();
  const cardPersonsByName = new Map<string, Person[]>();

  const walk = (node: LegacyPerson): void => {
    const id = uniqueId(`p-${slugify(node.name)}`, usedPersonIds);
    const person = personFromLegacy(node, id);
    persons[id] = person;
    cardPersons.set(node, person);

    const normalized = normalizeName(node.name);
    const sameName = cardPersonsByName.get(normalized) ?? [];
    sameName.push(person);
    cardPersonsByName.set(normalized, sameName);

    node.children.forEach(walk);
  };

  walk(root);

  const createSpouse = (name: string): Person => {
    const id = uniqueId(`p-${slugify(name)}`, usedPersonIds);
    const person: Person = { id, name: name.trim() };
    persons[id] = person;
    return person;
  };

  const resolveSpouse = (node: LegacyPerson, owner: Person): Person | undefined => {
    const spouseName = node.spouse.trim();
    if (!spouseName) return undefined;

    const normalizedSpouse = normalizeName(spouseName);
    if (normalizedSpouse === normalizeName(owner.name)) {
      warnings.push(
        `${owner.name}: cônjuge com o mesmo nome; uma pessoa separada foi criada para evitar união consigo mesma.`,
      );
      return createSpouse(spouseName);
    }

    const candidates = cardPersonsByName.get(normalizedSpouse) ?? [];
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      warnings.push(
        `${owner.name}: cônjuge "${spouseName}" corresponde a mais de um card; uma pessoa separada foi criada.`,
      );
    }
    return createSpouse(spouseName);
  };

  for (const node of cardPersons.keys()) {
    const owner = cardPersons.get(node);
    if (!owner) continue;

    const spouse = resolveSpouse(node, owner);
    const children = node.children
      .map((child) => cardPersons.get(child)?.id)
      .filter((childId): childId is PersonId => Boolean(childId));

    if (!spouse && children.length === 0) continue;

    const partners = spouse ? [owner.id, spouse.id] : [owner.id];
    const baseId = `u-${slugify(owner.name)}-${spouse ? slugify(spouse.name) : 'single'}`;
    const unionId = uniqueId(baseId, usedUnionIds);
    unions[unionId] = {
      id: unionId,
      partners,
      children,
    };
  }

  const rootPerson = cardPersons.get(root);
  if (!rootPerson) throw new Error('Não foi possível migrar a raiz da família.');

  const data: FamilyData = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      title: options.title ?? 'Família Albuquerque',
      description:
        options.description ??
        'Dados migrados do seed embutido no protótipo original (linhagem única).',
      rootPersonId: rootPerson.id,
      locale: 'pt-BR',
      updatedAt: options.now ?? new Date().toISOString(),
    },
    persons,
    unions,
  };

  return { data, warnings };
}
