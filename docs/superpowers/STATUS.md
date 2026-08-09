# Status do desenvolvimento

**Atualizado em:** 2026-08-08  
**Fase atual:** implementação inline em andamento. Planos 01–05 estão estruturalmente implementados em branches dependentes; gates executáveis que exigem um runner seguro continuam pendentes e não são tratados como sucesso.

## Gates de processo concluídos

- A especificação final de design em `docs/superpowers/specs/2026-08-07-receitas-design.md` foi explicitamente aprovada pelo usuário em 2026-08-07.
- A fase `superpowers:writing-plans` foi concluída.
- O usuário escolheu **Inline Execution** (`superpowers:executing-plans`).
- A implementação permanece fora de `main`, em branches dependentes, com commits/pushes frequentes.
- Bloqueio ambiental ou de infraestrutura é documentado e o trabalho resolvível por código continua.

## Linha de implementação

1. `feat/foundation-pwa` — plano 01, foundation PWA;
2. `feat/backend-auth-data` — plano 02, backend/auth/dados;
3. `feat/local-first-sync` — plano 03, sync local-first e conflitos;
4. `feat/recipes-cooking-media` — plano 04, receitas/preparo/mídia;
5. `feat/planning-shopping-search` — plano 05, planner/compras/busca local; branch atual deste checkpoint.

A próxima branch deve ser criada sobre o head do plano 05 para executar o plano 06 (`import-backup-diagnostics`).

## Plano 01 — Foundation PWA

Estruturalmente implementado:

- React + TypeScript + Vite;
- shell mobile-first e rotas principais;
- tokens visuais, claro/escuro e base de acessibilidade;
- `vite-plugin-pwa` sem runtime cache privado;
- Playwright preparado para Chromium/WebKit desktop e mobile;
- smoke de navegação/reload offline escrito.

Gates executáveis permanecem pendentes.

## Plano 02 — Backend, Auth e dados

Estruturalmente implementado:

- Supabase browser somente com configuração pública;
- signup público e login anônimo desativados;
- confirmação de e-mail obrigatória;
- bootstrap único servidor e convite seguro para a segunda pessoa;
- exatamente duas vagas atuais por par;
- RLS, integridade cross-pair e autoria histórica;
- recuperação de senha e estados públicos/privados de autenticação;
- Storage privado pair-scoped;
- schema para receitas, histórico, planejamento, compras, sync e conflitos.

Decisão normativa: `docs/decisions/2026-08-07-supabase-invitation-auth-lifecycle.md`.

As migrations atuais vão de `0001_core_identity.sql` a `0015_media_storage.sql`. O contrato semântico de mutações está em `0012_semantic_mutations.sql`.

Provisionamento de projeto Supabase real, migrations aplicadas, pgTAP/RLS e Advisors continuam pendentes.

## Plano 03 — Local-first sync

Estruturalmente implementado na branch `feat/local-first-sync`:

- schema local PowerSync;
- mutation outbox semântica;
- coalescência de mutações pendentes;
- upload por `apply_client_mutation`;
- conflitos preservados em vez de sobrescritos silenciosamente;
- retry/diagnóstico de upload;
- contrato de resolução e delete permanente em migrations posteriores;
- escrita local primeiro e sincronização quando a conexão retorna.

Checkpoint: `docs/superpowers/checkpoints/2026-08-07-local-first-sync.md`.

Observação: esse checkpoint contém referências históricas a nomes/numeração de migrations que mudaram durante a evolução da branch. O source of truth atual é `supabase/migrations/`, em especial `0012_semantic_mutations.sql` para o RPC semântico.

## Plano 04 — Receitas, preparo e mídia

Estruturalmente implementado na branch `feat/recipes-cooking-media`:

- repositório e editor local-first de receitas;
- ingredientes, etapas e categorias;
- quantidades racionais/textuais e escalonamento;
- perfis de conversão conservadores;
- detalhe e modo de preparo;
- sessões de preparo, avaliações e fotos;
- fluxo de mídia privado coerente com o Storage do par.

Progresso detalhado: `docs/superpowers/progress/2026-08-07-recipes-cooking-media.md`.

## Plano 05 — Planejamento, compras e busca local

Estruturalmente implementado na branch `feat/planning-shopping-search`.

### Planner

- períodos de refeição definidos pelo próprio par;
- agenda semanal date-only, sem conversão indevida de fuso;
- horário local opcional;
- porções racionais e observações;
- criação, edição e soft delete local-first;
- entradas antigas sem período continuam visíveis em `Sem período`;
- nenhuma infraestrutura de lembrete/notificação foi adicionada.

### Compras

- múltiplas listas nomeadas;
- uma única lista padrão ativa por par;
- itens manuais, editáveis, marcáveis e removíveis;
- geração por receitas ou intervalo do planner;
- escala por porções antes da consolidação;
- prévia editável antes de persistir;
- proveniência completa preservada em itens consolidados;
- quantidades textuais não são somadas automaticamente;
- massa↔volume só cruza com perfil de densidade conhecido;
- overrides do par têm precedência sobre catálogo padrão curado.

### Busca local

- busca em dados canônicos locais, sem request remoto por tecla;
- título, descrição, ingredientes, categorias e observações;
- comparação case/accent-insensitive em português;
- filtros por categoria, favorita, `Queremos fazer` e `Já fizemos`;
- múltiplas categorias selecionadas são conjuntivas;
- ordenação por recente, nome, mais preparada e melhor avaliada;
- ausência de avaliação permanece `null`, nunca nota zero.

### Revisão do sync

O caminho `repository → mutation_outbox → PowerSyncConnector → apply_client_mutation` foi revisado estaticamente.

`0012_semantic_mutations.sql` já aceita planner e shopping. A revisão detectou e corrigiu métodos de restauração que tentavam limpar `deleted_at` via `update`, operação proibida pelo contrato servidor. Edição de item/entrada deletada ou ausente agora falha sem enfileirar mutação inválida.

Progresso detalhado: `docs/superpowers/progress/2026-08-08-planning-shopping-search.md`.

## Testes escritos, ainda não executados neste ambiente

A base contém cobertura Vitest/Testing Library/SQL/Deno/Playwright para as áreas implementadas, incluindo novos testes de planner, compras, consolidação, proveniência e busca local.

Não foram declarados como verdes nesta sessão:

- `pnpm typecheck`;
- `pnpm test:run`;
- `pnpm build`;
- `pnpm test:e2e:smoke`;
- Playwright cross-browser/rendered QA;
- pgTAP/RLS em Supabase real;
- testes/deploy de Edge Functions em projeto hospedado.

## Bloqueios ambientais e de segurança conhecidos

### Runner Node / Actions

O histórico do runner desta linha de trabalho não conseguiu instalar dependências de `registry.npmjs.org`, e o projeto exige usar o repositório de toolchains para Actions/checkout quando necessário.

O toolchain disponível, `Semogtw/Offline-Toolchains`, é público. Executar nele checkout/testes de `Semogtw/Receitas` (privado) pode expor nomes de arquivos, stack traces ou trechos de fonte privada em logs públicos. Por isso não foi criado um workflow inseguro apenas para obter um gate verde.

É necessário um runner/toolchain privado ou outro caminho que mantenha os logs privados para executar os gates completos com segurança.

### Playwright autenticado

O smoke atual pressupõe acesso às rotas protegidas, mas ainda não há fixture E2E autenticada autocontida/segura no repositório. E2E planner→compras→offline→reconexão e busca offline precisa dessa fixture antes de virar gate confiável.

### Supabase real

Ainda permanecem pendentes:

- aplicar migrations num projeto Supabase real;
- executar pgTAP/RLS de verdade;
- executar testes/deploy de Edge Functions;
- configurar password minimum/redirects/origins finais;
- gerar tipos `Database` a partir do schema realmente aplicado;
- rodar Advisors/security checks do projeto hospedado.

Nenhum projeto pago deve ser criado automaticamente. Custo recorrente obrigatório continua **US$ 0**.

## Próximos planos

1. planos 01–05 — estruturalmente implementados; gates executáveis pendentes;
2. `2026-08-07-06-import-backup-diagnostics.md` — próximo em execução;
3. `2026-08-07-07-hardening-deploy-release.md` — depois do plano 06.

## Método de execução

- `superpowers:executing-plans` inline;
- branch dependente por grande plano enquanto `main` permanece intacta;
- TDD e gates definidos nos planos;
- commits/pushes frequentes;
- bloqueio ambiental é documentado e não impede trabalho resolvível por código;
- @Context7 para APIs atuais, @Supericons para iconografia, @Build Web Apps/Playwright para QA quando disponíveis, metodologia Codex Security nas superfícies sensíveis.

## Restrições permanentes

- custo recorrente obrigatório **US$ 0**;
- exatamente duas pessoas;
- local-first;
- sem perda silenciosa em conflitos;
- sem ImageGen no fluxo visual sem nova autorização explícita;
- decisões puramente técnicas podem ser fechadas pelo agente quando preservarem produto, segurança/privacidade e custo zero;
- decisões que alterem comportamento/UX aprovado ou impliquem custo obrigatório voltam ao usuário.
