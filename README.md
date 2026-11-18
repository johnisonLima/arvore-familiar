# Árvore Familiar

Protótipo de árvore genealógica com zoom semântico, domínio normalizado de pessoas e uniões e navegação por reenraizamento.

## Status

**Fase 5 concluída.** A árvore tem layout plano por geração, câmera com zoom semântico, re-root e HUD. O documento pode ser importado/exportado como JSON e é salvo no `localStorage` com envelope versionado; a última raiz e o limite de gerações também são lembrados. Um painel `▤ Dados` concentra importação, exportação, restauração do exemplo e o estado da cópia local. O botão `✎ Editar` abre um editor de pessoas, uniões e filhos com gravação automática a cada alteração. A Fase 5 adiciona navegação acessível por teclado, renderização limitada à viewport em árvores grandes, cabeçalhos de segurança e uma suíte E2E com Playwright e axe-core.

## Como rodar

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev        # servidor Vite
npm test           # testes unitários (domínio, layout, formatação, persistência e edição)
npm run test:e2e   # testes E2E com Playwright (sobe o Vite na porta 4173)
npm run bench      # benchmark de grafo/layout em famílias sintéticas
npm run build      # typecheck + build estático
npm run generate:data  # regenera src/data/family.json a partir do seed legado
```

A página inicial carrega o seed real. Use `?familia=fixture` para abrir a fixture sintética, que exercita segundo casamento, meios-irmãos, união sem filhos e união monoparental:

```text
http://localhost:5173/?familia=fixture
```

O protótipo visual antigo continua em `Árvore Familiar — Zoom Infinito.html`.

## Persistência e arquivos

O painel `▤ Dados` fica no canto inferior esquerdo:

- **Importar JSON** aceita um documento familiar puro (ou o envelope interno). O arquivo é validado antes de substituir a árvore; erros aparecem no painel. Também é possível arrastar um `.json` para a tela.
- **Exportar JSON** baixa o documento formatado, com chaves ordenadas para gerar arquivos estáveis.
- **Exportar sem privados** remove datas, locais, biografia, foto e apelidos de pessoas com `private: true`, mantendo `id` e `nome` para que as uniões continuem válidas.
- **Restaurar exemplo** remove a cópia local e as preferências, voltando ao seed embutido.

O `localStorage` guarda dois registros independentes:

| Chave | Conteúdo |
| --- | --- |
| `arvore-familiar:document` | Envelope `{ format, formatVersion, savedAt, data }` com o documento validado |
| `arvore-familiar:view` | Última raiz e limite de gerações (`2`–`5` ou `Todas`) |

Limites desta fase:

- Importação de até **5 MB** por arquivo.
- Documento de até **2.000 pessoas**, **2.000 uniões** e **500 filhos por união**; nome/id/título até 160 caracteres e textos até 4.000. Documentos acima disso são rejeitados com erro de validação.
- Apenas `localStorage`; um adaptador IndexedDB pode entrar atrás da mesma interface quando fotos ou documentos maiores justificarem.
- Se o armazenamento estiver bloqueado ou a cota estourar, o app continua na sessão e o painel indica que a cópia não sobreviverá ao recarregamento.
- O editor grava uma alteração por vez, sempre validada antes de substituir o documento. Não há desfazer global nesta fase.
- Em `?familia=fixture`, o editor funciona apenas na sessão: o modo de teste não grava documento nem preferências.

## Edição

O botão `✎ Editar` no HUD abre o editor no lado direito (tela cheia em telas estreitas). Enquanto ele está aberto:

- clicar num cartão seleciona a pessoa para edição em vez de reenraizar;
- clicar numa barra de união seleciona diretamente a união;
- o seletor de pessoa permite editar qualquer integrante do documento;
- `Esc` ou o botão `✕` fecha o editor.

O editor cobre três blocos:

| Bloco | Operações |
| --- | --- |
| Pessoa | criar, renomear, sexo, anos de nascimento/falecimento, local, biografia, marcação de privacidade e exclusão |
| União | criar, situação, início/fim, local, observação, incluir/remover parceiros e excluir |
| Filhos | incluir pessoa existente, criar filho na união, remover filho |

Cada operação passa por mutações puras em `src/editor/mutations.ts`, é validada com `validateFamilyData` e só então substitui o documento em memória, atualiza a árvore e grava no `localStorage`. A câmera não é reenquadrada durante a edição. Excluir uma pessoa remove seus vínculos; uniões que ficarem sem parceiros são removidas e os filhos continuam no documento.

## Acessibilidade e teclado

- `Tab` a partir do início da página mostra o link **Pular para a árvore**, que leva o foco à região `#tree-stage`.
- Na árvore, apenas um cartão participa da ordem de tabulação. As setas movem o foco espacialmente entre os cartões renderizados; `Home` volta à raiz; `Enter`/`Espaço` reenraíza (ou abre a pessoa no editor, quando ele está aberto).
- `+`/`−` aproximam e afastam, `0` reenquadra a raiz. Atalhos são ignorados enquanto o foco está em campos e painéis.
- Reenraizar ou mudar o limite de gerações anuncia a nova raiz e as contagens numa região `aria-live="polite"`.
- O editor recebe o foco ao abrir e devolve o foco ao botão `✎ Editar` ao fechar com `Esc` ou `✕`. O foco e a seleção do campo são restaurados depois de cada autosave; `Ctrl/Cmd+Enter` salva sem sair do campo.
- `prefers-reduced-motion: reduce` desliga voos de câmera, transições e scroll suave.

## Desempenho

Acima de 120 nós no layout, a árvore renderiza apenas os cartões e arestas próximos da viewport (com margem para o arraste). `will-change: transform` só é aplicado durante gestos e a câmera é aplicada em `requestAnimationFrame`. Com `?debug` na URL aparece um overlay com o tempo de render, cartões visíveis e zoom.

`npm run bench` mede grafo e layout em famílias binárias sintéticas:

| Documento | Pessoas | Uniões | Grafo | Layout | Cartões |
| --- | --- | --- | --- | --- | --- |
| Família 2k | 1.999 | 666 | ~2–3 ms | ~3–7 ms | 1.333 |
| Família 500 | 499 | 166 | ~0,5 ms | ~1–4 ms | 333 |

## Segurança

- CSP restritiva em `index.html` (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`) e `Referrer-Policy: no-referrer`.
- `public/_headers` replica a política e adiciona `X-Frame-Options`, `nosniff`, `Permissions-Policy` e `frame-ancestors` para hospedagens estáticas.
- Todo texto do documento é renderizado com `textContent`; a importação rejeita `__proto__`, `constructor` e `prototype`.
- A validação aplica limites defensivos de tamanho e quantidade antes de qualquer documento substituir a árvore.

## Testes

- `npm test` roda o Vitest apenas em `src/**/*.test.ts` (174 testes).
- `npm run test:e2e` roda o Playwright em Chromium contra o Vite na porta 4173 (17 testes), cobrindo árvore, editor, acessibilidade com axe-core, segurança/importação e culling/performance.
- Falhas geram trace e screenshot em `test-results/`, ignorado pelo Git.

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
├── index.html                             # entrada Vite + CSP
├── playwright.config.ts                   # E2E em 127.0.0.1:4173
├── vitest.config.ts                       # testes unitários em src/**/*.test.ts
├── public/
│   └── _headers                           # CSP e cabeçalhos de hospedagem
├── src/
│   ├── main.ts                            # bootstrap, validação e seleção da fixture
│   ├── style.css
│   ├── domain/
│   │   ├── types.ts                       # schema v1 em TypeScript
│   │   ├── validate.ts                    # validação runtime, invariantes e limites
│   │   ├── graph.ts                       # índices, pais, filhos, irmãos, ancestrais
│   │   └── relationship.ts                # BFS e rótulos de parentesco
│   ├── layout/
│   │   ├── tree.ts                        # layout plano por geração e uniões
│   │   └── large-family.test.ts           # layout com centenas de pessoas
│   ├── editor/
│   │   ├── ids.ts                         # ids legíveis e estáveis para novas entidades
│   │   └── mutations.ts                   # mutações puras de pessoas, uniões e filhos
│   ├── view/
│   │   ├── tree-view.ts                   # câmera, cards, HUD, re-root, foco e culling
│   │   ├── culling.ts                     # viewport do mundo e interseções
│   │   ├── navigation.ts                  # navegação espacial entre cartões
│   │   ├── editor-panel.ts                # formulários de edição e confirmações
│   │   ├── data-panel.ts                  # importar, exportar e estado local
│   │   └── format.ts                      # iniciais, datas e rótulos de união
│   ├── storage/
│   │   ├── document-store.ts              # envelope, validação e cota
│   │   ├── view-store.ts                  # raiz e gerações preferidas
│   │   ├── transfer.ts                    # importação, exportação e privacidade
│   │   ├── key-value.ts                   # localStorage + fallback em memória
│   │   └── download.ts                    # download de Blob
│   └── data/
│       ├── legacy-seed.ts                 # cópia fiel do seed do HTML legado
│       ├── migrate-v0.ts                  # migração linhagem única → uniões
│       ├── family.json                    # seed migrado (25 pessoas, 8 uniões)
│       └── load.ts                        # parse + validação
├── e2e/
│   ├── helpers.ts                         # seed, storage, axe e família sintética
│   ├── tree.spec.ts
│   ├── editor.spec.ts
│   ├── accessibility.spec.ts
│   ├── security.spec.ts
│   └── performance.spec.ts
├── fixtures/
│   ├── README.md
│   └── family.fixture.json                # cenários sintéticos (2º casamento etc.)
├── scripts/
│   ├── generate-family.ts                 # regenera family.json
│   └── benchmark-layout.ts                # grafo/layout em famílias de 500 e 2k
├── docs/
│   ├── decisions.md                       # ADRs
│   └── schema.md                          # schema, invariantes e migração
├── Árvore Familiar — Zoom Infinito.html   # protótipo v1 (legado)
├── Árvore Familiar — Zoom Infinito.md
└── Árvore Familiar — Zoom Infinito.pdf
```

## O que a Fase 5 entrega

- Skip link, região focável da árvore e roving tabindex: um único ponto de parada por árvore.
- Navegação espacial por setas entre cartões renderizados, com `Home` para voltar à raiz e câmera ajustada para o alvo.
- Anúncio da raiz e das contagens em região `aria-live`; `aria-current` no cartão raiz e na união focada.
- Editor como `role="region"` rotulada, foco inicial no alvo e devolução do foco ao botão ao fechar.
- Foco e seleção restaurados depois do autosave; `Ctrl/Cmd+Enter` salva mantendo o cursor no campo; foco nunca cai no `<body>` após exclusão.
- `prefers-reduced-motion` global e ajustes de contraste e de tamanho mínimo de rótulos.
- Culling por viewport acima de 120 nós, `DocumentFragment`, câmera em `rAF` e `will-change` apenas durante gestos.
- Overlay `?debug` com tempo de render, cartões visíveis e zoom; `npm run bench` para grafo e layout.
- CSP via meta e `public/_headers`, `Referrer-Policy`, `X-Frame-Options`, `nosniff` e `Permissions-Policy`.
- Limites defensivos no validador (`FAMILY_LIMITS`) e rejeição de chaves de protótipo na importação.
- Suíte E2E com Playwright e axe-core: 17 cenários cobrindo árvore, editor, acessibilidade, segurança e performance.
- 174 testes unitários e 17 testes E2E passando.

## O que a Fase 4 entrega

- Mutações puras e testáveis para criar, atualizar e excluir pessoas, uniões, parceiros e filhos.
- IDs legíveis derivados de nomes (`p-...`, `u-...`), com sufixo numérico em caso de colisão.
- Editor em drawer com seletor de pessoa, formulário de pessoa, cartões de união e criação de filho direto na união.
- Modo de edição na árvore: cartões e barras de união selecionam o alvo no editor sem reenraizar.
- Autosave transacional: mutação → validação → atualização da árvore → gravação no store da Fase 3.
- Câmera preservada em cada alteração; a árvore é reconstruída sob o mesmo `transform`.
- `meta.updatedAt` atualizado em toda gravação.
- `private` editável e respeitado pela exportação sem privados.
- Exclusões com confirmação inline; remoção de pessoa limpa vínculos, remove uniões sem parceiros e troca a raiz se necessário.
- Fixture editável apenas em memória, sem contaminar a cópia local.
- 158 testes passando (domínio, layout, formatação, storage, transferência, IDs e mutações).

## O que a Fase 3 entrega

- Store de documento com envelope `format`/`formatVersion`/`savedAt`/`data`, validação na leitura e na gravação e diagnóstico de cota.
- Fallback em memória quando o `localStorage` está indisponível, com aviso de sessão no painel.
- Importação por seletor de arquivo ou arrastar-e-soltar, com limite de 5 MB e erros de validação por caminho.
- Exportação determinística (chaves ordenadas) e exportação sem dados de pessoas marcadas como privadas.
- Preferências de visualização persistidas: última raiz e limite de gerações, restauradas ao recarregar.
- Restauração do exemplo embutido com limpeza da cópia local e das preferências.
- Painel `▤ Dados` com estado da cópia local e feedback de importação/exportação.
- Cópia local corrompida ou de versão futura é ignorada com aviso, sem impedir a abertura do exemplo.
- 122 testes passando (domínio, layout, formatação, storage e transferência).

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
| 3 | Persistência (JSON local, localStorage/IndexedDB, import/export) | Concluída |
| 4 | Editor mínimo de pessoas, uniões e filhos | Concluída |
| 5 | Acessibilidade, performance, segurança e testes E2E | Concluída |

Cada fase termina com relatório e `git diff`, e só avança após confirmação.

## Protótipo legado

Abra `Árvore Familiar — Zoom Infinito.html` diretamente no navegador. O arquivo é autocontido e não depende de servidor. Ele será mantido apenas como referência durante a migração.
