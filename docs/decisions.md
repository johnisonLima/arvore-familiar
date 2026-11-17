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
