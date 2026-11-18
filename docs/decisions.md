# Decisões de arquitetura — Fase 0

Data: 2026-11-17

Este documento registra as decisões que orientam as próximas fases. Mudanças posteriores devem ser registradas aqui com a justificativa.

## ADR-001 — Vite + TypeScript vanilla

**Decisão:** usar Vite com TypeScript e DOM/SVG nativos, sem React ou outro framework de UI.

**Motivo:** o núcleo visual é imperativo (câmera, `requestAnimationFrame`, transformações e culling). Um framework de UI não ajuda nesse loop e adiciona complexidade. O domínio, o layout e a persistência se beneficiam de TypeScript e de módulos testáveis.

**Consequências:**

- O app continua estático e pode ser publicado em qualquer host de arquivos.
- Testes de domínio/layout rodam em Node com Vitest.
- A UI pode ser organizada em funções pequenas, sem re-render por estado global.

## ADR-002 — Card por pessoa com grupos de união

**Decisão:** manter o card centrado na pessoa e representar cada união como um grupo de filhos, com barra de contexto (parceiro, status e datas).

Exemplo:

```text
Carlos Albuquerque
♥ Lúcia Fontes · 1978–1995 · divorciados
  └─ Gabriel
♥ Marina Souza · 1997 · casados
  ├─ Helena
  └─ Igor
```

**Motivo:** preserva a profundidade do zoom fractal e mostra segundos casamentos e meios-irmãos sem duplicar a pessoa. Um card por união seria mais literal, mas dobraria a profundidade e repetiria a pessoa em cada casamento.

**Consequências:**

- Filhos são agrupados por união; meios-irmãos ficam visualmente separados.
- Pessoas com várias uniões têm grupos empilhados e altura variável.
- Uniões sem filhos podem aparecer como chip no cabeçalho, sem grupo de filhos.
- Enteados não são filhos da união: aparecem na árvore do próprio parceiro quando ela é re-enraizada.

## ADR-003 — Ordem de entrega

**Decisão:** entregar modelo + layout + persistência antes do editor.

**Motivo:** primeiro garantir que o grafo, a migração e a árvore visual representem corretamente casamentos múltiplos. Sem isso, o editor apenas produziria dados que a visualização não sabe mostrar.

**Consequências:**

- A Fase 1 não altera a UI.
- A Fase 2 consome dados normalizados.
- A Fase 3 permite editar/persistir antes de existir formulário completo.
- O editor entra na Fase 4, quando o modelo já estiver estável.

## ADR-004 — Re-root e modo egocêntrico agora; grafo completo depois

**Decisão:** a próxima visualização continua sendo uma árvore de descendência, mas com troca de raiz. Ações “subir para os pais” e “ver família do cônjuge” cobrem ancestrais imediatos. Um grafo completo (força, DAG ou visão de rede) fica para uma fase posterior.

**Motivo:** o zoom fractal não comporta múltiplas ancestralidades ao mesmo tempo. Re-root resolve a navegação com custo baixo e mantém a identidade visual.

**Consequências:**

- `meta.rootPersonId` é parte do documento.
- A geração exibida é relativa à raiz, não absoluta.
- Pessoas com múltiplos caminhos até a raiz usam a menor profundidade no cálculo de geração.
- O grafo completo não é bloqueante para o MVP.

## ADR-005 — Fixture sintética e seed real intocado

**Decisão:** criar uma família fictícia separada para testar segundo casamento, meios-irmãos, cinco filhos, união sem filhos, união monoparental e família do cônjuge. O seed do HTML original não será alterado para criar esses cenários.

**Motivo:** evita inventar relações na família real e mantém a migração do seed verificável.

**Consequências:**

- `fixtures/family.fixture.json` é a base dos testes de domínio e layout.
- A migração do seed real será testada com contagens e relações conhecidas (25 pessoas, 8 uniões, 16 vínculos).
- Cenários novos entram na fixture, não no seed.

## ADR-006 — Banco de documentos

**Decisão:** o alvo de persistência remota é um banco de documentos, não relacional.

**Motivo:** o documento da família é lido e gravado como uma unidade no protótipo; documentos aninhados simplificam a sincronização inicial. O repositório isola o formato.

**Consequências:**

- O schema normalizado continua válido: pessoas e uniões são referenciadas por id, sem duplicar a relação pai/filho.
- Para famílias grandes ou edição multiusuário, o documento pode ser dividido em coleções `persons` e `unions`, mantendo as mesmas referências.
- Se o documento crescer demais, a escrita passa a ser por comando/entidade, com controle de revisão.
- Campos de controle (`_rev` no CouchDB, `_id`/`version` no MongoDB) ficam fora do domínio e são tratados pelo adaptador.

## ADR-007 — Formato do documento v1

**Decisão:** usar mapas (`Record`) indexados por id para `persons` e `unions`, IDs opacos e sem significado, e não persistir campos derivados.

**Motivo:** consultas O(1), JSON legível e compatibilidade direta com o modelo proposto. A ordem relevante (filhos, parceiros) já está em arrays.

**Consequências:**

- A chave do mapa deve ser idêntica ao campo `id`; a validação rejeita divergências.
- IDs serão slugs estáveis na migração e UUIDs/semelhantes em novos registros.
- Índices (`unionsOfPerson`, `parentUnionsOf`, `childrenOfUnion`) são construídos ao carregar.
- `parentUnionsOf` é um array desde o início, mesmo que a v1 restrinja a uma união parental.

## ADR-008 — Legado preservado

**Decisão:** não reescrever nem remover o HTML original nesta fase.

**Motivo:** ele é a referência visual e funcional para comparar a migração.

**Consequências:**

- O arquivo original permanece na raiz e será mantido até a Fase 2.
- A Fase 1 pode rodar em paralelo, sem tocar no legado.
- A remoção ou movimentação para `legacy/` será decidida quando o novo app estiver equivalente.

## ADR-009 — Domínio puro e validação sem dependência

**Decisão:** manter tipos, validação, grafo e relacionamento em módulos puros, sem DOM e sem biblioteca de schema. A validação é escrita à mão e testada com Vitest.

**Motivo:** o domínio precisa rodar em Node, no build e no navegador, com mensagens de erro controladas e sem adicionar uma dependência só para validar um JSON pequeno.

**Consequências:**

- Erros têm `code`, `path` e `severity` (`error`/`warning`), permitindo UI e importação amigáveis.
- A validação não muta a entrada.
- Se o schema crescer muito, Zod ou similar pode substituir a implementação sem mudar a API pública.

## ADR-010 — BFS de relacionamento por pessoa

**Decisão:** o BFS de parentesco percorre pessoas usando adjacências derivadas das uniões: cônjuge, pai, filho e irmão. Cada passo carrega o `unionId` que o originou.

**Motivo:** o caminho em pessoas é o que a UI precisa exibir; a união permanece como contexto e fonte da relação. O BFS é curto, testável e não exige biblioteca de grafos. Os rótulos comuns são resolvidos por consultas diretas (pai, filho, irmão, avô, tio, primo, afinidade) e o fallback informa a distância.

**Consequências:**

- Meios-irmãos são alcançados via pai/mãe; irmãos completos podem usar a aresta direta de irmão.
- O caminho não é necessariamente a rota genealógica mais “canônica” quando há múltiplos caminhos, mas é o menor em passos.
- Um grafo completo/visual pode reutilizar as mesmas consultas sem alterar o domínio.

## ADR-011 — Layout plano por geração com uniões empilhadas

Data: 2026-11-17

**Decisão:** abandonar o layout fractal aninhado do legado e usar um layout plano por geração. Cada pessoa ocupa um bloco vertical composto por cartão, barras de união e, para cada união, uma linha de filhos. Os blocos irmãos são posicionados horizontalmente e centralizados sob o bloco do genitor.

**Motivo:** o layout aninhado do legado posiciona os filhos dentro do cartão do pai, o que dificulta acomodar segundos casamentos, meios-irmãos e uniões sem filhos sem sobreposição. Separar cada união em sua própria linha mantém a leitura genealógica explícita e permite calcular largura/altura de forma determinística, sem colisões.

**Consequências:**

- O bloco de uma pessoa mede a maior linha de filhos; a altura soma cartão, barras e linhas.
- Uniões são ordenadas por ano de início e, em empate, pela ordem do documento.
- Uma união sem filhos ocupa apenas a barra (sem linha de filhos).
- Uma união entre dois descendentes é exibida apenas na primeira ocorrência para não duplicar o ramo.
- O limite de gerações é relativo à raiz e produz crianças “não exibidas”, contabilizadas no HUD.
- O layout é puro e testado com Vitest (sobreposição, limites, determinismo, fixture e seed).

## ADR-012 — Zoom semântico por LOD e câmera própria

Data: 2026-11-17

**Decisão:** controlar a câmera (pan/zoom) em um `div` com `transform: translate3d(...) scale(...)` e trocar o nível de detalhe por escala: `compact` abaixo de `0.62`, `medium` abaixo de `0.95` e `full` acima disso. O HUD e os controles ficam fora do mundo transformado.

**Motivo:** o zoom fractal do legado dependia de escala por nó e de medições de tela. Um único transform no contêiner é mais barato, previsível e adequado ao DOM; o LOD por escala preserva a leitura em afastamento sem esconder a estrutura.

**Consequências:**

- A câmera inicial foca a raiz em zoom ~`0.95`; `⤢` enquadra a árvore inteira.
- Pan, roda e pinça atualizam a câmera diretamente; `requestAnimationFrame` anima zoom e voos.
- `prefers-reduced-motion` desativa as animações.
- O HUD exibe raiz, datas/local, contagens, botões de pai/mãe e o seletor de gerações.
- A barra de união vira alvo de re-root quando há exatamente um parceiro; cartões também reenraízam.

## ADR-013 — Persistência local com envelope versionado

Data: 2026-11-17

**Decisão:** persistir o documento no `localStorage` dentro de um envelope próprio (`format`, `formatVersion`, `savedAt`, `data`) e manter as preferências de visualização em uma chave separada. O acesso passa por uma interface `KeyValueStorage`, com fallback em memória.

**Motivo:** o schema da família já tem `schemaVersion`, mas a camada de armazenamento também evolui (localStorage → IndexedDB, mudanças de chave e de metadados). Um envelope separado permite versionar e diagnosticar a cópia local sem contaminar o documento. As preferências de UI não pertencem ao domínio e podem ser descartadas sem perda genealógica.

**Consequências:**

- Chaves: `arvore-familiar:document` e `arvore-familiar:view`.
- A leitura valida o documento; cópia corrompida, formato desconhecido ou versão futura é ignorada com aviso e o exemplo embutido é aberto.
- A gravação valida antes de escrever; erros de cota são mapeados para `quota` e o app continua apenas na sessão.
- Sem `localStorage` (modo privado/política), um adaptador em memória mantém o app funcional e o painel indica que a cópia não sobrevive ao reload.
- A importação grava automaticamente. A partir da Fase 4, cada mutação do editor usa o mesmo store.
- IndexedDB pode substituir o adaptador sem mudar o domínio nem a UI, se o documento crescer.

## ADR-014 — Importação/exportação portátil e privacidade

Data: 2026-11-17

**Decisão:** exportar o documento puro, com chaves ordenadas e JSON indentado, e aceitar tanto esse formato quanto o envelope interno na importação. Limitar arquivos a 5 MB, validar antes de aplicar e oferecer uma exportação que remove detalhes de pessoas com `private: true`.

**Motivo:** o arquivo exportado deve ser legível por outras ferramentas e sobreviver à evolução do armazenamento local. A validação antes da troca de documento evita que uma importação inválida derrube a árvore atual. A redação preserva `id` e nome para manter as referências das uniões válidas, sem expor datas, locais, biografia, foto ou apelidos.

**Consequências:**

- Exportações iguais geram arquivos iguais (ordenação determinística por id).
- Erros de importação são exibidos por caminho (`$.unions...`), limitados às primeiras ocorrências.
- Arrastar um `.json` para a tela usa o mesmo caminho de validação do seletor de arquivo.
- A cópia local não é apagada quando uma importação falha.
- O botão “Restaurar exemplo” limpa documento e preferências locais.

## ADR-015 — Editor por mutações puras com autosave transacional

Data: 2026-11-17

**Decisão:** toda edição passa por pequenas funções puras em `src/editor/mutations.ts`, que clonam o documento, aplicam uma alteração e devolvem um novo `FamilyData`. O painel de edição não grava direto no store: a aplicação central valida o resultado, atualiza a árvore, carimba `meta.updatedAt` e só então persiste.

**Motivo:** o documento é compartilhado por layout, exportação, importação e armazenamento. Mutar objetos no lugar criaria divergência entre a árvore renderizada e a cópia salva. Mutações puras são testáveis sem DOM e deixam um único ponto de commit para validação e persistência.

**Consequências:**

- Cada operação valida invariantes locais (parceiro existente, filho em uma única união, união sem parceiros) e o documento inteiro passa por `validateFamilyData`.
- Em caso de erro, o documento em memória e a cópia local permanecem intactos; o painel mostra a mensagem e o formulário preserva os valores digitados.
- Erros de cota ou armazenamento indisponível não bloqueiam a edição da sessão; o status indica que a alteração não sobreviveu ao reload.
- IDs novos são derivados de nomes e recebem sufixo quando colidem; renomear não altera IDs existentes.
- O editor não oferece desfazer global nesta fase; exclusões pedem confirmação inline.
- Em `?familia=fixture`, o commit atualiza apenas a sessão, sem tocar no documento local.

## ADR-016 — Modo de edição sem perder a câmera

Data: 2026-11-17

**Decisão:** o editor é um drawer acionado por `✎ Editar`. Enquanto está aberto, a árvore entra em modo de edição: clicar num cartão ou barra de união seleciona o alvo no editor em vez de reenraizar. A reconstrução após uma mutação usa `updateGraph` e mantém o `transform` da câmera.

**Motivo:** reenraizar e editar competiriam pelo mesmo gesto. Um modo explícito preserva a navegação normal fora do editor e permite selecionar alvos direto na árvore. Recriar a câmera a cada gravação faria o usuário perder o contexto depois de cada campo salvo, o que é especialmente ruim em famílias grandes.

**Consequências:**

- Fora do modo de edição, cartões e barras continuam reenraizando como na Fase 2.
- `TreeView` expõe `setEditing`, `updateGraph` e `getState`; a raiz cai para `meta.rootPersonId` (ou o primeiro id) se a pessoa exibida for excluída.
- A câmera só é reenquadrada por `⌂ Início`, `⤢`, re-root ou mudança de gerações.
- Em telas largas o drawer ocupa a direita e os controles de câmera se deslocam; em telas estreitas o editor vira tela cheia e o seletor de pessoa substitui o clique no cartão.
- O botão do HUD reflete o estado (`✎ Editar` / `✓ Editando`) e `Esc` fecha o painel.

## ADR-017 — Acessibilidade sem transformar o editor em modal

Data: 2026-11-17

**Decisão:** a árvore é uma região focável (`#tree-stage`) descrita por um texto de ajuda, precedida de um skip link. Os cartões usam roving tabindex: só um cartão participa da ordem de tabulação e as setas, além de `Home`, movem o foco espacialmente entre os cartões renderizados. Reenraizar ou mudar o limite de gerações anuncia o novo estado numa região `role="status"` com `aria-live="polite"`. O drawer do editor é uma `role="region"` rotulada, recebe o foco no seletor de pessoa (ou na união selecionada) ao abrir e devolve o foco ao botão `✎ Editar` ao fechar.

**Motivo:** transformar o drawer num modal bloquearia justamente a interação com a árvore, que é a forma natural de escolher o que editar. Um skip link e um único ponto de parada por árvore reduzem o custo de atravessar dezenas de cartões. Anunciar a raiz e as contagens dá contexto a quem não vê o novo enquadramento da câmera.

**Consequências:**

- A árvore continua clicável e focável enquanto o editor está aberto; não há armadilha de foco.
- Setas, `Home`, `+`/`−` e `0` só são interceptados quando o foco não está em controles de formulário ou painéis.
- Depois de um autosave, o foco e a seleção do campo são restaurados; se o controle deixou de existir (exclusão), o foco volta ao seletor de pessoa, nunca ao `<body>`.
- `Ctrl/Cmd+Enter` envia o formulário focado sem tirar o cursor do campo.
- `prefers-reduced-motion: reduce` desliga voos de câmera, transições e scroll suave.
- O contraste de `--muted` e de rótulos pequenos foi elevado para atender AA; o texto mínimo dos rótulos subiu de 10 px para 11 px.
- União focada usa `aria-current`, e o cartão da raiz usa `aria-current="true"` com rótulo explícito.

## ADR-018 — Renderização limitada à viewport em árvores grandes

Data: 2026-11-17

**Decisão:** acima de 120 nós no layout, `renderWorld` converte a câmera num retângulo do mundo com margem de 420 px de tela e só cria DOM para os cartões e arestas que tocam esse retângulo. Durante uma animação de câmera, o retângulo é a união entre a posição atual e o destino. Fora do culling, a renderização usa `DocumentFragment`, a câmera é aplicada dentro de `requestAnimationFrame` e `will-change: transform` só existe enquanto a classe `is-moving` está ativa.

**Motivo:** o layout já era rápido (benchmark de 2 mil pessoas em ~3–7 ms), mas milhares de cartões no DOM custam no estilo, na pintura e na memória. Culling por viewport mantém o custo proporcional ao que está na tela. Promover a camada de GPU permanentemente desperdiça memória e pode piorar a nitidez; ativá-la só durante gestos resolve a fluidez sem esse custo.

**Consequências:**

- `.tree-world` expõe `data-visible-cards` e `data-total-cards`; com `?debug` aparece um overlay com tempo de render, cartões e zoom.
- O culling é recalculado no fim de gestos (roda, arraste, pinça, voo de câmera, resize), não a cada frame.
- Navegação por teclado considera apenas cartões renderizados; `ensureCardVisible` move a câmera antes de focar um alvo fora da tela.
- O foco é restaurado para o cartão anterior quando ele continua renderizado; se saiu da viewport, cai na raiz ou no primeiro cartão visível.
- `npm run bench` mede grafo e layout numa família binária sintética de 500 e 2 mil pessoas.
- A Fase 5 inclui teste de layout com centenas de pessoas e especificação E2E de culling em documento de ~800 nós.

## ADR-019 — Segurança defensiva para um app estático

Data: 2026-11-17

**Decisão:** servir a aplicação com CSP restritiva via `<meta http-equiv>` e com `public/_headers` para hospedagens que aceitam cabeçalhos. A política padrão é `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` e `frame-ancestors 'none'` no header. O validador ganha limites de tamanho e quantidade (`FAMILY_LIMITS`) e a importação continua rejeitando chaves de protótipo.

**Motivo:** o documento familiar pode vir de um arquivo externo e é renderizado como texto. Mesmo usando `textContent` em todos os campos, uma política de origem restritiva reduz o impacto de uma falha futura e impede execução de script inline injetado. Limites de tamanho protegem a aba contra documentos absurdos e completam o limite de 5 MB por arquivo.

**Consequências:**

- Estilos inline continuam permitidos (`style-src 'self' 'unsafe-inline'`) porque o layout posiciona cartões por `style.left/top`; scripts inline não são permitidos.
- `Referrer-Policy: no-referrer` via meta e header; `X-Frame-Options: DENY`, `nosniff` e `Permissions-Policy` no arquivo de headers.
- Limites atuais: 2.000 pessoas, 2.000 uniões, 500 filhos por união, 160 caracteres para nome/id/título, 4.000 para textos, 12 apelidos de até 120 caracteres.
- Documentos acima dos limites são rejeitados com códigos estáveis (`TOO_MANY_PEOPLE`, `NAME_TOO_LONG`, `TOO_MANY_CHILDREN`, etc.).
- A importação recusa `__proto__`, `constructor` e `prototype` em qualquer profundidade relevante, sem aplicar o documento parcialmente.
- Ferramentas E2E que precisam injetar script usam o protocolo do navegador, não `<script>` inline, para não afrouxar a CSP.

## ADR-020 — Testes E2E com Playwright e axe-core

Data: 2026-11-17

**Decisão:** adicionar uma suíte Playwright em `e2e/` cobrindo árvore, editor, acessibilidade, segurança e performance. O Vitest fica restrito a `src/**/*.test.ts` por `vitest.config.ts`, para não tentar executar specs do Playwright. O axe-core é uma dependência separada, injetada com `page.evaluate` e executada por tags `wcag2a`/`wcag2aa`. O Playwright é fixado em `1.64.0` e o servidor sobe em `127.0.0.1:4173` com `reuseExistingServer` fora de CI.

**Motivo:** os testes unitários não cobrem foco, ordem de tabulação, câmera, download, `localStorage` real nem violações de acessibilidade no DOM montado. O Playwright roda o app de verdade; o axe-core encontra regressões de contraste, rótulo e estrutura sem revisão manual. Fixar a versão do Playwright evita baixar um Chromium novo a cada atualização e mantém o CI reproduzível; injetar o axe por protocolo respeita a CSP.

**Consequências:**

- Cada teste abre a app com `localStorage` limpo (`openApp`) e, quando precisa de dados, semeia o envelope diretamente.
- `emulateMedia({ reducedMotion: 'reduce' })` torna a câmera determinística nos testes.
- Os cenários cobrem: re-root persistido, skip link, navegação por setas, editor com autosave e restauração de foco, exclusão com confirmação, `Esc`, fixture apenas em sessão, importação hostil, CSP/XSS, exportação com e sem privados, culling e `will-change`.
- Falhas geram trace, screenshot e contexto em `test-results/`, ignorado pelo Git.
- `npm test` continua rápido e sem navegador; `npm run test:e2e` é o portão antes de cada fase.
