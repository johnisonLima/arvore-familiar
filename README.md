# Árvore Familiar

Protótipo de árvore genealógica com zoom fractal, agora preparado para evoluir de uma árvore de linhagem única para um grafo familiar com uniões.

## Status

**Fase 0 concluída.** O protótipo original foi preservado como baseline e as decisões de arquitetura, o schema normalizado e a fixture de testes estão definidos. A implementação do domínio começa na Fase 1.

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
├── Árvore Familiar — Zoom Infinito.html   # protótipo v1 (legado)
├── Árvore Familiar — Zoom Infinito.md     # dica de uso do protótipo
├── Árvore Familiar — Zoom Infinito.pdf    # impressão do protótipo
├── docs/
│   ├── decisions.md                       # ADRs e decisões da Fase 0
│   └── schema.md                          # schema v1, invariantes e migração
├── fixtures/
│   ├── README.md                          # cenários cobertos pela fixture
│   └── family.fixture.json                # família sintética normalizada
└── scripts/
    └── check-fixture.mjs                  # validação da fixture (Node, sem deps)
```

O HTML original não foi alterado. Ele continua sendo a referência visual e comportamental até a Fase 2.

## Validar a fixture

Requer Node.js 18 ou superior:

```bash
node scripts/check-fixture.mjs
```

O script confere referências, unicidade, ciclos, união parental única, idades e os cenários que a fixture precisa cobrir.

## Schema em resumo

- `persons` e `unions` são mapas por id; o id é opaco e a chave deve ser igual ao campo `id`.
- Pessoa não guarda pai/mãe diretamente. A única aresta armazenada é `union.children`.
- Uma pessoa pode participar de várias uniões como parceira; no schema v1, de no máximo uma como filha.
- `parentUnionsOf`, `unionsOfPerson`, gerações, idade e iniciais são **derivados em memória**, nunca persistidos.
- Datas são parciais (`year`, `month`, `day`, `approx`, `raw`), porque genealogia lida com datas incompletas.
- `schemaVersion` permite migrar importações antigas.

O schema completo e as invariantes estão em [`docs/schema.md`](docs/schema.md).

## Roadmap

| Fase | Escopo | Status |
| --- | --- | --- |
| 0 | Git, decisões, schema e fixture sintética | Concluída |
| 1 | Domínio normalizado, migração do seed, índices, consultas e testes | Aguardando comando |
| 2 | View tree por união, layout com filhos dinâmicos, re-root e HUD | Pendente |
| 3 | Persistência (JSON local, localStorage/IndexedDB, import/export) | Pendente |
| 4 | Editor mínimo de pessoas, uniões e filhos | Pendente |
| 5 | Acessibilidade, performance, segurança e testes E2E | Pendente |

Cada fase termina com relatório e `git diff`, e só avança após confirmação.

## Protótipo legado

Abra `Árvore Familiar — Zoom Infinito.html` diretamente no navegador. O arquivo é autocontido e não depende de servidor. Ele será mantido apenas como referência durante a migração.
