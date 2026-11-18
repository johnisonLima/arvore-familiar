# Schema da família — v1

## Escopo

Este documento define o formato normalizado que será usado pelo domínio, pela fixture e, futuramente, pelo banco de documentos. Ele não descreve a UI nem o layout.

A regra central: **pessoas e uniões são entidades próprias, referenciadas por id**. A relação pai/filho existe apenas em `union.children`; pai, mãe, irmãos, cônjuges e ancestrais são consultas derivadas.

## Forma do documento

```json
{
  "schemaVersion": 1,
  "meta": {
    "title": "Família Exemplo",
    "description": "Opcional",
    "rootPersonId": "p-exemplo",
    "locale": "pt-BR",
    "updatedAt": "2026-11-17T00:00:00.000Z"
  },
  "persons": {
    "p-exemplo": { "id": "p-exemplo", "name": "Pessoa Exemplo" }
  },
  "unions": {
    "u-exemplo": {
      "id": "u-exemplo",
      "partners": ["p-exemplo"],
      "children": []
    }
  }
}
```

### TypeScript

```ts
type PersonId = string;
type UnionId = string;

type Sex = 'M' | 'F' | 'X' | 'U';

interface PartialDate {
  year?: number;
  month?: number;   // 1..12
  day?: number;     // 1..31
  approx?: boolean;
  raw?: string;     // usado quando a data não pôde ser estruturada
}

interface Person {
  id: PersonId;
  name: string;
  sex?: Sex;
  birth?: PartialDate;
  death?: PartialDate;
  birthPlace?: string;
  bio?: string;
  photo?: string;
  aliases?: string[];
  private?: boolean;
}

type UnionStatus =
  | 'married'
  | 'partners'
  | 'divorced'
  | 'separated'
  | 'widowed'
  | 'unknown';

interface Union {
  id: UnionId;
  partners: PersonId[];
  children: PersonId[];
  status?: UnionStatus;
  start?: PartialDate;
  end?: PartialDate;
  place?: string;
  note?: string;
}

interface FamilyMeta {
  title: string;
  description?: string;
  rootPersonId: PersonId;
  locale?: string;
  updatedAt?: string;
}

interface FamilyData {
  schemaVersion: number;
  meta: FamilyMeta;
  persons: Record<PersonId, Person>;
  unions: Record<UnionId, Union>;
}
```

## Regras de campo

### Pessoa

- `id`: opaco, estável e não vazio. A chave em `persons` deve ser igual a este valor.
- `name`: nome de exibição, obrigatório. Não é chave e pode se repetir.
- `sex`: opcional; usado para rótulos como pai/mãe e para exportação futura. Não bloqueia o cadastro.
- `birth`/`death`: datas parciais. Use `raw` quando a precisão não permitir estruturação.
- `birthPlace`: string livre nesta versão; cidade/UF no formato “Cidade, UF”.
- `photo`: URL ou id de asset. Não usar base64 no JSON.
- `aliases`: nomes alternativos para busca (nome de casada, apelido).
- `private`: sinaliza dados que não devem sair em exportações compartilhadas.

### União

- `id`: opaco, estável e não vazio. A chave em `unions` deve ser igual a este valor.
- `partners`: 1..N pessoas. Normalmente 2; uma união monoparental tem 1. O array não define hierarquia entre os parceiros.
- `children`: filhos daquela união, na ordem de exibição (nascimento quando conhecida). É a única aresta pai/filho armazenada.
- `status`: estado da relação, não da pessoa. `married` e `partners` são uniões ativas; `divorced`, `separated` e `widowed` são encerradas; `unknown` é ausência de informação.
- `start`/`end`: início e fim da relação. `end` não deve ser preenchido sem status compatível.
- `note`: observação curta; não usar para dados estruturados.

### Meta

- `rootPersonId`: raiz padrão da visualização. Deve existir em `persons`.
- `updatedAt`: ISO 8601, informativo nesta fase. Controle de concorrência virá do adaptador de persistência.
- `locale`: padrão `pt-BR`.

## Invariantes

### Erros (rejeitar importação)

1. `schemaVersion` ausente ou não suportado.
2. `meta.rootPersonId` ausente ou inexistente.
3. `id` vazio, duplicado ou diferente da chave do mapa.
4. Referência em `partners` ou `children` para pessoa inexistente.
5. Id duplicado dentro de `partners` ou `children`.
6. Pessoa ao mesmo tempo parceira e filha da mesma união.
7. União sem nenhum parceiro.
8. Pessoa filha de mais de uma união (restrição da v1).
9. Ciclo de ancestralidade (A ancestral de B e B ancestral de A).
10. `end` anterior a `start` quando ambos têm ano.
11. Chave reservada (`__proto__`, `constructor`, `prototype`) em mapas do documento.
12. Tamanho ou quantidade acima dos limites defensivos da seção seguinte.

### Limites defensivos (Fase 5)

Definidos em `FAMILY_LIMITS` (`src/domain/validate.ts`) e aplicados tanto na importação quanto nas mutações do editor:

| Limite | Valor | Código de erro |
| --- | --- | --- |
| Pessoas por documento | 2.000 | `TOO_MANY_PEOPLE` |
| Uniões por documento | 2.000 | `TOO_MANY_UNIONS` |
| Filhos por união | 500 | `TOO_MANY_CHILDREN` |
| Nome, título, id | 160 caracteres | `NAME_TOO_LONG`, `TITLE_TOO_LONG`, `*_ID_TOO_LONG` |
| Textos (bio, local, observação, descrição) | 4.000 caracteres | `BIO_TOO_LONG`, `*_PLACE_TOO_LONG`, `*_NOTE_TOO_LONG`, `DESCRIPTION_TOO_LONG` |
| Apelidos | 12 por pessoa, 120 caracteres cada | `TOO_MANY_ALIASES`, `ALIAS_TOO_LONG` |

O limite de arquivo importado continua em **5 MB**, verificado antes do parse. Os limites existem para manter a árvore responsiva e não fazem parte da semântica genealógica: documentos maiores exigiriam paginação ou um adaptador de banco.

### Avisos (aceitar, mas sinalizar)

1. União com mais de dois parceiros.
2. Morte anterior ao nascimento.
3. Diferença de idade entre genitor e filho menor que 12 ou maior que 70 anos.
4. Pessoa sem nome de exibição utilizável.
5. União com status `divorced`/`separated` sem `end`.
6. `photo` com esquema não permitido (`javascript:`).

## Índices derivados

Construir ao carregar, nunca gravar no JSON:

```ts
personsById: Map<PersonId, Person>
unionsById: Map<UnionId, Union>
unionsOfPerson: Map<PersonId, UnionId[]>   // uniões em que a pessoa é parceira
parentUnionsOf: Map<PersonId, UnionId[]>   // uniões em que a pessoa é filha
childrenOfUnion: Map<UnionId, PersonId[]>
```

Consultas esperadas:

- `parentsOf(personId)` → parceiros da(s) união(ões) parental(is).
- `childrenOf(personId)` → filhos de todas as uniões em que é parceira.
- `spousesOf(personId)` → parceiros das uniões, excluindo a própria pessoa.
- `siblingsOf(personId)` → filhos de qualquer união dos genitores, excluindo a própria pessoa; classificar `full`/`half` pela interseção de pais. Isso inclui meios-irmãos de outra união do mesmo genitor.
- `descendantsOf(personId)` / `ancestorsOf(personId)` → travessia BFS com `visited` e profundidade mínima.
- `findRelationshipPath(a, b)` → BFS nas adjacências derivadas (`spouse`, `parent`, `child`, `sibling`), com o `unionId` de cada passo; o caminho é uma sequência de pessoas.

## Ciclo de vida e versionamento

- A versão atual é `1`.
- Toda importação passa por `validate` e, se necessário, `migrate`.
- Migrações são funções puras `old → new`; nunca alteram o objeto de entrada.
- A exportação sempre grava a versão atual.
- Campos novos devem ser opcionais ou acompanhados de migração e bump de versão.
- Campos derivados, de UI ou de banco (`_rev`, `_id` externo, cor, geração, idade) ficam fora do domínio.

## Persistência local (Fase 3)

O documento salvo no navegador não é gravado diretamente: ele vai dentro de um envelope de armazenamento próprio, para que a camada local possa evoluir sem alterar o schema da família.

```json
{
  "format": "arvore-familiar/document",
  "formatVersion": 1,
  "savedAt": "2026-11-17T18:00:00.000Z",
  "data": {
    "schemaVersion": 1,
    "meta": { "...": "..." },
    "persons": { "...": "..." },
    "unions": { "...": "..." }
  }
}
```

- Chave do documento: `arvore-familiar:document`.
- Chave das preferências de visualização: `arvore-familiar:view`, com `rootId`, `generations` (`2`–`5` ou `"all"`) e `savedAt`. Não faz parte do domínio e pode ser descartada.
- A importação aceita o documento puro (formato exportado) ou o envelope interno.
- A exportação grava o documento puro, com chaves ordenadas e indentação de 2 espaços.
- O limite de importação é 5 MB por arquivo.
- Pessoas com `private: true` podem ser exportadas com `id`, `name`, `sex` e a própria flag, sem datas, local, biografia, foto ou apelidos.
- Se o `localStorage` estiver indisponível, um adaptador em memória mantém a sessão; nada sobrevive ao recarregamento.

## Escrita e edição (Fase 4)

O editor não altera o documento atual: cada operação é uma função pura que devolve um novo `FamilyData`.

| Operação | Função | Regras estruturais |
| --- | --- | --- |
| Criar pessoa | `createPerson` | nome obrigatório; id `p-<slug>` com sufixo em colisão |
| Atualizar pessoa | `updatePerson` | campos vazios removem a propriedade; ano deve ser inteiro positivo |
| Excluir pessoa | `deletePerson` | remove a pessoa de parceiros e filhos; apaga uniões sem parceiros; troca `meta.rootPersonId` se necessário |
| Criar união | `createUnion` | ao menos um parceiro; sem repetição; filho não pode ser parceiro nem filho de outra união |
| Atualizar união | `updateUnion` | status, datas, local e observação; datas inválidas são rejeitadas |
| Excluir união | `deleteUnion` | mantém pessoas e filhos no documento |
| Adicionar/remover parceiro | `addPartner` / `removePartner` | a união nunca fica sem parceiros |
| Adicionar/remover filho | `addChild` / `removeChild` | filho pertence a no máximo uma união |
| Criar filho na união | `createChildInUnion` | cria a pessoa e o vínculo na mesma operação |

Fluxo de gravação:

1. A mutação pura produz o próximo documento.
2. `validateFamilyData` roda sobre o resultado.
3. A árvore em memória é reconstruída e a câmera é preservada.
4. `meta.updatedAt` recebe o instante da gravação.
5. O documento validado é salvo no envelope da Fase 3.

O editor não grava campos de UI no documento: seleção, formulários e confirmações vivem apenas no `editor-panel`. Em `?familia=fixture`, as mutações atualizam só a sessão e não chamam o store.

## Estado da implementação (Fases 1–5)

| Módulo | Arquivo | Cobertura |
| --- | --- | --- |
| Tipos | `src/domain/types.ts` | Schema v1 |
| Validação | `src/domain/validate.ts` | Referências, IDs, ciclos, união parental única, datas, avisos e limites |
| Grafo | `src/domain/graph.ts` | Índices, pais, filhos, cônjuges, irmãos full/half, descendentes, ancestrais |
| Relacionamento | `src/domain/relationship.ts` | BFS, passos e rótulos comuns + fallback |
| Migração | `src/data/migrate-v0.ts` | Seed legado → 25 pessoas, 8 uniões, 16 vínculos |
| Dados gerados | `src/data/family.json` | Documento v1 versionado |
| Layout | `src/layout/tree.ts` | Layout plano, uniões empilhadas, limites e arestas |
| View | `src/view/tree-view.ts` | Câmera, LOD, cards, barras, HUD, re-root, foco e culling |
| Culling | `src/view/culling.ts` | Viewport do mundo e interseções de nós/arestas |
| Navegação | `src/view/navigation.ts` | Navegação espacial entre cartões |
| Editor | `src/editor/` + `src/view/editor-panel.ts` | IDs, mutações puras, formulários e confirmações |
| Persistência | `src/storage/` | Documento, preferências, importação, exportação e privacidade |
| Segurança | `index.html` + `public/_headers` | CSP, referrer, frame, nosniff e permissions |
| Testes | `src/**/*.test.ts` + `e2e/` | 174 unitários e 17 E2E (Playwright + axe-core) |

## Migração do seed original (v0 → v1)

O protótipo legado contém 17 cards e 8 cônjuges como texto. A migração produz:

| Item | Quantidade |
| --- | --- |
| Pessoas | 25 |
| Uniões | 8 |
| Vínculos pai/filho | 16 |
| Gerações a partir de Antônio | 4 |

Mapeamento:

1. Cada objeto `P(...)` vira uma pessoa; guardar um `Map` de nó para id.
2. Cada `sp` vira pessoa. Se o nome normalizado coincidir com exatamente um card, reutilizar esse card; se não houver card ou houver ambiguidade, criar uma pessoa separada. Homônimos que não são cards não são fundidos automaticamente.
3. Para cada card com `k` ou `sp`, criar uma união com `[pessoa, cônjuge?]` e os filhos do card.
4. Fernanda + Tiago geram uma união sem filhos.
5. `y` vira `birth`/`death` quando o padrão for reconhecível (`1928 – 2009`, `n. 1953`); caso contrário, `raw`.
6. `pl` vira `birthPlace`; `b` vira `bio`.
7. `h` (matiz) não entra no domínio; a cor será derivada pela UI.
8. `meta.rootPersonId` aponta para Antônio; `meta.title` para “Família Albuquerque”.

Critérios de teste da migração:

- `childrenOf(antônio)` = Beatriz, Carlos, Dora.
- `parentsOf(pedro)` = Júlia, Daniel.
- `descendantsOf(antônio)` tem 16 pessoas.
- `unionsOfPerson(carlos)` tem 1 união no seed.
- A união de Fernanda + Tiago existe e tem zero filhos.

O resultado está em `src/data/family.json` e é reproduzível com:

```bash
npm run generate:data
```

## Fixture sintética

`fixtures/family.fixture.json` é fictícia e cobre:

- Carlos com dois casamentos: Renata (divorciado, filho Gabriel) e Marina (casada, filhos Helena e Igor).
- Meios-irmãos Gabriel × Helena/Igor.
- Beatriz + Roberto com cinco filhos.
- Gabriel + Sofia sem filhos.
- Dora em união monoparental com Otávio.
- Joana + Paulo como pais de Marina e Rafael, para testar re-root e ancestrais do cônjuge.
- Quatro gerações.

Contagens: 22 pessoas, 8 uniões, 14 vínculos pai/filho.

## Banco de documentos

Para o protótipo, a família inteira pode ser um documento:

```json
{
  "_id": "family-albuquerque",
  "_rev": "opaco-do-banco",
  "schemaVersion": 1,
  "meta": { "...": "..." },
  "persons": { "...": "..." },
  "unions": { "...": "..." }
}
```

Na Fase 3, o adaptador local já implementa esse documento único no `localStorage`, com envelope e validação. `_id`/`_rev` e controle de concorrência ficam para o adaptador de banco.

Se o documento crescer ou a edição for multiusuário:

- Separar em coleções `persons` e `unions`, mantendo as referências por id.
- Manter `union.children` como fonte da relação pai/filho; não criar um array `parents` na pessoa.
- Usar revisão/versão do banco para concorrência otimista.
- Aplicar mudanças por comando (`addChild`, `addUnion`, etc.) em vez de regravar o documento inteiro.

## Fora do escopo da v1

- Adoção, guarda compartilhada e padrasto como tipos de vínculo.
- Eventos genealógicos completos (batismo, casamento religioso, emigração).
- Fontes, citações e grau de confiança.
- Importação/exportação GEDCOM.
- Privacidade avançada para pessoas vivas.
- Fusão de pessoas duplicadas.
