import { describe, expect, it } from 'vitest';
import { childCountLabel, firstName, initials, lifespan, unionMeta, unionYears } from './format';

describe('initials', () => {
  it.each([
    ['Antônio Albuquerque', 'AA'],
    ['Maria Mendes', 'MM'],
    ['Ana Beatriz', 'AB'],
    ['Dora', 'DO'],
    ['Ana de Albuquerque', 'AA'],
    ['  ', '?'],
  ])('gera iniciais de %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('firstName', () => {
  it('usa o primeiro nome', () => {
    expect(firstName('Antônio Albuquerque')).toBe('Antônio');
    expect(firstName('Dora')).toBe('Dora');
  });
});

describe('lifespan', () => {
  it('formata intervalo de vida', () => {
    expect(lifespan({ id: 'a', name: 'A', birth: { year: 1928 }, death: { year: 2009 } })).toBe(
      '1928 – 2009',
    );
  });

  it('formata apenas nascimento', () => {
    expect(lifespan({ id: 'a', name: 'A', birth: { year: 1953 } })).toBe('n. 1953');
  });

  it('formata apenas morte', () => {
    expect(lifespan({ id: 'a', name: 'A', death: { year: 2009 } })).toBe('† 2009');
  });

  it('retorna vazio sem datas', () => {
    expect(lifespan({ id: 'a', name: 'A' })).toBe('');
  });
});

describe('uniões', () => {
  it('formata status e anos', () => {
    expect(
      unionMeta({
        id: 'u',
        partners: ['a', 'b'],
        children: [],
        status: 'divorced',
        start: { year: 1978 },
        end: { year: 1995 },
      }),
    ).toBe('divorciados · 1978 – 1995');
  });

  it('omite partes ausentes', () => {
    expect(unionYears({ id: 'u', partners: ['a'], children: [] })).toBe('');
    expect(unionMeta({ id: 'u', partners: ['a'], children: [], status: 'married' })).toBe(
      'casados',
    );
  });

  it('flexiona a contagem de filhos', () => {
    expect(childCountLabel(0)).toBe('sem filhos');
    expect(childCountLabel(1)).toBe('1 filho');
    expect(childCountLabel(3)).toBe('3 filhos');
  });
});
