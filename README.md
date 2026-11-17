# Árvore Familiar

Protótipo de árvore genealógica com zoom fractal, agora com domínio normalizado de pessoas e uniões.

## Status

**Fase 1 concluída.** O seed legado foi migrado para `src/data/family.json`, o grafo é construído em memória, as consultas de parentesco e o BFS de relacionamento estão implementados e cobertos por testes. A visualização fractal entra na Fase 2.

## Como rodar

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev        # servidor Vite
npm test           # testes de domínio, migração e relacionamento
npm run build      # typecheck + build estático
npm run generate:data  # regenera src/data/family.json a partir do seed legado
```

A página atual (`index.html`) é apenas um painel de verificação da Fase 1: mostra contagens do grafo e se os dados carregaram. O protótipo visual antigo continua em `Árvore Familiar — Zoom Infinito.html`.

## Decisões aprovadas

| Tema | Decisão |
| --- | --- |
| Stack | Vite + TypeScript vanilla, sem framework de UI |
| Visual | Card por pessoa, com filhos agrupados por união |
| Ordem de entrega | Modelo + layout + persistência primeiro; editor depois |
| Navegação | Re-root e modo egocêntrico agora; grafo completo depois |
| Dados de teste | Fixture sintética para segundo casamento; seed real intocado |
| Banco futuro | Banco de documentos |

Detalhes em [`docs/decisions.md`](docs/decisions.md).

## Estrutura

```text
.
├── index.html                             # entrada Vite (painel da Fase 1)
├── src/
│   ├── main.ts                            # bootstrap e painel de verificação
│   ├── style.css
│   ├── domain/
│   │   ├── types.ts                       # schema v1 em TypeScript
│   │   ├── validate.ts                    # validação runtime e invariantes
│   │   ├── graph.ts                       # índices, pais, filhos, irmãos, ancestrais
│   │   └── relationship.ts                # BFS e rótulos de parentesco
│   └── data/
│       ├── legacy-seed.ts                 # cópia fiel do seed do HTML legado
│       ├── migrate-v0.ts                  # migração linhagem única → uniões
│       ├── family.json                    # seed migrado (25 pessoas, 8 uniões)
│       └── load.ts                        # parse + validação
├── fixtures/
│   ├── README.md
│   └── family.fixture.json                # cenários sintéticos (2º casamento etc.)
├── scripts/
│   └── generate-family.ts                 # regenera family.json
├── docs/
│   ├── decisions.md                       # ADRs
│   └── schema.md                          # schema, invariantes e migração
├── Árvore Familiar — Zoom Infinito.html   # protótipo v1 (legado)
├── Árvore Familiar — Zoom Infinito.md
└── Árvore Familiar — Zoom Infinito.pdf
```

## O que a Fase 1 entrega

- Schema v1 com `persons` e `unions`, IDs opacos e datas parciais.
- Validação sem dependências: referências, IDs, ciclos, união parental única, datas e avisos de plausibilidade.
- Índices derivados: `unionsOfPerson`, `parentUnionsOf`, `childrenOfUnion`.
- Consultas: pais, filhos, cônjuges, irmãos completos/meios-irmãos, descendentes e ancestrais.
- BFS de relacionamento com passos (`spouse`, `parent`, `child`, `sibling`) e rótulos comuns: pai/mãe, filho, irmão, avô, tio, primo, sogro, padrasto, enteado, cunhado etc.
- Migração do seed original: 25 pessoas, 8 uniões, 16 vínculos, 4 gerações.
- Fixture sintética com 22 pessoas, 8 uniões e cenários de segundo casamento, meios-irmãos, cinco filhos, união sem filhos e união monoparental.
- 58 testes passando.

## Schema em resumo

- `persons` e `unions` são mapas por id; o id é opaco e a chave deve ser igual ao campo `id`.
- Pessoa não guarda pai/mãe diretamente. A única aresta armazenada é `union.children`.
- Uma pessoa pode participar de várias uniões como parceira; no schema v1, de no máximo uma como filha.
- `parentUnionsOf`, `unionsOfPerson`, gerações, idade e iniciais são **derivados em memória**, nunca persistidos.
- Datas são parciais (`year`, `month`, `day`, `approx`, `raw`).
- `schemaVersion` permite migrar importações antigas.

O schema completo e as invariantes estão em [`docs/schema.md`](docs/schema.md).

## Roadmap

| Fase | Escopo | Status |
| --- | --- | --- |
| 0 | Git, decisões, schema e fixture sintética | Concluída |
| 1 | Domínio normalizado, migração do seed, índices, consultas e testes | Concluída |
| 2 | View tree por união, layout com filhos dinâmicos, re-root e HUD | Aguardando comando |
| 3 | Persistência (JSON local, localStorage/IndexedDB, import/export) | Pendente |
| 4 | Editor mínimo de pessoas, uniões e filhos | Pendente |
| 5 | Acessibilidade, performance, segurança e testes E2E | Pendente |

Cada fase termina com relatório e `git diff`, e só avança após confirmação.

## Protótipo legado

Abra `Árvore Familiar — Zoom Infinito.html` diretamente no navegador. O arquivo é autocontido e não depende de servidor. Ele será mantido apenas como referência durante a migração.
