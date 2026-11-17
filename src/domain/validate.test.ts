import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/family.fixture.json';
import { validateFamilyData } from './validate';

const cloneFixture = (): any => structuredClone(fixture);
const codes = (result: ReturnType<typeof validateFamilyData>): string[] =>
  result.errors.map((issue) => issue.code);

describe('validateFamilyData', () => {
  it('aceita a fixture sintética sem erros nem avisos', () => {
    const result = validateFamilyData(fixture);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('não muta a entrada', () => {
    const input = cloneFixture();
    const before = JSON.stringify(input);
    validateFamilyData(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejeita schemaVersion desconhecido', () => {
    const invalid = cloneFixture();
    invalid.schemaVersion = 2;
    expect(codes(validateFamilyData(invalid))).toContain('UNSUPPORTED_SCHEMA');
  });

  it('rejeita raiz ausente', () => {
    const invalid = cloneFixture();
    delete invalid.persons['p-augusto'];
    const result = validateFamilyData(invalid);
    expect(codes(result)).toContain('MISSING_ROOT');
    expect(codes(result)).toContain('MISSING_PARTNER');
  });

  it('rejeita id divergente da chave', () => {
    const invalid = cloneFixture();
    invalid.persons['p-augusto'].id = 'p-outro';
    expect(codes(validateFamilyData(invalid))).toContain('PERSON_ID_MISMATCH');
  });

  it('rejeita filho duplicado', () => {
    const invalid = cloneFixture();
    invalid.unions['u-beatriz-roberto'].children.push('p-ana');
    expect(codes(validateFamilyData(invalid))).toContain('DUPLICATE_CHILD');
  });

  it('rejeita referência inexistente', () => {
    const invalid = cloneFixture();
    invalid.unions['u-beatriz-roberto'].children.push('p-inexistente');
    expect(codes(validateFamilyData(invalid))).toContain('MISSING_CHILD');
  });

  it('rejeita pessoa filha de mais de uma união', () => {
    const invalid = cloneFixture();
    invalid.unions['u-beatriz-roberto'].children.push('p-gabriel');
    expect(codes(validateFamilyData(invalid))).toContain('MULTIPLE_PARENT_UNIONS');
  });

  it('rejeita ciclo de ancestralidade', () => {
    const invalid = cloneFixture();
    invalid.unions['u-ciclo'] = {
      id: 'u-ciclo',
      partners: ['p-beatriz'],
      children: ['p-augusto'],
    };
    expect(codes(validateFamilyData(invalid))).toContain('ANCESTRY_CYCLE');
  });

  it('rejeita fim anterior ao início', () => {
    const invalid = cloneFixture();
    invalid.unions['u-carlos-renata'].end = { year: 1980 };
    expect(codes(validateFamilyData(invalid))).toContain('END_BEFORE_START');
  });

  it('rejeita status desconhecido', () => {
    const invalid = cloneFixture();
    invalid.unions['u-carlos-renata'].status = 'qualquer';
    expect(codes(validateFamilyData(invalid))).toContain('INVALID_STATUS');
  });

  it('rejeita foto com javascript:', () => {
    const invalid = cloneFixture();
    invalid.persons['p-ana'].photo = 'javascript:alert(1)';
    expect(codes(validateFamilyData(invalid))).toContain('UNSAFE_PHOTO');
  });

  it('avisa sobre mais de dois parceiros', () => {
    const invalid = cloneFixture();
    invalid.unions['u-gabriel-sofia'].partners.push('p-ana');
    const result = validateFamilyData(invalid);
    expect(result.ok).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toContain('MANY_PARTNERS');
  });

  it('avisa sobre morte anterior ao nascimento', () => {
    const invalid = cloneFixture();
    invalid.persons['p-livia'].death = { year: 2020 };
    const result = validateFamilyData(invalid);
    expect(result.ok).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toContain('DEATH_BEFORE_BIRTH');
  });
});
