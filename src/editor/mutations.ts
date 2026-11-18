import type {
  FamilyData,
  PartialDate,
  Person,
  PersonId,
  Sex,
  Union,
  UnionId,
  UnionStatus,
} from '../domain/types';
import { createPersonId, createUnionId } from './ids';

/**
 * Mutações puras do documento usadas pelo editor.
 *
 * Cada função clona a entrada, aplica uma alteração pequena e devolve um novo
 * `FamilyData`. A validação final continua sendo responsabilidade de
 * `validateFamilyData`; as funções só barram erros estruturais óbvios (id
 * inexistente, união sem parceiro, filho em duas uniões).
 */

export class EditorMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorMutationError';
  }
}

export interface PersonInput {
  name: string;
  sex?: Sex;
  birthYear?: number | null;
  deathYear?: number | null;
  birthPlace?: string | null;
  bio?: string | null;
  aliases?: string[] | null;
  photo?: string | null;
  private?: boolean;
}

export interface PersonPatch {
  name?: string;
  sex?: Sex | null;
  birthYear?: number | null;
  deathYear?: number | null;
  birthPlace?: string | null;
  bio?: string | null;
  aliases?: string[] | null;
  photo?: string | null;
  private?: boolean;
}

export interface UnionInput {
  partners: PersonId[];
  children?: PersonId[];
  status?: UnionStatus | null;
  startYear?: number | null;
  endYear?: number | null;
  place?: string | null;
  note?: string | null;
}

export interface UnionPatch {
  status?: UnionStatus | null;
  startYear?: number | null;
  endYear?: number | null;
  place?: string | null;
  note?: string | null;
}

const trimOrUndefined = (value: string | null | undefined): string | undefined => {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeYear = (year: number | null | undefined): number | null | undefined => {
  if (year === undefined) return undefined;
  if (year === null) return null;
  if (!Number.isInteger(year) || year < 1) {
    throw new EditorMutationError('O ano deve ser um inteiro positivo.');
  }
  return year;
};

const withYear = (
  date: PartialDate | undefined,
  year: number | null | undefined,
): PartialDate | undefined => {
  if (year === undefined) return date ? { ...date } : undefined;

  const next: PartialDate = { ...(date ?? {}) };
  if (year === null) delete next.year;
  else next.year = year;
  return Object.keys(next).length > 0 ? next : undefined;
};

const buildPerson = (id: PersonId, input: PersonInput): Person => {
  const name = trimOrUndefined(input.name);
  if (!name) throw new EditorMutationError('O nome da pessoa é obrigatório.');

  const person: Person = { id, name };
  if (input.sex) person.sex = input.sex;

  const birth = withYear(undefined, normalizeYear(input.birthYear));
  if (birth) person.birth = birth;
  const death = withYear(undefined, normalizeYear(input.deathYear));
  if (death) person.death = death;

  const birthPlace = trimOrUndefined(input.birthPlace);
  if (birthPlace) person.birthPlace = birthPlace;
  const bio = trimOrUndefined(input.bio);
  if (bio) person.bio = bio;
  const aliases = normalizeAliases(input.aliases);
  if (aliases.length) person.aliases = aliases;
  const photo = trimOrUndefined(input.photo);
  if (photo) person.photo = photo;
  if (input.private) person.private = true;

  return person;
};

const normalizeAliases = (values: string[] | null | undefined): string[] =>
  [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];

const applyPersonPatch = (person: Person, patch: PersonPatch): void => {
  if (patch.name !== undefined) {
    const name = trimOrUndefined(patch.name);
    if (!name) throw new EditorMutationError('O nome da pessoa é obrigatório.');
    person.name = name;
  }

  if (patch.sex !== undefined) {
    if (patch.sex === null) delete person.sex;
    else person.sex = patch.sex;
  }

  if (patch.birthYear !== undefined) {
    const birth = withYear(person.birth, normalizeYear(patch.birthYear));
    if (birth) person.birth = birth;
    else delete person.birth;
  }

  if (patch.deathYear !== undefined) {
    const death = withYear(person.death, normalizeYear(patch.deathYear));
    if (death) person.death = death;
    else delete person.death;
  }

  if (patch.birthPlace !== undefined) {
    const birthPlace = trimOrUndefined(patch.birthPlace);
    if (birthPlace) person.birthPlace = birthPlace;
    else delete person.birthPlace;
  }

  if (patch.bio !== undefined) {
    const bio = trimOrUndefined(patch.bio);
    if (bio) person.bio = bio;
    else delete person.bio;
  }

  if (patch.aliases !== undefined) {
    const aliases = normalizeAliases(patch.aliases);
    if (aliases.length) person.aliases = aliases;
    else delete person.aliases;
  }

  if (patch.photo !== undefined) {
    const photo = trimOrUndefined(patch.photo);
    if (photo) person.photo = photo;
    else delete person.photo;
  }

  if (patch.private !== undefined) {
    if (patch.private) person.private = true;
    else delete person.private;
  }
};

const personName = (data: FamilyData, id: PersonId): string => {
  const person = data.persons[id];
  if (!person) throw new EditorMutationError(`Pessoa não encontrada: ${id}`);
  return person.name;
};

const requirePerson = (data: FamilyData, id: PersonId): Person => {
  const person = data.persons[id];
  if (!person) throw new EditorMutationError(`Pessoa não encontrada: ${id}`);
  return person;
};

const requireUnion = (data: FamilyData, id: UnionId): Union => {
  const union = data.unions[id];
  if (!union) throw new EditorMutationError(`União não encontrada: ${id}`);
  return union;
};

export function createPerson(
  data: FamilyData,
  input: PersonInput,
): { data: FamilyData; person: Person } {
  const next = structuredClone(data);
  const id = createPersonId(input.name, new Set(Object.keys(next.persons)));
  const person = buildPerson(id, input);
  next.persons[id] = person;
  return { data: next, person };
}

export function updatePerson(
  data: FamilyData,
  personId: PersonId,
  patch: PersonPatch,
): FamilyData {
  const next = structuredClone(data);
  applyPersonPatch(requirePerson(next, personId), patch);
  return next;
}

export function deletePerson(data: FamilyData, personId: PersonId): FamilyData {
  const next = structuredClone(data);
  requirePerson(next, personId);

  if (Object.keys(next.persons).length <= 1) {
    throw new EditorMutationError('A família precisa de pelo menos uma pessoa.');
  }

  delete next.persons[personId];

  for (const [unionId, union] of Object.entries(next.unions)) {
    const partners = union.partners.filter((id) => id !== personId);
    const children = union.children.filter((id) => id !== personId);

    if (partners.length === 0) {
      delete next.unions[unionId];
      continue;
    }

    union.partners = partners;
    union.children = children;
  }

  if (next.meta.rootPersonId === personId) {
    const fallback = Object.keys(next.persons).sort()[0];
    if (!fallback) throw new EditorMutationError('A família precisa de pelo menos uma pessoa.');
    next.meta.rootPersonId = fallback;
  }

  return next;
}

export function setRootPerson(data: FamilyData, personId: PersonId): FamilyData {
  const next = structuredClone(data);
  requirePerson(next, personId);
  next.meta.rootPersonId = personId;
  return next;
}

export function createUnion(
  data: FamilyData,
  input: UnionInput,
): { data: FamilyData; union: Union } {
  const next = structuredClone(data);
  const partners = [...input.partners];

  if (partners.length === 0) {
    throw new EditorMutationError('A união precisa de pelo menos um parceiro.');
  }
  if (new Set(partners).size !== partners.length) {
    throw new EditorMutationError('A união tem parceiros repetidos.');
  }

  for (const partnerId of partners) requirePerson(next, partnerId);

  const children = input.children ? [...input.children] : [];
  if (new Set(children).size !== children.length) {
    throw new EditorMutationError('A união tem filhos repetidos.');
  }
  for (const childId of children) {
    requirePerson(next, childId);
    if (partners.includes(childId)) {
      throw new EditorMutationError('Uma pessoa não pode ser parceira e filha da mesma união.');
    }
    if (isChildOfAnotherUnion(next, childId, null)) {
      throw new EditorMutationError('A pessoa já é filha de outra união.');
    }
  }

  const id = createUnionId(
    partners.map((partnerId) => personName(next, partnerId)),
    new Set(Object.keys(next.unions)),
  );

  const union: Union = { id, partners, children };
  if (input.status) union.status = input.status;
  const start = withYear(undefined, normalizeYear(input.startYear));
  if (start) union.start = start;
  const end = withYear(undefined, normalizeYear(input.endYear));
  if (end) union.end = end;
  const place = trimOrUndefined(input.place);
  if (place) union.place = place;
  const note = trimOrUndefined(input.note);
  if (note) union.note = note;

  next.unions[id] = union;
  return { data: next, union };
}

export function updateUnion(
  data: FamilyData,
  unionId: UnionId,
  patch: UnionPatch,
): FamilyData {
  const next = structuredClone(data);
  const union = requireUnion(next, unionId);

  if (patch.status !== undefined) {
    if (patch.status === null) delete union.status;
    else union.status = patch.status;
  }

  if (patch.startYear !== undefined) {
    const start = withYear(union.start, normalizeYear(patch.startYear));
    if (start) union.start = start;
    else delete union.start;
  }

  if (patch.endYear !== undefined) {
    const end = withYear(union.end, normalizeYear(patch.endYear));
    if (end) union.end = end;
    else delete union.end;
  }

  if (patch.place !== undefined) {
    const place = trimOrUndefined(patch.place);
    if (place) union.place = place;
    else delete union.place;
  }

  if (patch.note !== undefined) {
    const note = trimOrUndefined(patch.note);
    if (note) union.note = note;
    else delete union.note;
  }

  return next;
}

export function deleteUnion(data: FamilyData, unionId: UnionId): FamilyData {
  const next = structuredClone(data);
  requireUnion(next, unionId);
  delete next.unions[unionId];
  return next;
}

export function addPartner(
  data: FamilyData,
  unionId: UnionId,
  personId: PersonId,
): FamilyData {
  const next = structuredClone(data);
  const union = requireUnion(next, unionId);
  requirePerson(next, personId);

  if (union.partners.includes(personId)) {
    throw new EditorMutationError('A pessoa já é parceira desta união.');
  }
  if (union.children.includes(personId)) {
    throw new EditorMutationError('Uma pessoa não pode ser parceira e filha da mesma união.');
  }

  union.partners.push(personId);
  return next;
}

export function removePartner(
  data: FamilyData,
  unionId: UnionId,
  personId: PersonId,
): FamilyData {
  const next = structuredClone(data);
  const union = requireUnion(next, unionId);

  if (!union.partners.includes(personId)) {
    throw new EditorMutationError('A pessoa não é parceira desta união.');
  }
  if (union.partners.length <= 1) {
    throw new EditorMutationError(
      'A união precisa de pelo menos um parceiro. Exclua a união se ela não deve existir.',
    );
  }

  union.partners = union.partners.filter((id) => id !== personId);
  return next;
}

const isChildOfAnotherUnion = (
  data: FamilyData,
  childId: PersonId,
  exceptUnionId: UnionId | null,
): boolean =>
  Object.values(data.unions).some(
    (union) => union.id !== exceptUnionId && union.children.includes(childId),
  );

export function addChild(
  data: FamilyData,
  unionId: UnionId,
  childId: PersonId,
): FamilyData {
  const next = structuredClone(data);
  const union = requireUnion(next, unionId);
  requirePerson(next, childId);

  if (union.partners.includes(childId)) {
    throw new EditorMutationError('Uma pessoa não pode ser parceira e filha da mesma união.');
  }
  if (union.children.includes(childId)) {
    throw new EditorMutationError('A pessoa já é filha desta união.');
  }
  if (isChildOfAnotherUnion(next, childId, unionId)) {
    throw new EditorMutationError('A pessoa já é filha de outra união.');
  }

  union.children.push(childId);
  return next;
}

export function removeChild(
  data: FamilyData,
  unionId: UnionId,
  childId: PersonId,
): FamilyData {
  const next = structuredClone(data);
  const union = requireUnion(next, unionId);

  if (!union.children.includes(childId)) {
    throw new EditorMutationError('A pessoa não é filha desta união.');
  }

  union.children = union.children.filter((id) => id !== childId);
  return next;
}

export function createChildInUnion(
  data: FamilyData,
  unionId: UnionId,
  input: PersonInput,
): { data: FamilyData; person: Person } {
  requireUnion(data, unionId);
  const created = createPerson(data, input);
  const next = addChild(created.data, unionId, created.person.id);
  return { data: next, person: created.person };
}
