# Árvore Familiar

Protótipo de árvore genealógica com zoom semântico, domínio normalizado de pessoas e uniões e navegação por reenraizamento.

## Status

**Fase 2 concluída.** A view tree posiciona cartões por geração, empilha as uniões de cada pessoa e desenha uma linha de filhos por união. A câmera tem pan, zoom por roda/pinça, LOD por escala, foco na raiz e enquadramento completo. Clicar num cartão ou na barra de união reenraíza a árvore; o HUD permite voltar aos pais e limitar gerações.

## Como rodar

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev        # servidor Vite
npm test           # testes de domínio, migração e relacionamento
npm run build      # typecheck + build estático
npm run generate:data  # regenera src/data/family.json a partir do seed legado
```

A página inicial carrega o seed real. Use `?familia=fixture` para abrir a fixture sintética, que exercita segundo casamento, meios-irmãos, união sem filhos e união monoparental:

```text
http://localhost:5173/?familia=fixture
```

O protótipo visual antigo continua em `Árvore Familiar — Zoom Infinito.html`.

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
├── index.html                             # entrada Vite
├── src/
│   ├── main.ts                            # bootstrap, validação e seleção da fixture
│   ├── style.css
│   ├── domain/
│   │   ├── types.ts                       # schema v1 em TypeScript
│   │   ├── validate.ts                    # validação runtime e invariantes
│   │   ├── graph.ts                       # índices, pais, filhos, irmãos, ancestrais
│   │   └── relationship.ts                # BFS e rótulos de parentesco
│   ├── layout/
│   │   └── tree.ts                        # layout plano por geração e uniões
│   ├── view/
│   │   ├── tree-view.ts                   # câmera, cards, barras, HUD e re-root
│   │   └── format.ts                      # iniciais, datas e rótulos de união
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

## O que a Fase 2 entrega

- Layout plano e determinístico por geração: cada pessoa tem cartão, barras de união empilhadas e uma linha de filhos por união.
- Filhos posicionados sob a própria união; segundos casamentos e meios-irmãos não compartilham a mesma linha.
- Uniões sem filhos aparecem apenas como barra; uniões monoparentais continuam válidas.
- Limite de gerações relativo à raiz (`2`, `3`, `4`, `5`, `Todas`), com contagem de pessoas não exibidas.
- Câmera com pan, zoom por roda, pinça em telas de toque, controles `+`/`−` e enquadramento completo (`⤢`).
- Zoom semântico por LOD: `compact`, `medium` e `full` trocam o conteúdo visível do cartão e da barra.
- Re-root por clique no cartão, na barra de união ou nos botões de pai/mãe do HUD; `⌂ Início` volta à raiz do documento.
- Cores por ramo: filhos diretos da raiz recebem matizes da paleta e os descendentes herdam a cor do ramo.
- 85 testes passando (domínio, migração, relacionamento, layout e formatação).

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
| 2 | View tree por união, layout com filhos dinâmicos, re-root e HUD | Concluída |
| 3 | Persistência (JSON local, localStorage/IndexedDB, import/export) | Pendente |
| 4 | Editor mínimo de pessoas, uniões e filhos | Pendente |
| 5 | Acessibilidade, performance, segurança e testes E2E | Pendente |

Cada fase termina com relatório e `git diff`, e só avança após confirmação.

## Protótipo legado

Abra `Árvore Familiar — Zoom Infinito.html` diretamente no navegador. O arquivo é autocontido e não depende de servidor. Ele será mantido apenas como referência durante a migração.
