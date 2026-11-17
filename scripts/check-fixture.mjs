import { readFileSync } from 'node:fs';

const fixtureUrl = new URL('../fixtures/family.fixture.json', import.meta.url);
const data = JSON.parse(readFileSync(fixtureUrl, 'utf8'));

const errors = [];
const warnings = [];
const err = (message) => errors.push(message);
const warn = (message) => warnings.push(message);
const check = (condition, message, scenario) => {
  if (!condition) err(message);
  else if (scenario) scenarios.push(scenario);
};

const scenarios = [];
const persons = new Map(Object.entries(data.persons ?? {}));
const unions = new Map(Object.entries(data.unions ?? {}));
const parentUnionOf = new Map();
const unionsOfPerson = new Map();
const childrenOfUnion = new Map();

const pushToMap = (map, key, value) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
};

const inRange = (value, min, max) =>
  value == null || (Number.isInteger(value) && value >= min && value <= max);

const checkDate = (label, date) => {
  if (!date) return;
  if (date.year != null && (!Number.isInteger(date.year) || date.year < 1)) {
    err(`${label}: ano inválido`);
  }
  if (!inRange(date.month, 1, 12)) err(`${label}: mês inválido`);
  if (!inRange(date.day, 1, 31)) err(`${label}: dia inválido`);
  if (date.month == null && date.day != null) {
    warn(`${label}: dia informado sem mês`);
  }
};

const compareDates = (a, b) => {
  if (!a?.year || !b?.year) return 0;
  if (a.year !== b.year) return a.year - b.year;
  return (a.month ?? 0) - (b.month ?? 0);
};

if (data.schemaVersion !== 1) err(`schemaVersion esperado: 1; recebido: ${data.schemaVersion}`);
if (!data.meta || typeof data.meta !== 'object') err('meta ausente');
if (data.meta?.title && typeof data.meta.title !== 'string') err('meta.title deve ser string');
if (data.meta?.updatedAt && Number.isNaN(Date.parse(data.meta.updatedAt))) {
  err('meta.updatedAt não é uma data ISO válida');
}

for (const [key, person] of persons) {
  if (!person || typeof person !== 'object') {
    err(`pessoa ${key}: valor inválido`);
    continue;
  }
  if (person.id !== key) err(`pessoa ${key}: id "${person.id}" difere da chave`);
  if (typeof person.id !== 'string' || !person.id.trim()) err(`pessoa ${key}: id vazio`);
  if (typeof person.name !== 'string' || !person.name.trim()) err(`pessoa ${key}: nome vazio`);
  if (person.sex != null && !['M', 'F', 'X', 'U'].includes(person.sex)) {
    err(`pessoa ${key}: sex inválido (${person.sex})`);
  }
  checkDate(`pessoa ${key} (nascimento)`, person.birth);
  checkDate(`pessoa ${key} (morte)`, person.death);
  if (person.birth?.year && person.death?.year && person.death.year < person.birth.year) {
    err(`pessoa ${key}: morte anterior ao nascimento`);
  }
  if (person.photo && /^\s*javascript:/i.test(person.photo)) {
    err(`pessoa ${key}: photo com esquema não permitido`);
  }
  if (person.aliases != null && (!Array.isArray(person.aliases) || person.aliases.some((a) => typeof a !== 'string'))) {
    err(`pessoa ${key}: aliases deve ser string[]`);
  }
}

const allowedStatuses = new Set(['married', 'partners', 'divorced', 'separated', 'widowed', 'unknown']);

for (const [key, union] of unions) {
  if (!union || typeof union !== 'object') {
    err(`união ${key}: valor inválido`);
    continue;
  }
  if (union.id !== key) err(`união ${key}: id "${union.id}" difere da chave`);
  if (typeof union.id !== 'string' || !union.id.trim()) err(`união ${key}: id vazio`);
  if (!Array.isArray(union.partners) || union.partners.length === 0) {
    err(`união ${key}: precisa de ao menos um parceiro`);
  }
  if (!Array.isArray(union.children)) err(`união ${key}: children deve ser um array`);
  if (union.status != null && !allowedStatuses.has(union.status)) {
    err(`união ${key}: status inválido (${union.status})`);
  }
  checkDate(`união ${key} (início)`, union.start);
  checkDate(`união ${key} (fim)`, union.end);
  if (compareDates(union.start, union.end) > 0) err(`união ${key}: fim anterior ao início`);
  if (['divorced', 'separated'].includes(union.status) && !union.end) {
    warn(`união ${key}: status ${union.status} sem data de fim`);
  }

  const partners = Array.isArray(union.partners) ? union.partners : [];
  const children = Array.isArray(union.children) ? union.children : [];
  if (new Set(partners).size !== partners.length) err(`união ${key}: parceiro duplicado`);
  if (new Set(children).size !== children.length) err(`união ${key}: filho duplicado`);
  if (partners.length > 2) warn(`união ${key}: mais de dois parceiros`);

  for (const personId of partners) {
    if (!persons.has(personId)) err(`união ${key}: parceiro inexistente ${personId}`);
    else pushToMap(unionsOfPerson, personId, key);
  }
  for (const personId of children) {
    if (!persons.has(personId)) {
      err(`união ${key}: filho inexistente ${personId}`);
      continue;
    }
    if (partners.includes(personId)) err(`união ${key}: ${personId} é parceiro e filho`);
    if (parentUnionOf.has(personId)) {
      err(`pessoa ${personId}: filha de mais de uma união (${parentUnionOf.get(personId)}, ${key})`);
    } else {
      parentUnionOf.set(personId, key);
    }
    pushToMap(childrenOfUnion, key, personId);
  }
}

if (data.meta?.rootPersonId && !persons.has(data.meta.rootPersonId)) {
  err(`meta.rootPersonId inexistente: ${data.meta.rootPersonId}`);
}

// Ciclos de ancestralidade via parceiros da união parental.
const state = new Map();
const visit = (personId, stack) => {
  const status = state.get(personId) ?? 0;
  if (status === 1) {
    err(`ciclo de ancestralidade: ${[...stack, personId].join(' -> ')}`);
    return;
  }
  if (status === 2) return;
  state.set(personId, 1);
  const parentUnion = unions.get(parentUnionOf.get(personId));
  for (const parentId of parentUnion?.partners ?? []) {
    if (persons.has(parentId)) visit(parentId, [...stack, personId]);
  }
  state.set(personId, 2);
};
for (const personId of persons.keys()) visit(personId, []);

// Idade plausível entre cada genitor e filho.
for (const union of unions.values()) {
  for (const childId of union.children ?? []) {
    const child = persons.get(childId);
    if (!child?.birth?.year) continue;
    for (const parentId of union.partners ?? []) {
      const parent = persons.get(parentId);
      if (!parent?.birth?.year) continue;
      const age = child.birth.year - parent.birth.year;
      if (age < 12 || age > 70) {
        warn(`${childId}: idade do genitor ${parentId} no nascimento é ${age}`);
      }
    }
  }
}

const childrenCount = [...unions.values()].reduce(
  (total, union) => total + (union.children?.length ?? 0),
  0,
);
const carlosUnions = (unionsOfPerson.get('p-carlos') ?? [])
  .map((id) => unions.get(id))
  .filter(Boolean);
const carlosWithRenata = carlosUnions.find((union) => union.partners?.includes('p-renata'));
const carlosWithMarina = carlosUnions.find((union) => union.partners?.includes('p-marina'));
const beatrizUnion = unions.get('u-beatriz-roberto');
const childlessUnion = unions.get('u-gabriel-sofia');
const singleParentUnion = unions.get('u-dora-single');
const marinaParents = unions.get(parentUnionOf.get('p-marina'))?.partners ?? [];
const marinaSiblings = childrenOfUnion.get(parentUnionOf.get('p-marina')) ?? [];
const sharedParents = (unions.get(parentUnionOf.get('p-gabriel'))?.partners ?? [])
  .filter((id) => (unions.get(parentUnionOf.get('p-helena'))?.partners ?? []).includes(id));
const sameUnionSiblings = parentUnionOf.get('p-gabriel') === parentUnionOf.get('p-helena');

check(persons.size === 22, `esperadas 22 pessoas; encontradas ${persons.size}`, '22 pessoas');
check(unions.size === 8, `esperadas 8 uniões; encontradas ${unions.size}`, '8 uniões');
check(childrenCount === 14, `esperados 14 vínculos pai/filho; encontrados ${childrenCount}`, '14 vínculos');
check(data.meta?.rootPersonId === 'p-augusto', 'rootPersonId deveria ser p-augusto', 'raiz definida');
check(carlosUnions.length === 2, 'Carlos deveria ter 2 uniões', '2 uniões de Carlos');
check(carlosWithRenata?.status === 'divorced', 'união Carlos+Renata deveria estar divorciada', 'divórcio');
check(
  carlosWithRenata?.children?.includes('p-gabriel'),
  'Gabriel deveria ser filho de Carlos+Renata',
  'filho do 1º casamento',
);
check(carlosWithMarina?.status === 'married', 'união Carlos+Marina deveria estar ativa', '2º casamento ativo');
check(
  carlosWithMarina?.children?.length === 2 &&
    carlosWithMarina.children.includes('p-helena') &&
    carlosWithMarina.children.includes('p-igor'),
  'Helena e Igor deveriam ser filhos de Carlos+Marina',
  'filhos do 2º casamento',
);
check(beatrizUnion?.children?.length === 5, 'Beatriz+Roberto deveria ter 5 filhos', '5 filhos');
check(childlessUnion?.children?.length === 0, 'Gabriel+Sofia deveria ser sem filhos', 'união sem filhos');
check(singleParentUnion?.partners?.length === 1, 'Dora deveria ter união monoparental', 'união monoparental');
check(
  marinaParents.length === 2 && marinaParents.includes('p-joana') && marinaParents.includes('p-paulo'),
  'Marina deveria ser filha de Joana e Paulo',
  'pais do cônjuge',
);
check(marinaSiblings.includes('p-rafael'), 'Rafael deveria ser irmão de Marina', 'irmão do cônjuge');
check(
  sharedParents.length === 1 && sharedParents[0] === 'p-carlos' && !sameUnionSiblings,
  'Gabriel e Helena deveriam ser meios-irmãos por Carlos',
  'meios-irmãos',
);

const depth = (personId, seen = new Set()) => {
  if (seen.has(personId)) return 0;
  const union = unions.get(parentUnionOf.get(personId));
  if (!union) return 0;
  const nextSeen = new Set(seen).add(personId);
  return 1 + Math.max(0, ...(union.partners ?? []).map((parentId) => depth(parentId, nextSeen)));
};
const maxDepth = Math.max(...[...persons.keys()].map((id) => depth(id)));
check(maxDepth === 3, `esperadas 4 gerações; profundidade máxima ${maxDepth + 1}`, '4 gerações');

console.log(`Fixture: ${data.meta?.title ?? '(sem título)'}`);
console.log(`Pessoas: ${persons.size} | Uniões: ${unions.size} | Vínculos pai/filho: ${childrenCount}`);
console.log(`Profundidade máxima: ${maxDepth + 1} gerações`);
console.log(`Cenários verificados: ${scenarios.length}`);

if (warnings.length) {
  console.log(`\nAvisos (${warnings.length}):`);
  warnings.forEach((message) => console.log(`- ${message}`));
}

if (errors.length) {
  console.error(`\nErros (${errors.length}):`);
  errors.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log('\nOK: fixture válida.');
}
