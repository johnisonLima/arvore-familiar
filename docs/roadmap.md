# Roadmap — Fases 6 a 9

Este documento detalha o que vem depois da Fase 5. O roadmap original terminava na Fase 5; as fases abaixo são uma proposta de continuidade, ainda **não autorizadas**.

O objetivo é evoluir o protótipo em blocos independentes, cada um entregável e verificável, sem reescrever o modelo antes de existir uma necessidade concreta.

## Como ler

- **Tamanho** é relativo: `S` (dias), `M` (1–2 semanas), `L` (3–4 semanas), `XL` (mais de um mês).
- **Depende de** indica a fase mínima para começar, não uma ordem rígida de trabalho.
- Mudanças de modelo ou de arquitetura exigem **ADR aprovado antes do código**.
- Toda fase termina com relatório, `git diff` e a suíte inteira verde (`tsc`, Vitest, Playwright, build), como nas fases 0–5.

## Resumo

| Fase | Tema | Tamanho | Risco | Depende de | Status |
| --- | --- | --- | --- | --- | --- |
| 6 | Confiabilidade de entrega | S | Baixo | 5 | Planejada |
| 7 | Encontrar e navegar | M/L | Médio | 6 | Planejada |
| 8 | Modelo v2 e integridade dos dados | XL | Alto | 7 | Planejada |
| 9 | Persistência durável e colaboração | XL | Alto | 8 | Planejada |

## Fase 6 — Confiabilidade de entrega

**Objetivo:** transformar a Fase 5 em um portão automático e tornar a entrega reproduzível.

**Problema atual:** a suíte existe, mas depende de execução manual. Não há CI, não há cobertura medida, o `frame-ancestors` só existe no `public/_headers` (meta CSP não o suporta) e não há limite para o crescimento do bundle.

**Escopo:**

- Pipeline de CI (GitHub Actions ou equivalente) com `npm ci`, `npm run typecheck`, `npm test`, `npm run build` e `npm run test:e2e`; cache do npm e publicação de `test-results/` quando falhar.
- Cobertura com `@vitest/coverage-v8`, relatório no CI e thresholds iniciais conservadores (linhas ~80%, branches ~70%), ajustáveis uma única vez.
- Cabeçalhos reais em desenvolvimento e preview (`vite.config.ts` → `server.headers` e `preview.headers`), mantendo `public/_headers` para hospedagem estática.
- Teste E2E que falha se a resposta não trouxer `Content-Security-Policy` com `frame-ancestors 'none'` e `X-Content-Type-Options`.
- Orçamento de bundle: script que compara o `dist` com limites (ex.: JS gzip ≤ 100 kB, CSS gzip ≤ 30 kB) e quebra o CI ao exceder.
- Procedimento documentado para atualizar Playwright + Chromium (a versão é fixada por causa do browser em cache).
- `npm ci` do zero reproduzindo os mesmos resultados.

**Critérios de aceite:**

- [ ] PR sem CI verde não entra (branch protection).
- [ ] Cobertura e orçamento de bundle são verificados automaticamente.
- [ ] `frame-ancestors` presente em dev, preview e produção.
- [ ] Nenhuma mudança de comportamento visível para o usuário.

**Fora de escopo:** deploy automático, monitoramento em produção, CDN, observabilidade.

**ADRs previstos:** nenhum (infraestrutura).

## Fase 7 — Encontrar e navegar

**Objetivo:** resolver o uso real em famílias grandes sem mudar o schema.

**Problema atual:** a árvore só desenha descendentes da raiz; `aliases` existe no schema e não é usado em lugar nenhum; não há busca; não há link compartilhável; não há desfazer.

**Escopo:**

- **Busca de pessoas** por nome e apelido, com normalização de caixa e acentos, ranking (prefixo antes de "contém") e navegação por teclado. Atalho `/` para focar; `Enter` centraliza e reenraíza; resultados anunciados em região `aria-live`. Função pura em `src/domain/search.ts`, UI em `src/view/search-panel.ts`.
- **Grafo completo em torno da raiz:** ascendentes, cônjuges e irmãos além dos descendentes, com limites separados de gerações acima e abaixo. O domínio já tem `ancestorsOf`, `spousesOf` e `siblingsOf`; falta o layout e os controles. Precisa preservar re-root, culling, navegação espacial e foco.
- **Deep link:** `?raiz=<id>&geracoes=<n>` (convivendo com `?familia=fixture`), validado contra o documento; raiz inválida cai no padrão sem erro. Atualizar a URL com `history.replaceState` ao reenraizar.
- **Desfazer/refazer local:** pilha em memória (limite ~50), `Ctrl/Cmd+Z` e `Ctrl/Cmd+Shift+Z`, restaurando documento, árvore e foco. Não persiste entre sessões.
- **Editor:** adicionar parceiro já existente; reordenar filhos (botões ↑/↓ em vez de arrastar, para manter acessibilidade).
- **Exportar para PDF** via folha de impressão dedicada (sem dependência nova). Exportar PNG do recorte atual é extensão opcional, decidida em ADR.

**Critérios de aceite:**

- [ ] Busca encontra por apelido e ignora acentos/caixa; primeiro resultado centraliza e recebe foco.
- [ ] Layout com ascendentes e irmãos não quebra invariantes, culling, foco nem re-root; testes unitários cobrem 3 gerações acima e meios-irmãos.
- [ ] Link com raiz inexistente abre a raiz padrão, sem erro no console.
- [ ] Undo/redo desfaz e refaz uma mutação, atualiza árvore e documento, e é anunciado para leitores de tela.
- [ ] PDF gerado pela impressão não corta cartões nem perde nomes.

**Fora de escopo:** mudanças de schema, backend, colaboração, edição de arestas qualificadas.

**ADRs previstos:** layout do grafo completo (posicionamento de ascendentes e irmãos) e formato do deep link.

## Fase 8 — Modelo v2 e integridade dos dados

**Objetivo:** representar relações que a v1 não expressa e tornar os dados confiáveis para uso real.

**Problema atual:** `union.children` trata todo vínculo como biológico; `private` é manual e não cobre pessoas vivas; não há fontes; não há fusão de duplicados; não há interoperabilidade GEDCOM.

**Escopo nuclear:**

- **Schema v2** com migração pura e testada v1 → v2, incluindo fixtures e documentos exportados antigos. `schemaVersion: 2`, validação e limites atualizados.
- **Vínculos qualificados** para filhos: biológico, adotivo, enteado/padrasto e guarda, com `unknown` como padrão. A forma exata (lista de vínculos em `union.children` vs. coleção própria) é decisão de ADR; a UI e o layout precisam rotular o vínculo.
- **Privacidade de pessoas vivas:** regra automática (sem data de óbito e nascimento dentro de uma janela configurável) combinada com override explícito por pessoa. A exportação sem privados passa a respeitar a regra efetiva.
- **Fontes e confiança:** registro mínimo de fontes por pessoa/união, com nível de confiança. Citação campo a campo fica fora desta fase.
- **Fusão de duplicados:** comparar duas pessoas, mostrar uniões/filhos/atributos conflitantes e mesclar em uma transação validada. Nunca mesclar automaticamente.

**Extensão (pode escorregar para 8.x):**

- Importação GEDCOM 5.5.1 (limite de arquivo, relatório de avisos, mapeamento para v2) e exportação básica.
- Revisão dos limites de `FAMILY_LIMITS` para documentos v2.

**Critérios de aceite:**

- [ ] Migração v1 → v2 é idempotente e não muta a entrada; documentos antigos continuam abrindo.
- [ ] Todos os vínculos antigos viram o equivalente mais próximo (`unknown` quando não inferível) e o editor permite corrigir.
- [ ] Exportação sem privados remove dados de pessoas vivas segundo a regra, com exceções explícitas respeitadas.
- [ ] Fusão de duplicados é transacional: em conflito não resolvido, nada é gravado.
- [ ] GEDCOM importado gera relatório de erros por caminho, no mesmo estilo da importação JSON.

**Fora de escopo:** eventos genealógicos completos, citações por campo, DNA, mapas, perfis públicos.

**ADRs previstos:** formato do vínculo qualificado, regra de privacidade de vivos, escopo de fontes, algoritmo de fusão.

## Fase 9 — Persistência durável e colaboração

**Objetivo:** sair do `localStorage` e permitir que mais de uma pessoa edite a mesma família com segurança.

**Problema atual:** o documento vive em uma única aba/navegador, sem histórico, sem revisão e sem colaboração. `DocumentStore` já isola a persistência, mas não há adaptador durável.

**Escopo:**

- **Adaptador IndexedDB** atrás da interface atual, com migração única do `localStorage` (cópia de segurança antes de remover a chave antiga) e fallback para memória preservado.
- **Banco de documentos** com revisão (`_rev`), concorrência otimista e sincronização offline-first. A escolha (CouchDB/PouchDB vs. outro documento gerenciado) fica em ADR.
- **Autenticação e permissões:** dono, editor e leitor; convite por link; autorização aplicada no servidor, não só na UI.
- **Resolução de conflitos:** detectar revisão divergente, mostrar diferenças por pessoa/união e permitir escolher lado ou mesclar; fila de alterações offline com retry e backoff.
- **Histórico e auditoria:** lista de revisões com autor e data, restauração de versão anterior e trilha de alterações.
- **Validação no servidor:** reutilizar o schema/`validateFamilyData` (pacote compartilhado) e impor `FAMILY_LIMITS` também no backend.
- **Segurança:** tokens fora do `localStorage`, `connect-src` restrito à API, rate limit e validação de payload no servidor.

**Critérios de aceite:**

- [ ] Dois navegadores convergem para o mesmo documento após edições concorrentes.
- [ ] Edições offline são enfileiradas e sincronizadas ao reconectar, sem duplicar operações.
- [ ] Conflito de revisão nunca sobrescreve em silêncio; a UI mostra o diff.
- [ ] Leitor não consegue gravar nem chamando a API diretamente.
- [ ] Restaurar uma revisão anterior é transacional e auditável.
- [ ] Documento acima dos limites é rejeitado no servidor com o mesmo código da validação local.

**Fora de escopo:** chat, presença em tempo real, notificações push, aplicativo móvel nativo.

**ADRs previstos:** escolha do banco de documentos, modelo de permissões, estratégia de migração e formato do histórico.

## Backlog não agendado

Ideias descartadas ou adiadas por não sustentarem uma fase agora:

- Aplicativo móvel nativo e PWA offline completa.
- Presença em tempo real e cursores colaborativos.
- Perfis públicos, SEO e páginas por pessoa.
- Mapas de migração, DNA e linhas do tempo.
- GEDCOM 7 completo.
- Recursos de IA (transcrição, restauração de fotos, sugestão de parentesco).

## Definition of done (todas as fases)

- `npx tsc --noEmit`, `npm test`, `npm run test:e2e` e `npm run build` verdes.
- Testes novos cobrindo o comportamento adicionado; nenhuma regressão nos existentes.
- README, `docs/decisions.md` e `docs/schema.md` atualizados quando o comportamento ou o modelo mudar.
- Relatório da fase com o que entrou, o que ficou de fora e `git diff`.
- Nenhuma fase começa sem autorização explícita.
