import { describe, expect, it } from 'vitest';
import familyJson from '../data/family.json';
import type { FamilyData } from '../domain/types';
import { validateFamilyData } from '../domain/validate';
import {
  EditorMutationError,
  addChild,
  addPartner,
  createChildInUnion,
  createPerson,
  createUnion,
  deletePerson,
  deleteUnion,
  removeChild,
  removePartner,
  setRootPerson,
  updatePerson,
  updateUnion,
} from './mutations';

const seed = JSON.parse(JSON.stringify(familyJson)) as FamilyData;

const cloneSeed = (): FamilyData => JSON.parse(JSON.stringify(seed)) as FamilyData;

const expectMutationError = (callback: () => unknown, fragment?: string): void => {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(EditorMutationError);
    if (fragment) expect((error as Error).message).toContain(fragment);
    return;
  }
  throw new Error('esperava EditorMutationError');
};

const tinyFamily = (): FamilyData => ({
  schemaVersion: 1,
  meta: { title: 'Família mínima', rootPersonId: 'p-a' },
  persons: {
    'p-a': { id: 'p-a', name: 'Pessoa A' },
    'p-b': { id: 'p-b', name: 'Pessoa B' },
  },
  unions: {
    'u-a': { id: 'u-a', partners: ['p-a'], children: ['p-b'] },
  },
});

describe('createPerson', () => {
  it('normaliza apelidos e foto ao criar e atualizar pessoa', () => {
    const created = createPerson(seed, {
      name: 'Pessoa com nomes',
      aliases: ['  Nena ', '', 'Nena', 'Mariazinha'],
      photo: 'data:image/png;base64,AA==',
    });
    expect(created.person.aliases).toEqual(['Nena', 'Mariazinha']);
    expect(created.person.photo).toBe('data:image/png;base64,AA==');
    const updated = updatePerson(created.data, created.person.id, { aliases: [], photo: null });
    expect(updated.persons[created.person.id].aliases).toBeUndefined();
    expect(updated.persons[created.person.id].photo).toBeUndefined();
  });
  it('cria pessoa com id derivado e campos normalizados', () => {
    const result = createPerson(seed, {
      name: '  Nova Pessoa ',
      sex: 'F',
      birthYear: 1990,
      deathYear: 2050,
      birthPlace: ' Rio de Janeiro, RJ ',
      bio: '  Biografia curta. ',
      private: true,
    });

    expect(result.person).toEqual({
      id: 'p-nova-pessoa',
      name: 'Nova Pessoa',
      sex: 'F',
      birth: { year: 1990 },
      death: { year: 2050 },
      birthPlace: 'Rio de Janeiro, RJ',
      bio: 'Biografia curta.',
      private: true,
    });
    expect(result.data.persons['p-nova-pessoa']).toEqual(result.person);
    expect(seed.persons['p-nova-pessoa']).toBeUndefined();
  });

  it('evita ids duplicados', () => {
    const data = cloneSeed();
    data.persons['p-nova-pessoa'] = { id: 'p-nova-pessoa', name: 'Existente' };

    expect(createPerson(data, { name: 'Nova Pessoa' }).person.id).toBe('p-nova-pessoa-2');
  });

  it('exige nome utilizável', () => {
    expectMutationError(() => createPerson(seed, { name: '   ' }), 'nome');
  });

  it('rejeita ano inválido', () => {
    expectMutationError(() => createPerson(seed, { name: 'X', birthYear: 0 }), 'ano');
    expectMutationError(() => createPerson(seed, { name: 'X', deathYear: 1.5 }), 'ano');
  });
});

describe('updatePerson', () => {
  it('altera dados preservando mês e dia existentes', () => {
    const data = cloneSeed();
    const person = data.persons['p-antonio-albuquerque'];
    if (!person) throw new Error('pessoa do seed não encontrada');
    person.birth = { year: 1928, month: 3, day: 4 };

    const next = updatePerson(data, person.id, {
      name: 'Antônio Albuquerque Filho',
      sex: 'M',
      birthYear: 1930,
      deathYear: null,
      birthPlace: '',
      bio: 'Nova biografia',
      private: true,
    });

    expect(next.persons[person.id]).toEqual({
      id: person.id,
      name: 'Antônio Albuquerque Filho',
      sex: 'M',
      birth: { year: 1930, month: 3, day: 4 },
      bio: 'Nova biografia',
      private: true,
    });
    expect(data.persons[person.id]?.birth?.year).toBe(1928);
    expect(data.persons[person.id]?.sex).toBeUndefined();
  });

  it('remove detalhes opcionais', () => {
    const next = updatePerson(seed, 'p-antonio-albuquerque', {
      sex: null,
      birthPlace: '',
      bio: '',
      private: false,
    });

    const person = next.persons['p-antonio-albuquerque'];
    expect(person?.sex).toBeUndefined();
    expect(person?.birthPlace).toBeUndefined();
    expect(person?.bio).toBeUndefined();
    expect(person?.private).toBeUndefined();
  });

  it('rejeita nome vazio e pessoa inexistente', () => {
    expectMutationError(
      () => updatePerson(seed, 'p-antonio-albuquerque', { name: ' ' }),
      'nome',
    );
    expectMutationError(
      () => updatePerson(seed, 'p-inexistente', { name: 'X' }),
      'não encontrada',
    );
  });
});

describe('deletePerson', () => {
  it('remove a pessoa de uniões e preserva o restante', () => {
    const next = deletePerson(seed, 'p-beatriz-albuquerque');

    expect(next.persons['p-beatriz-albuquerque']).toBeUndefined();
    expect(next.unions['u-antonio-albuquerque-helena-lima']?.children).not.toContain(
      'p-beatriz-albuquerque',
    );
    expect(next.unions['u-beatriz-albuquerque-roberto-mendes']?.partners).toEqual([
      'p-roberto-mendes',
    ]);
    for (const union of Object.values(next.unions)) {
      expect(union.partners).not.toContain('p-beatriz-albuquerque');
      expect(union.children).not.toContain('p-beatriz-albuquerque');
    }
    expect(validateFamilyData(next).ok).toBe(true);
  });

  it('troca a raiz do documento quando a raiz é excluída', () => {
    const next = deletePerson(seed, 'p-antonio-albuquerque');

    expect(next.persons['p-antonio-albuquerque']).toBeUndefined();
    expect(next.meta.rootPersonId).not.toBe('p-antonio-albuquerque');
    expect(next.persons[next.meta.rootPersonId]).toBeDefined();
  });

  it('remove união sem parceiros e mantém os filhos', () => {
    const next = deletePerson(tinyFamily(), 'p-a');

    expect(next.unions['u-a']).toBeUndefined();
    expect(next.persons['p-b']).toBeDefined();
    expect(next.meta.rootPersonId).toBe('p-b');
  });

  it('não permite excluir a última pessoa', () => {
    const data: FamilyData = {
      schemaVersion: 1,
      meta: { title: 'Uma pessoa', rootPersonId: 'p-a' },
      persons: { 'p-a': { id: 'p-a', name: 'A' } },
      unions: {},
    };

    expectMutationError(() => deletePerson(data, 'p-a'), 'pelo menos uma pessoa');
  });
});

describe('setRootPerson', () => {
  it('atualiza a raiz do documento', () => {
    const next = setRootPerson(seed, 'p-carlos-albuquerque');
    expect(next.meta.rootPersonId).toBe('p-carlos-albuquerque');
    expect(seed.meta.rootPersonId).toBe('p-antonio-albuquerque');
  });

  it('rejeita pessoa inexistente', () => {
    expectMutationError(() => setRootPerson(seed, 'p-nada'), 'não encontrada');
  });
});

describe('createUnion', () => {
  it('cria união com detalhes e filhos existentes', () => {
    const created = createPerson(seed, { name: 'Filho Novo' });
    const result = createUnion(created.data, {
      partners: ['p-fernanda-mendes', 'p-pedro-costa'],
      children: [created.person.id],
      status: 'married',
      startYear: 2020,
      endYear: 2021,
      place: 'Recife, PE',
      note: 'União de teste',
    });

    expect(result.union).toMatchObject({
      id: 'u-fernanda-mendes-pedro-costa',
      partners: ['p-fernanda-mendes', 'p-pedro-costa'],
      children: [created.person.id],
      status: 'married',
      start: { year: 2020 },
      end: { year: 2021 },
      place: 'Recife, PE',
      note: 'União de teste',
    });
    expect(result.data.unions[result.union.id]).toEqual(result.union);
    expect(seed.unions[result.union.id]).toBeUndefined();
  });

  it('aceita união com um parceiro e sem filhos', () => {
    const result = createUnion(seed, { partners: ['p-fernanda-mendes'] });
    expect(result.union.partners).toEqual(['p-fernanda-mendes']);
    expect(result.union.children).toEqual([]);
    expect(validateFamilyData(result.data).ok).toBe(true);
  });

  it('rejeita união sem parceiros, parceiros repetidos e filho repetido', () => {
    expectMutationError(() => createUnion(seed, { partners: [] }), 'pelo menos um parceiro');
    expectMutationError(
      () => createUnion(seed, { partners: ['p-fernanda-mendes', 'p-fernanda-mendes'] }),
      'repetidos',
    );

    const created = createPerson(seed, { name: 'Filho Repetido' });
    expectMutationError(
      () =>
        createUnion(created.data, {
          partners: ['p-fernanda-mendes'],
          children: [created.person.id, created.person.id],
        }),
      'repetidos',
    );
  });

  it('rejeita parceiro inexistente, parceiro que também é filho e filho de outra união', () => {
    expectMutationError(
      () => createUnion(seed, { partners: ['p-inexistente'] }),
      'não encontrada',
    );
    expectMutationError(
      () =>
        createUnion(seed, {
          partners: ['p-fernanda-mendes'],
          children: ['p-fernanda-mendes'],
        }),
      'parceira e filha',
    );
    expectMutationError(
      () =>
        createUnion(seed, {
          partners: ['p-fernanda-mendes'],
          children: ['p-beatriz-albuquerque'],
        }),
      'já é filha de outra união',
    );
  });
});

describe('updateUnion', () => {
  it('altera e limpa detalhes da união', () => {
    const id = 'u-fernanda-mendes-tiago-prado';
    const changed = updateUnion(seed, id, {
      status: 'divorced',
      startYear: 2000,
      endYear: 2010,
      place: 'Salvador, BA',
      note: 'Separados',
    });

    expect(changed.unions[id]).toMatchObject({
      status: 'divorced',
      start: { year: 2000 },
      end: { year: 2010 },
      place: 'Salvador, BA',
      note: 'Separados',
    });

    const cleared = updateUnion(changed, id, {
      status: null,
      startYear: null,
      endYear: null,
      place: '',
      note: '',
    });

    expect(cleared.unions[id]?.status).toBeUndefined();
    expect(cleared.unions[id]?.start).toBeUndefined();
    expect(cleared.unions[id]?.end).toBeUndefined();
    expect(cleared.unions[id]?.place).toBeUndefined();
    expect(cleared.unions[id]?.note).toBeUndefined();
  });

  it('rejeita união inexistente', () => {
    expectMutationError(() => updateUnion(seed, 'u-nada', {}), 'não encontrada');
  });
});

describe('deleteUnion', () => {
  it('remove a união sem excluir pessoas nem filhos', () => {
    const next = deleteUnion(seed, 'u-fernanda-mendes-tiago-prado');
    expect(next.unions['u-fernanda-mendes-tiago-prado']).toBeUndefined();
    expect(next.persons['p-fernanda-mendes']).toBeDefined();
    expect(next.persons['p-tiago-prado']).toBeDefined();
    expect(validateFamilyData(next).ok).toBe(true);
  });

  it('rejeita união inexistente', () => {
    expectMutationError(() => deleteUnion(seed, 'u-nada'), 'não encontrada');
  });
});

describe('addPartner e removePartner', () => {
  it('adiciona e remove parceiro', () => {
    const id = 'u-fernanda-mendes-tiago-prado';
    const added = addPartner(seed, id, 'p-pedro-costa');
    expect(added.unions[id]?.partners).toEqual([
      'p-fernanda-mendes',
      'p-tiago-prado',
      'p-pedro-costa',
    ]);

    const removed = removePartner(added, id, 'p-tiago-prado');
    expect(removed.unions[id]?.partners).toEqual(['p-fernanda-mendes', 'p-pedro-costa']);
  });

  it('rejeita parceiro repetido, filho da própria união e último parceiro', () => {
    const id = 'u-antonio-albuquerque-helena-lima';
    expectMutationError(() => addPartner(seed, id, 'p-antonio-albuquerque'), 'já é parceira');
    expectMutationError(() => addPartner(seed, id, 'p-beatriz-albuquerque'), 'parceira e filha');

    const removedOnce = removePartner(seed, 'u-fernanda-mendes-tiago-prado', 'p-fernanda-mendes');
    expect(removedOnce.unions['u-fernanda-mendes-tiago-prado']?.partners).toEqual([
      'p-tiago-prado',
    ]);
    expectMutationError(
      () => removePartner(removedOnce, 'u-fernanda-mendes-tiago-prado', 'p-tiago-prado'),
      'pelo menos um parceiro',
    );

    const solo = createUnion(seed, { partners: ['p-fernanda-mendes'] }).data;
    const soloId = Object.keys(solo.unions).find(
      (unionId) => solo.unions[unionId]?.partners[0] === 'p-fernanda-mendes' && solo.unions[unionId]?.partners.length === 1,
    );
    if (!soloId) throw new Error('união solo não encontrada');
    expectMutationError(() => removePartner(solo, soloId, 'p-fernanda-mendes'), 'pelo menos um parceiro');
  });
});

describe('addChild e removeChild', () => {
  it('adiciona filho existente e remove', () => {
    const id = 'u-fernanda-mendes-tiago-prado';
    const child = createPerson(seed, { name: 'Filho de Teste' });
    const added = addChild(child.data, id, child.person.id);
    expect(added.unions[id]?.children).toContain(child.person.id);

    const removed = removeChild(added, id, child.person.id);
    expect(removed.unions[id]?.children).not.toContain(child.person.id);
  });

  it('rejeita filho repetido, parceiro e filho de outra união', () => {
    const id = 'u-antonio-albuquerque-helena-lima';
    expectMutationError(() => addChild(seed, id, 'p-beatriz-albuquerque'), 'já é filha');
    expectMutationError(() => addChild(seed, id, 'p-antonio-albuquerque'), 'parceira e filha');
    expectMutationError(
      () => addChild(seed, 'u-fernanda-mendes-tiago-prado', 'p-beatriz-albuquerque'),
      'já é filha de outra união',
    );
  });

  it('rejeita remover quem não é filho', () => {
    expectMutationError(
      () => removeChild(seed, 'u-fernanda-mendes-tiago-prado', 'p-beatriz-albuquerque'),
      'não é filha',
    );
  });
});

describe('createChildInUnion', () => {
  it('cria pessoa, adiciona como filho e passa na validação', () => {
    const id = 'u-fernanda-mendes-tiago-prado';
    const result = createChildInUnion(seed, id, {
      name: '  Caio Mendes ',
      birthYear: 2024,
    });

    expect(result.person).toMatchObject({
      id: 'p-caio-mendes',
      name: 'Caio Mendes',
      birth: { year: 2024 },
    });
    expect(result.data.unions[id]?.children).toContain('p-caio-mendes');
    expect(validateFamilyData(result.data).ok).toBe(true);
    expect(seed.unions[id]?.children).not.toContain('p-caio-mendes');
  });

  it('não altera a união quando a pessoa é inválida', () => {
    expectMutationError(
      () => createChildInUnion(seed, 'u-fernanda-mendes-tiago-prado', { name: '' }),
      'nome',
    );
    expectMutationError(
      () => createChildInUnion(seed, 'u-nada', { name: 'X' }),
      'não encontrada',
    );
  });
});
