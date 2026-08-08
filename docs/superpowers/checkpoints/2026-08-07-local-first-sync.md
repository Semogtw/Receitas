# Checkpoint — Plano 03: Local-first sync

**Data:** 2026-08-07  
**Branch:** `feat/local-first-sync`  
**Estado:** implementação estrutural concluída; gates executáveis dependentes do ambiente continuam pendentes e não são tratados como verdes.

## Implementado

- banco PowerSync persistente e separado por `userId + pairId`;
- schema local dos 15 tipos sincronizáveis, `conflicts` e tabelas local-only `mutation_outbox`/`device_preferences`;
- escrita local semântica versionada com base revision/base payload;
- fila local persistente com retry metadata;
- conexão PowerSync autenticada pela sessão Supabase atual;
- upload revision-aware via RPC `apply_client_mutation`;
- allowlist explícita de tipos sincronizáveis e validação de escopo de pair/ator;
- idempotência e ledger de mutações aplicadas no backend;
- auto-merge apenas para mudanças comprovadamente independentes;
- conflito persistente para mudanças incompatíveis/delete-vs-edit;
- resolução explícita de conflito preservando snapshots históricos;
- centro de conflitos local e estado de sync discreto;
- sync rules PowerSync limitadas ao membership ativo do pair;
- runtime de sync agora montado no `App` e desconectado quando o scope autenticado deixa de existir;
- rota `/conflicts` ligada ao indicador de sync;
- logout usa `disconnect()` pelo lifecycle do runtime, nunca `disconnectAndClear()`;
- estado local é isolado por identidade+pair e não é apagado no logout;
- política de logout detecta mutações pendentes e mídia sem cópia remota confirmada e retorna `pending_data_preserved` sem limpeza destrutiva.

## Commits de fechamento desta sessão

- `526908d` — `test: define logout local-state preservation policy`;
- `84ed995` — `feat: preserve scoped local state across logout`;
- `89c8b55` — `feat: wire sync runtime and conflict center`.

Esses commits foram enviados imediatamente à branch remota para reduzir risco de perda por reset do ambiente.

## Verificações estáticas realizadas

- `feat/local-first-sync` foi confirmada como descendente direta de `feat/backend-auth-data`, inicialmente 23 commits à frente e 0 atrás;
- a API atual do PowerSync foi conferida via Context7: `disconnect()` preserva o banco local e `disconnectAndClear()` executa limpeza local; a implementação usa somente `disconnect()` no lifecycle normal;
- `dbFilename` é determinístico e inclui UUID de usuário e pair, evitando exposição do banco do usuário anterior ao trocar de identidade;
- `PowerSyncConnector` seleciona somente entidades da allowlist `SYNCABLE_ENTITY_TYPES`;
- o RPC de mutação recebe tipo/ID validados e não escolhe tabela a partir de SQL interpolado no browser;
- falha de upload preserva a mutação e incrementa apenas metadata sanitizada (`attempt_count`, `last_error='upload_failed'`);
- o código de conexão não registra JWT, payload de receita ou segredo em logs;
- `transaction.complete()` só ocorre após resultados duráveis para todas as entidades tocadas pelo CRUD transaction.

## Gates não executados

O runner local disponível nesta conversa não consegue resolver `github.com`/`registry.npmjs.org`, portanto não foi possível obter um checkout executável nem instalar dependências. Consequentemente, permanecem **não executados**:

- `pnpm typecheck`;
- `pnpm test:run`;
- `pnpm build`;
- Playwright;
- Supabase local/pgTAP/Edge Function tests;
- validação das sync rules contra um serviço PowerSync provisionado.

O teste de política de logout foi escrito antes da implementação conforme TDD, mas o gate RED/GREEN não pôde ser executado neste runner. Isso é um bloqueio ambiental, não um resultado verde.

## E2E ainda pendente por dependência funcional

O cenário completo do plano 03 — abrir uma receita, editar offline, recarregar, reconectar e observar upload — depende do editor/repositório de receitas que pertence ao plano 04. O mesmo vale para o E2E de duas janelas alterando o mesmo título a partir da UI real. Criar testes Playwright que fingissem essa UI agora produziria um gate permanentemente quebrado sem aumentar cobertura real.

Assim que o fluxo de receita do plano 04 existir, criar e executar:

- `tests/e2e/offline-sync.spec.ts`;
- `tests/e2e/conflicts.spec.ts`.

Até lá, a lógica de conflitos/upload possui testes unitários/SQL escritos no repositório, ainda sujeitos ao bloqueio de execução descrito acima.

## Próximo passo

Iniciar o plano 04 em uma branch dependente de `feat/local-first-sync`, começando pelos tipos de domínio, quantidades racionais exatas, serialização de quantidades e serving scaling. A implementação de mídia deverá também alinhar `storage_state` ao modelo offline documentado (`local_only`, `upload_pending`, `uploading`, `synced`/equivalentes, falha e estados de download/cache) sem apagar a garantia de compatibilidade com o backend.
