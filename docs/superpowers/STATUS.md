# Status do desenvolvimento

**Atualizado em:** 2026-08-07  
**Fase atual:** implementação inline em andamento. Planos 01 e 02 estão estruturalmente implementados; gates que dependem de instalar pacotes, executar Supabase local ou provisionar o projeto cloud continuam pendentes e não são tratados como sucesso.

## Gates de processo concluídos

- A especificação final de design em `docs/superpowers/specs/2026-08-07-receitas-design.md` foi **explicitamente aprovada pelo usuário em 2026-08-07**.
- A fase `superpowers:writing-plans` foi concluída.
- O usuário escolheu **Inline Execution** (`superpowers:executing-plans`).
- Implementação permanece fora de `main` em branches dependentes e com commits frequentes.

> A linha de status antiga no cabeçalho da especificação final foi escrita antes da aprovação. Este arquivo prevalece como status atual: **design aprovado e implementação iniciada**.

## Plano 01 — Foundation PWA

Branch base: `feat/foundation-pwa`.

Implementado:

- React 19 + TypeScript + Vite 8;
- env público tipado para Supabase/PowerSync;
- tokens visuais, claro/escuro e base de acessibilidade;
- shell mobile-first e rotas `/recipes`, `/planner`, `/shopping`, `/history`, `/settings`;
- iconografia Lucide revisada via @Supericons;
- `vite-plugin-pwa` com atualização explícita e sem runtime cache privado;
- SVG fonte + PNGs PWA conferidos por SHA de blob Git;
- Playwright preparado para Chromium/WebKit desktop e mobile, incluindo iPhone;
- smoke de navegação e reload offline após service worker pronto.

Commits principais: `19ad1fa`, `2ca289c`, `7d11dcd`, `deb4c4e`, `05d29e1`, `70de416`, `2d1a786`.

## Plano 02 — Backend, Auth e dados

Branch atual: `feat/backend-auth-data`, criada sobre `feat/foundation-pwa`.

### Supabase e autenticação fechada

Implementado:

- cliente browser Supabase somente com configuração pública;
- signup público e login anônimo desativados em `supabase/config.toml`;
- confirmação de e-mail obrigatória;
- bootstrap único protegido por segredo servidor;
- bootstrap por `admin.inviteUserByEmail()` — senha nunca entra no endpoint e é escolhida pelo próprio usuário;
- estado privado de bootstrap com lock e consumo permanente;
- reenvio seguro/idempotente do primeiro convite expirado sem reabrir signup ou recriar `pair`;
- segunda vaga reservada por convite administrativo do Supabase;
- membership pendente não passa por RLS até `activated_at`;
- par fecha somente após a segunda identidade verificada concluir a reserva;
- aceitação do segundo convite é idempotente;
- nenhum token adicional do domínio passa pela URL do navegador;
- logout usa escopo local do Supabase;
- auth-scope local existe somente como otimização de disponibilidade offline e é invalidado quando uma checagem online negar membership;
- recuperação de senha por e-mail com mensagem anti-enumeração e erro real de transporte separado;
- UI pública fechada para login, recovery, setup protegido, finalização de convite e atualização de senha;
- settings só oferece convite da segunda pessoa enquanto o par estiver aberto.

Decisão técnica normativa: `docs/decisions/2026-08-07-supabase-invitation-auth-lifecycle.md`.

### Banco e RLS

Migrations implementadas:

- `0001_core_identity.sql` — pair/members/invites e capacidade;
- `0002_recipe_domain.sql` — receitas, ingredientes, etapas, categorias, mídia, preparos, avaliações, conversões e imports;
- `0003_planning_domain.sql` — períodos, planejamento, listas e itens de compras;
- `0004_sync_conflicts.sql` — preservação de conflitos;
- `0005_identity_helpers.sql` — helper servidor do bootstrap;
- `0006_bootstrap_reinvite.sql` — state machine recuperável de reinvite;
- `0007_identity_idempotency.sql` — ativação/aceitação idempotentes;
- `0008_storage_policies.sql` — Storage privado pair-scoped;
- `0009_detach_auth_identity.sql` — autoria histórica desacoplada da existência atual da conta Auth;
- `0010_pair_invite_no_url_secret.sql` — aceitação do segundo membro sem segredo extra na URL;
- `0011_actor_integrity.sql` — `created_by`/`recorded_by` pertencem ao ator real na criação e ficam imutáveis.

O modelo já contém os **15 tipos sincronizáveis** esperados pelo plano 03, além de `conflicts` separado.

Invariantes implementadas:

- exatamente duas vagas atuais por pair;
- remover membro não reabre par fechado;
- associação cross-pair impedida também por FKs compostas `(id, pair_id)`;
- avaliações 0–10 em incrementos de 0,5, uma ativa por usuário/preparo;
- cada usuário só escreve a própria avaliação;
- uma capa ativa por receita;
- uma lista de compras padrão ativa por par;
- soft delete e `revision` nas entidades sincronizáveis;
- autoria histórica não pode ser forjada nem reatribuída posteriormente.

### Storage

Bucket privado `recipe-media`:

- máximo 20 MiB por objeto;
- JPEG, PNG, WebP, HEIC e HEIF;
- namespace `<pair_id>/<user_id>/...`;
- SELECT apenas para membro do par;
- INSERT apenas no namespace do próprio `auth.uid()`;
- browser sem policy de overwrite ou delete físico;
- exclusão de produto continua lógica; limpeza física será privilegiada.

### Testes escritos, ainda não executados

- `supabase/tests/identity_rls.sql`;
- `supabase/tests/identity_idempotency.sql`;
- `supabase/tests/domain_rls.sql`;
- `supabase/tests/storage_rls.sql`;
- `supabase/tests/actor_integrity.sql`;
- testes Deno dos services de bootstrap/reinvite/pair-invite;
- testes Vitest de auth scope, invite completion e app gate.

A revisão estática de segurança também removeu uma credencial de domínio redundante que inicialmente apareceria na query string do convite do segundo membro.

## Bloqueios ambientais conhecidos

### Dependências Node

O runner desta sessão usa Node `22.16.0`, enquanto o alvo do projeto é Node 24. Mais importante: o ambiente não consegue acessar `registry.npmjs.org`.

Por isso, **não foram executados nem declarados como verdes**:

- geração de `pnpm-lock.yaml`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test:run`;
- `pnpm build`;
- Playwright;
- geração oficial dos assets pelo pacote PWA.

### Supabase local/cloud

Não existe ainda um projeto cloud `Receitas` no Supabase conectado e o CLI não pôde ser instalado no runner atual.

Logo, continuam pendentes:

- aplicar migrations num Postgres Supabase real;
- executar pgTAP/RLS de verdade;
- executar testes/deploy de Edge Functions;
- configurar o projeto hospedado com password minimum >= 12 e redirects/origins finais;
- gerar `Database` TypeScript a partir do schema realmente aplicado;
- rodar Advisors/security checks do projeto hospedado.

O conector Supabase exige explicitamente escolher organização e confirmar custo antes de criar projeto. Esse provisionamento será feito somente quando necessário e com esse gate explícito; nenhum projeto pago será criado automaticamente.

## Próximos planos

1. `2026-08-07-01-foundation-pwa.md` — estruturalmente implementado; gates executáveis pendentes.
2. `2026-08-07-02-backend-auth-data.md` — estruturalmente implementado; Supabase real/tipos/gates pendentes.
3. `2026-08-07-03-local-first-sync.md` — próximo em execução.
4. `2026-08-07-04-recipes-cooking-media.md`
5. `2026-08-07-05-planning-shopping-search.md`
6. `2026-08-07-06-import-backup-diagnostics.md`
7. `2026-08-07-07-hardening-deploy-release.md`

## Método de execução

- `superpowers:executing-plans` inline;
- branch dependente por grande plano enquanto `main` permanece intacta;
- TDD e gates definidos nos planos;
- commits frequentes;
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
