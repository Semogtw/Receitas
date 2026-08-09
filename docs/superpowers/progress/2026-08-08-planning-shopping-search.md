# Progresso — planejamento, compras e busca local

**Data:** 2026-08-08  
**Plano:** `docs/superpowers/plans/2026-08-07-05-planning-shopping-search.md`  
**Branch:** `feat/planning-shopping-search`  
**Base:** `feat/recipes-cooking-media`

## Estado

O plano 05 está estruturalmente implementado em código. Planner, listas de compras e busca de receitas deixaram de ser placeholders e agora operam sobre os dados canônicos locais do PowerSync.

Os gates executáveis continuam pendentes. Nenhum `typecheck`, Vitest, build ou Playwright é declarado como aprovado neste checkpoint.

## Planner compartilhado

Implementado:

- períodos de refeição criados pelo próprio par, com renomeação e reordenação;
- agenda semanal Monday→Sunday baseada em valores `YYYY-MM-DD`, sem converter a data do planejamento para timestamp UTC;
- horário opcional preservado como relógio local;
- criação, edição e soft delete de refeições planejadas;
- porções racionais exatas, sem conversão para ponto flutuante no domínio;
- observação opcional;
- interface mobile-first com navegação semanal e agrupamento por período;
- entradas antigas com `meal_period_id = null` permanecem visíveis em `Sem período`, em vez de desaparecerem da agenda;
- nenhum lembrete, notificação, permission prompt ou infraestrutura de agendamento foi adicionada.

Arquivos principais:

- `src/features/planner/domain/types.ts`;
- `src/features/planner/domain/date-only.ts`;
- `src/features/planner/data/planner-repository.ts`;
- `src/features/planner/components/MealPlanEditor.tsx`;
- `src/features/planner/components/MealPeriodSettings.tsx`;
- `src/features/planner/components/PlannerView.tsx`;
- `src/app/routes/PlannerRoute.tsx`;
- `src/styles/planner.css`.

## Compras

Implementado:

- múltiplas listas nomeadas;
- no máximo uma lista padrão ativa por par, preservando a constraint servidor já existente;
- troca explícita de lista padrão;
- inclusão manual rápida;
- edição de quantidade/unidade;
- check/uncheck e soft delete de itens;
- geração a partir de receitas selecionadas;
- geração a partir de um intervalo do planner;
- escala por porções acontece antes da consolidação;
- prévia editável antes de inserir itens gerados na lista;
- todas as origens de um item consolidado são persistidas em `source_refs`, inclusive proveniência mista receita/planner;
- quantidades textuais não são somadas automaticamente;
- massa↔volume só é consolidado quando existe perfil explícito de densidade;
- overrides do par têm precedência e o pequeno catálogo padrão curado também é considerado;
- conversões por densidade permanecem marcadas como aproximadas.

Arquivos principais:

- `src/features/shopping/domain/types.ts`;
- `src/features/shopping/domain/generate-items.ts`;
- `src/features/shopping/domain/consolidation.ts`;
- `src/features/shopping/data/shopping-repository.ts`;
- `src/features/shopping/components/ShoppingLists.tsx`;
- `src/features/shopping/components/ShoppingListDetail.tsx`;
- `src/features/shopping/components/AddRecipesToShopping.tsx`;
- `src/app/routes/ShoppingRoute.tsx`;
- `src/styles/shopping.css`.

## Busca local

Implementado:

- pesquisa inteiramente sobre tabelas canônicas locais, sem serviço remoto por tecla e sem índice paralelo como nova fonte de verdade;
- texto parcial em título, descrição, ingredientes, categorias e observações;
- comparação tolerante a caixa e acentos em português;
- todos os tokens da consulta precisam estar presentes, podendo vir de campos diferentes;
- filtros por categoria, favorita, `Queremos fazer` e `Já fizemos`;
- múltiplas categorias selecionadas usam semântica conjuntiva: a receita deve pertencer a todas as categorias ativas;
- `Já fizemos` deriva de sessões de preparo válidas;
- ordenação por atualização da receita, nome, quantidade de preparos e melhor avaliação;
- ausência de avaliação permanece `null` e ordena depois das receitas avaliadas — nunca é reinterpretada como nota zero;
- estado vazio de busca é distinto do estado de caderno sem receitas.

Arquivos principais:

- `src/features/search/domain/search.ts`;
- `src/features/search/data/search-index.ts`;
- `src/features/search/components/RecipeSearchControls.tsx`;
- `src/app/routes/RecipesRoute.tsx`;
- `src/styles/search.css`.

## Revisão do contrato de sync

Foi feita revisão estática do caminho completo:

`repositório local → mutation_outbox → PowerSyncConnector → apply_client_mutation`.

`supabase/migrations/0012_semantic_mutations.sql` já aceita `meal_periods`, `meal_plan_entries`, `shopping_lists` e `shopping_items`, portanto não foi necessária migration nova apenas para habilitar essas entidades.

A revisão encontrou um problema real antes do checkpoint: o RPC aceita somente `create`, `update` e `soft_delete`, e `update` não pode alterar `deleted_at`. Métodos iniciais de restauração do planner/compras tentavam limpar `deleted_at` via `update` e foram removidos. Edição de entidade ausente/deletada agora falha sem enfileirar uma mutação que o servidor rejeitaria.

Também foi corrigida a leitura de `meal_period_id = null`: ela permanece `null` no domínio e na UI, em vez de virar a string `"null"`.

A criação da primeira lista seguida de `setDefaultList()` foi revisada contra a coalescência de `applyLocalMutation`: enquanto o `create` está pendente, o segundo payload é coalescido mantendo a operação final como `create`, portanto o servidor recebe a linha final já marcada como padrão.

## Testes escritos

Foram adicionados testes Vitest/Testing Library para:

- aritmética date-only do planner;
- repositório e mutações do planner;
- criação/renomeação/reordenação de períodos;
- editor e agenda do planner;
- compatibilidade de entrada sem período;
- geração e escala de itens de compras;
- consolidação conservadora e perfis de densidade;
- repositório de listas/itens e proveniência;
- troca de listas e lista padrão;
- detalhe de lista e prévia editável;
- domínio de busca, agregados canônicos locais e controles de busca.

Esses testes estão escritos, mas **não foram executados nesta sessão**.

## Gates pendentes e por quê

Continuam pendentes:

- `pnpm typecheck`;
- `pnpm test:run`;
- `pnpm build`;
- `pnpm test:e2e:smoke`;
- Playwright cross-browser/rendered QA;
- E2E completo planner→compras→offline→reconexão e busca offline com sessão autenticada real.

O projeto instrui que Actions/checkout usem o repositório de toolchains. O repositório disponível, `Semogtw/Offline-Toolchains`, é público. Executar ali um checkout/teste do repositório privado `Semogtw/Receitas` pode vazar nomes de arquivos, stack traces e trechos de fonte privada nos logs públicos; por isso não foi criado um workflow inseguro apenas para obter um gate verde.

Além disso, o Playwright existente não define uma fixture autenticada autocontida nem credenciais E2E. O smoke atual pressupõe uma sessão apta a entrar nas rotas protegidas. Esse requisito precisa de um runner privado/seguro e uma fixture de autenticação controlada antes de o E2E ser considerado gate confiável.

## Próximo passo

Prosseguir para o plano 06 (`import-backup-diagnostics`) em branch dependente, mantendo os gates acima explicitamente pendentes até existir um runner seguro capaz de executá-los.
