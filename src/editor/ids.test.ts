import { describe, expect, it } from 'vitest';
import { createPersonId, createUnionId, slugifyId } from './ids';

describe('slugifyId', () => {
  it('remove acentos e normaliza separadores', () => {
    expect(slugifyId('José  da   Silva')).toBe('jose-da-silva');
    expect(slugifyId('  Árvore Familiar! ')).toBe('arvore-familiar');
  });

  it('devolve string vazia sem caracteres aproveitáveis', () => {
    expect(slugifyId('!!!')).toBe('');
  });

  it('limita o tamanho do slug', () => {
    expect(slugifyId('a'.repeat(120))).toHaveLength(48);
  });
});

describe('createPersonId', () => {
  it('usa o nome como base', () => {
    expect(createPersonId('Maria Bonita', new Set())).toBe('p-maria-bonita');
  });

  it('acrescenta sufixo numérico quando o id existe', () => {
    const taken = new Set(['p-maria-bonita', 'p-maria-bonita-2']);
    expect(createPersonId('Maria Bonita', taken)).toBe('p-maria-bonita-3');
  });

  it('tem fallback para nomes sem letras', () => {
    expect(createPersonId('!!!', new Set())).toBe('p-pessoa');
  });
});

describe('createUnionId', () => {
  it('combina os nomes dos parceiros', () => {
    expect(createUnionId(['Ana Lima', 'Beto Reis'], new Set())).toBe('u-ana-lima-beto-reis');
  });

  it('evita colisão', () => {
    expect(createUnionId(['Ana Lima'], new Set(['u-ana-lima']))).toBe('u-ana-lima-2');
  });
});
