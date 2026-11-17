export interface LegacyPerson {
  name: string;
  years: string;
  bio: string;
  spouse: string;
  place: string;
  children: LegacyPerson[];
  hue?: number;
}

const P = (
  name: string,
  years: string,
  bio: string,
  spouse: string,
  place: string,
  children: LegacyPerson[] = [],
  hue?: number,
): LegacyPerson => ({ name, years, bio, spouse, place, children, hue });

/**
 * Cópia fiel do seed embutido no protótipo original.
 * O HTML legado não é lido em runtime; esta é a entrada da migração v0 → v1.
 */
export const LEGACY_ROOT: LegacyPerson = P(
  'Antônio Albuquerque',
  '1928 – 2009',
  'Mestre de obras e contador de histórias. Fundou a mercearia que sustentou três gerações.',
  'Helena Lima',
  'Ilhéus, BA',
  [
    P(
      'Beatriz Albuquerque',
      'n. 1953',
      'Professora de geografia; transformou a casa de praia no ponto de encontro dos primos.',
      'Roberto Mendes',
      'Salvador, BA',
      [
        P(
          'Eduardo Mendes',
          'n. 1980',
          'Engenheiro agrônomo apaixonado por café de altitude.',
          'Camila Reis',
          'Barreiras, BA',
          [
            P(
              'Maria Mendes',
              'n. 2009',
              'Aprendiz de violão e colecionadora de discos antigos.',
              '',
              'Barreiras, BA',
            ),
            P(
              'Nina Mendes',
              'n. 2013',
              'Campeã de xadrez da escola e futura astronauta, segundo ela.',
              '',
              'Barreiras, BA',
            ),
          ],
        ),
        P(
          'Fernanda Mendes',
          'n. 1984',
          'Arquiteta que restaura casarões históricos.',
          'Tiago Prado',
          'Salvador, BA',
        ),
      ],
      335,
    ),
    P(
      'Carlos Albuquerque',
      'n. 1956',
      'Médico de família; atende na cidade há mais de trinta anos.',
      'Lúcia Fontes',
      'Vitória da Conquista, BA',
      [
        P(
          'Gabriel Albuquerque',
          'n. 1983',
          'Desenvolvedor de software e cozinheiro de domingo.',
          'Ana Beatriz',
          'Campinas, SP',
          [
            P(
              'Otávio Albuquerque',
              'n. 2015',
              'Descobriu os dinossauros aos três anos e nunca mais parou.',
              '',
              'Campinas, SP',
            ),
          ],
        ),
        P(
          'Helena Fontes',
          'n. 1986',
          'Chef de cozinha; guarda as receitas da bisavó.',
          '',
          'Rio de Janeiro, RJ',
        ),
        P(
          'Igor Albuquerque',
          'n. 1990',
          'Músico e produtor, toca em três bandas.',
          '',
          'Belo Horizonte, MG',
        ),
      ],
      205,
    ),
    P(
      'Dora Albuquerque',
      'n. 1960',
      'Advogada e primeira da família a se formar na universidade.',
      'Márcio Teixeira',
      'Recife, PE',
      [
        P(
          'Júlia Teixeira',
          'n. 1988',
          'Bióloga marinha que estuda recifes de coral.',
          'Daniel Costa',
          'Fernando de Noronha, PE',
          [
            P(
              'Pedro Costa',
              'n. 2016',
              'Goleiro do time da escola.',
              '',
              'Fernando de Noronha, PE',
            ),
            P(
              'Rafael Costa',
              'n. 2018',
              'Desenha mapas de ilhas imaginárias.',
              '',
              'Fernando de Noronha, PE',
            ),
            P(
              'Sofia Costa',
              'n. 2021',
              'A caçula, já nada melhor que todos.',
              '',
              'Fernando de Noronha, PE',
            ),
          ],
        ),
        P(
          'Lucas Teixeira',
          'n. 1993',
          'Fotógrafo de viagens; nunca está em casa.',
          '',
          'Lisboa, Portugal',
        ),
      ],
      150,
    ),
  ],
  35,
);
