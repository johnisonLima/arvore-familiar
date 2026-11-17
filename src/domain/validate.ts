import {
  CURRENT_SCHEMA_VERSION,
  type FamilyData,
  type PartialDate,
  type PersonId,
  type UnionId,
  type UnionStatus,
} from './types';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const SEXES = new Set(['M', 'F', 'X', 'U']);
const STATUSES = new Set<UnionStatus>([
  'married',
  'partners',
  'divorced',
  'separated',
  'widowed',
  'unknown',
]);
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isNonEmptyString);

const compareDates = (a: PartialDate, b: PartialDate): number => {
  const aValue = (a.year ?? 0) * 10000 + (a.month ?? 0) * 100 + (a.day ?? 0);
  const bValue = (b.year ?? 0) * 10000 + (b.month ?? 0) * 100 + (b.day ?? 0);
  return aValue - bValue;
};

const describeDate = (date: PartialDate): string => {
  if (date.raw) return date.raw;
  const parts = [date.year, date.month, date.day].filter((part) => part != null);
  return parts.length ? parts.join('-') : '(data vazia)';
};

const formatIssues = (issues: ValidationIssue[]): string =>
  issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => `- ${issue.path}: ${issue.message} (${issue.code})`)
    .join('\n');

export class FamilyValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(`Dados familiares inválidos:\n${formatIssues(issues)}`);
    this.name = 'FamilyValidationError';
    this.issues = issues;
  }
}

export function validateFamilyData(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  const add = (
    severity: ValidationSeverity,
    code: string,
    path: string,
    message: string,
  ): void => {
    issues.push({ severity, code, path, message });
  };
  const error = (code: string, path: string, message: string): void =>
    add('error', code, path, message);
  const warning = (code: string, path: string, message: string): void =>
    add('warning', code, path, message);

  const finish = (): ValidationResult => {
    const errors = issues.filter((issue) => issue.severity === 'error');
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    return { ok: errors.length === 0, issues, errors, warnings };
  };

  if (!isRecord(input)) {
    error('INVALID_DOCUMENT', '$', 'o documento deve ser um objeto JSON');
    return finish();
  }

  if (input.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    error(
      'UNSUPPORTED_SCHEMA',
      '$.schemaVersion',
      `esperado ${CURRENT_SCHEMA_VERSION}; recebido ${String(input.schemaVersion)}`,
    );
  }

  const meta = input.meta;
  if (!isRecord(meta)) {
    error('INVALID_META', '$.meta', 'meta deve ser um objeto');
  } else {
    if (!isNonEmptyString(meta.title)) error('INVALID_TITLE', '$.meta.title', 'título obrigatório');
    if (!isNonEmptyString(meta.rootPersonId)) {
      error('INVALID_ROOT', '$.meta.rootPersonId', 'rootPersonId obrigatório');
    }
    if (meta.description !== undefined && typeof meta.description !== 'string') {
      error('INVALID_DESCRIPTION', '$.meta.description', 'description deve ser string');
    }
    if (meta.locale !== undefined && typeof meta.locale !== 'string') {
      error('INVALID_LOCALE', '$.meta.locale', 'locale deve ser string');
    }
    if (meta.updatedAt !== undefined) {
      if (typeof meta.updatedAt !== 'string' || Number.isNaN(Date.parse(meta.updatedAt))) {
        error('INVALID_UPDATED_AT', '$.meta.updatedAt', 'updatedAt deve ser uma data ISO válida');
      }
    }
  }

  const personsInput = isRecord(input.persons) ? input.persons : {};
  const unionsInput = isRecord(input.unions) ? input.unions : {};
  if (!isRecord(input.persons)) error('INVALID_PERSONS', '$.persons', 'persons deve ser um objeto');
  if (!isRecord(input.unions)) error('INVALID_UNIONS', '$.unions', 'unions deve ser um objeto');

  const personIds = new Set(Object.keys(personsInput));
  const unionIds = new Set(Object.keys(unionsInput));
  const parentUnionCount = new Map<PersonId, number>();
  const firstParentUnion = new Map<PersonId, UnionId>();

  const validatePartialDate = (value: unknown, path: string): PartialDate | undefined => {
    if (value === undefined) return undefined;
    if (!isRecord(value)) {
      error('INVALID_DATE', path, 'data deve ser um objeto');
      return undefined;
    }
    if (value.year !== undefined && (!Number.isInteger(value.year) || Number(value.year) < 1)) {
      error('INVALID_DATE_YEAR', `${path}.year`, 'ano deve ser um inteiro positivo');
    }
    if (
      value.month !== undefined &&
      (!Number.isInteger(value.month) || Number(value.month) < 1 || Number(value.month) > 12)
    ) {
      error('INVALID_DATE_MONTH', `${path}.month`, 'mês deve estar entre 1 e 12');
    }
    if (
      value.day !== undefined &&
      (!Number.isInteger(value.day) || Number(value.day) < 1 || Number(value.day) > 31)
    ) {
      error('INVALID_DATE_DAY', `${path}.day`, 'dia deve estar entre 1 e 31');
    }
    if (value.month == null && value.day != null) {
      warning('DATE_DAY_WITHOUT_MONTH', path, 'dia informado sem mês');
    }
    if (value.approx !== undefined && typeof value.approx !== 'boolean') {
      error('INVALID_DATE_APPROX', `${path}.approx`, 'approx deve ser booleano');
    }
    if (value.raw !== undefined && typeof value.raw !== 'string') {
      error('INVALID_DATE_RAW', `${path}.raw`, 'raw deve ser string');
    }
    return value as PartialDate;
  };

  for (const [key, rawPerson] of Object.entries(personsInput)) {
    const path = `$.persons.${key}`;
    if (DANGEROUS_KEYS.has(key)) {
      error('DANGEROUS_KEY', path, 'chave reservada não permitida');
      continue;
    }
    if (!isRecord(rawPerson)) {
      error('INVALID_PERSON', path, 'pessoa deve ser um objeto');
      continue;
    }
    if (rawPerson.id !== key) {
      error('PERSON_ID_MISMATCH', `${path}.id`, `id "${String(rawPerson.id)}" difere da chave`);
    }
    if (!isNonEmptyString(rawPerson.id)) error('INVALID_PERSON_ID', `${path}.id`, 'id obrigatório');
    if (!isNonEmptyString(rawPerson.name)) error('INVALID_PERSON_NAME', `${path}.name`, 'nome obrigatório');

    if (rawPerson.sex !== undefined && !SEXES.has(String(rawPerson.sex))) {
      error('INVALID_SEX', `${path}.sex`, `sex inválido: ${String(rawPerson.sex)}`);
    }
    if (rawPerson.birthPlace !== undefined && typeof rawPerson.birthPlace !== 'string') {
      error('INVALID_BIRTH_PLACE', `${path}.birthPlace`, 'birthPlace deve ser string');
    }
    if (rawPerson.bio !== undefined && typeof rawPerson.bio !== 'string') {
      error('INVALID_BIO', `${path}.bio`, 'bio deve ser string');
    }
    if (rawPerson.private !== undefined && typeof rawPerson.private !== 'boolean') {
      error('INVALID_PRIVATE', `${path}.private`, 'private deve ser booleano');
    }
    if (rawPerson.aliases !== undefined && !isStringArray(rawPerson.aliases)) {
      error('INVALID_ALIASES', `${path}.aliases`, 'aliases deve ser string[] não vazio');
    }
    if (rawPerson.photo !== undefined) {
      if (typeof rawPerson.photo !== 'string') {
        error('INVALID_PHOTO', `${path}.photo`, 'photo deve ser string');
      } else {
        if (/^\s*javascript:/i.test(rawPerson.photo)) {
          error('UNSAFE_PHOTO', `${path}.photo`, 'esquema javascript: não permitido');
        }
        if (/^\s*data:/i.test(rawPerson.photo)) {
          warning('INLINE_PHOTO', `${path}.photo`, 'evite base64 no JSON; use um asset');
        }
      }
    }

    const birth = validatePartialDate(rawPerson.birth, `${path}.birth`);
    const death = validatePartialDate(rawPerson.death, `${path}.death`);
    if (birth?.year && death?.year && compareDates(birth, death) > 0) {
      warning('DEATH_BEFORE_BIRTH', path, 'morte anterior ao nascimento');
    }
  }

  for (const [key, rawUnion] of Object.entries(unionsInput)) {
    const path = `$.unions.${key}`;
    if (DANGEROUS_KEYS.has(key)) {
      error('DANGEROUS_KEY', path, 'chave reservada não permitida');
      continue;
    }
    if (!isRecord(rawUnion)) {
      error('INVALID_UNION', path, 'união deve ser um objeto');
      continue;
    }
    if (rawUnion.id !== key) {
      error('UNION_ID_MISMATCH', `${path}.id`, `id "${String(rawUnion.id)}" difere da chave`);
    }
    if (!isNonEmptyString(rawUnion.id)) error('INVALID_UNION_ID', `${path}.id`, 'id obrigatório');

    const partners = rawUnion.partners;
    const children = rawUnion.children;
    if (!isStringArray(partners) || partners.length === 0) {
      error('INVALID_PARTNERS', `${path}.partners`, 'partners deve ser string[] não vazio');
    }
    if (!isStringArray(children)) {
      error('INVALID_CHILDREN', `${path}.children`, 'children deve ser string[]');
    }

    const partnerList = isStringArray(partners) ? partners : [];
    const childList = isStringArray(children) ? children : [];

    if (new Set(partnerList).size !== partnerList.length) {
      error('DUPLICATE_PARTNER', `${path}.partners`, 'parceiro duplicado');
    }
    if (new Set(childList).size !== childList.length) {
      error('DUPLICATE_CHILD', `${path}.children`, 'filho duplicado');
    }
    if (partnerList.length > 2) {
      warning('MANY_PARTNERS', `${path}.partners`, 'união com mais de dois parceiros');
    }

    for (const partnerId of partnerList) {
      if (!personIds.has(partnerId)) {
        error('MISSING_PARTNER', `${path}.partners`, `pessoa inexistente: ${partnerId}`);
      }
    }
    for (const childId of childList) {
      if (!personIds.has(childId)) {
        error('MISSING_CHILD', `${path}.children`, `pessoa inexistente: ${childId}`);
      }
      if (partnerList.includes(childId)) {
        error('CHILD_IS_PARTNER', `${path}.children`, `${childId} é parceiro e filho da mesma união`);
      }
      const count = (parentUnionCount.get(childId) ?? 0) + 1;
      parentUnionCount.set(childId, count);
      if (!firstParentUnion.has(childId)) firstParentUnion.set(childId, key);
      if (count > 1) {
        error(
          'MULTIPLE_PARENT_UNIONS',
          `${path}.children`,
          `${childId} é filho de mais de uma união (${firstParentUnion.get(childId)}, ${key})`,
        );
      }
    }

    if (rawUnion.status !== undefined && !STATUSES.has(rawUnion.status as UnionStatus)) {
      error('INVALID_STATUS', `${path}.status`, `status inválido: ${String(rawUnion.status)}`);
    }
    if (rawUnion.place !== undefined && typeof rawUnion.place !== 'string') {
      error('INVALID_UNION_PLACE', `${path}.place`, 'place deve ser string');
    }
    if (rawUnion.note !== undefined && typeof rawUnion.note !== 'string') {
      error('INVALID_UNION_NOTE', `${path}.note`, 'note deve ser string');
    }

    const start = validatePartialDate(rawUnion.start, `${path}.start`);
    const end = validatePartialDate(rawUnion.end, `${path}.end`);
    if (start && end && start.year && end.year && compareDates(start, end) > 0) {
      error('END_BEFORE_START', path, `fim (${describeDate(end)}) anterior ao início (${describeDate(start)})`);
    }
    const status = rawUnion.status as UnionStatus | undefined;
    if ((status === 'divorced' || status === 'separated') && !end) {
      warning('ENDED_WITHOUT_END_DATE', path, `status ${status} sem data de fim`);
    }
  }

  if (isRecord(meta) && isNonEmptyString(meta.rootPersonId) && !personIds.has(meta.rootPersonId)) {
    error('MISSING_ROOT', '$.meta.rootPersonId', `pessoa raiz inexistente: ${meta.rootPersonId}`);
  }

  const unionIdSet = new Set(unionIds);
  const cycleState = new Map<PersonId, 0 | 1 | 2>();
  const visit = (personId: PersonId, stack: PersonId[]): void => {
    const state = cycleState.get(personId) ?? 0;
    if (state === 1) {
      const start = stack.indexOf(personId);
      const cycle = [...stack.slice(start), personId].join(' -> ');
      error('ANCESTRY_CYCLE', '$.unions', `ciclo de ancestralidade: ${cycle}`);
      return;
    }
    if (state === 2) return;
    cycleState.set(personId, 1);
    const parentUnionId = firstParentUnion.get(personId);
    const parentUnion = parentUnionId ? unionsInput[parentUnionId] : undefined;
    if (isRecord(parentUnion) && isStringArray(parentUnion.partners)) {
      for (const parentId of parentUnion.partners) {
        if (personIds.has(parentId)) visit(parentId, [...stack, personId]);
      }
    }
    cycleState.set(personId, 2);
  };
  for (const personId of personIds) visit(personId, []);

  const ageWarnings = new Set<string>();
  for (const [unionId, rawUnion] of Object.entries(unionsInput)) {
    if (!unionIdSet.has(unionId) || !isRecord(rawUnion)) continue;
    const partners = isStringArray(rawUnion.partners) ? rawUnion.partners : [];
    const children = isStringArray(rawUnion.children) ? rawUnion.children : [];
    for (const childId of children) {
      const child = personsInput[childId];
      if (!isRecord(child) || !isRecord(child.birth) || typeof child.birth.year !== 'number') continue;
      for (const parentId of partners) {
        const parent = personsInput[parentId];
        if (!isRecord(parent) || !isRecord(parent.birth) || typeof parent.birth.year !== 'number') {
          continue;
        }
        const age = child.birth.year - parent.birth.year;
        if (age < 12 || age > 70) {
          const key = `${parentId}->${childId}`;
          if (ageWarnings.has(key)) continue;
          ageWarnings.add(key);
          warning(
            'IMPLAUSIBLE_PARENT_AGE',
            `$.persons.${childId}`,
            `idade do genitor ${parentId} no nascimento: ${age}`,
          );
        }
      }
    }
  }

  return finish();
}

export function assertFamilyData(input: unknown): asserts input is FamilyData {
  const result = validateFamilyData(input);
  if (!result.ok) throw new FamilyValidationError(result.errors);
}
