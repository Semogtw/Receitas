# Status do desenvolvimento

**Atualizado em:** 2026-08-11  
**Branch de trabalho:** `feat/hardening-deploy-release`  
**Fase atual:** plano 07 — hardening, deploy e release. Os planos funcionais anteriores estão integrados nesta linha; o trabalho atual é transformar a implementação em uma release reproduzível, testada e operável sem custo recorrente obrigatório.

> Para evidência detalhada de gates e bloqueios de release, `docs/RELEASE_STATUS.md` é o source of truth. Este arquivo existe para orientar a retomada do desenvolvimento, não para substituir o registro de evidências.

## Linha integrada

A implementação foi construída em branches dependentes e a branch atual contém a sequência funcional completa:

1. `feat/foundation-pwa` — foundation PWA;
2. `feat/backend-auth-data` — backend, autenticação e dados;
3. `feat/local-first-sync` — PowerSync local-first e conflitos;
4. `feat/recipes-cooking-media` — receitas, preparo e mídia;
5. `feat/planning-shopping-search` — planner, compras e busca local;
6. `feat/import-backup-diagnostics` — importação, backup/restore e diagnósticos;
7. `feat/hardening-deploy-release` — hardening/release, **branch atual**.

Não criar uma nova branch de plano sobre um head antigo. Novos trabalhos de release devem partir do head atual de `feat/hardening-deploy-release` até essa linha estar pronta para integração.

## Estado funcional

Estruturalmente implementado:

- PWA React/TypeScript/Vite mobile-first;
- autenticação privada para exatamente duas pessoas;
- banco e Storage pair-scoped com RLS/contratos de integridade;
- PowerSync local-first, outbox semântica, reconexão e conflitos explícitos;
- receitas, categorias, ingredientes, etapas e favoritos;
- modo de preparo, timers, avaliações, histórico e fotos;
- planner semanal e listas de compras;
- busca local e filtros;
- importação por arquivo/URL com revisão;
- backup completo, merge restore, replace-all com safety backup;
- lixeira/restore e diagnósticos;
- runbooks operacionais e hardening de Cloudflare Pages.

## Release hardening em andamento

Já existe cobertura escrita para os principais journeys de release, incluindo offline recovery, restore destrutivo, conflitos, mídia, planner/compras, acessibilidade/layout e validação do origin implantado.

Em 2026-08-11 foi fechado um gap explícito do plano 07:

- `PwaLifecycle` agora chama `updateServiceWorker(true)` somente após ação explícita do usuário;
- `tests/e2e/pwa-update.spec.ts` foi adicionado;
- o gate cria estado local offline, espera uma **build realmente nova no mesmo origin**, comprova mudança do `sw.js` por SHA-256, aceita o update e verifica que os dados locais persistem;
- o gate real exige `E2E_PWA_UPDATE=1`; sem esse opt-in ele pula e **não** pode ser declarado como verde;
- `release-command-audit.mjs` impede que o spec seja removido silenciosamente do grafo de release;
- o procedimento está em `tests/e2e/README.md`.

A troca real entre duas versões ainda depende de staging Cloudflare/Supabase/PowerSync e continua pendente até execução coordenada.

## Reprodutibilidade / lockfile

`pnpm-lock.yaml` continua sendo o principal bloqueio puramente reprodutível antes de um clean-machine gate fail-closed:

- o `Offline-Toolchains` gerou um lockfile determinístico para o manifesto atual da branch-base de hardening;
- o artifact criptografado foi recuperado e validado nesta sessão;
- SHA-256 observado do plaintext: `a20f2359e5eb93aced4660a7542ecc79a514a1573847ac0ee1e8e821f92e3e7a`;
- a tentativa de um handoff que gerasse **somente** `pnpm-lock.yaml`, comprovasse que era a única mudança e fizesse push com `--force-with-lease` chegou até o commit local, mas o `PRIVATE_REPOSITORIES_TOKEN` do toolchain é deliberadamente read-only e o push foi recusado com HTTP 403;
- não ampliar a permissão desse token apenas para contornar o bloqueio;
- até o lockfile estar versionado, `pnpm install --frozen-lockfile` não pode ser declarado verde.

Esse bloqueio não impede continuar melhorias de código/testes/documentação que não alterem dependências.

## Gates executáveis

Use `Semogtw/Offline-Toolchains` sempre que Actions ou checkout forem necessários. O toolchain deve continuar:

- fixando o SHA exato do `Receitas`;
- fazendo checkout sem persistir credenciais;
- não recebendo credenciais reais de Supabase/PowerSync/E2E para gates públicos;
- executando gates independentes mesmo quando um deles falha, para maximizar descoberta;
- sanitizando sumários/logs e descartando source/build/local DB ao final.

Nunca transformar um gate não executado, pulado ou bloqueado por ambiente em `PASS`.

## Infraestrutura ainda pendente

Antes de produção ainda faltam, no mínimo:

- versionar `pnpm-lock.yaml` e repetir instalação frozen;
- provisionar/configurar o Supabase **do Receitas** em staging e aplicar migrations/pgTAP/RLS/Edge Functions;
- provisionar PowerSync staging e provar isolamento/reconexão;
- implantar Cloudflare Pages staging e validar headers/deep links/offline no origin real;
- executar o gate coordenado de atualização PWA entre duas builds no mesmo origin;
- executar Playwright autenticado da release em browsers suportados;
- QA em Safari/iOS real para o que não é fielmente provado por emulação;
- drill de backup/restore e rollback em staging;
- executar/triagear o security review final, com high/critical validados bloqueando a release.

Produção não deve ser promovida antes desses gates de staging.

## Método de execução

- continuar a branch mais avançada, não recomeçar de branches intermediárias;
- commits e pushes frequentes;
- bloqueio ambiental é documentado e o próximo item resolvível por código é atacado;
- não instalar infraestrutura paga nem aceitar custo recorrente obrigatório;
- @Context7 para contratos atuais de bibliotecas quando necessário;
- toolchains para Actions/checkout;
- gates de browser/deploy só contam quando executados contra o ambiente adequado.

## Restrições permanentes

- custo recorrente obrigatório **US$ 0**;
- exatamente duas pessoas;
- local-first;
- sem perda silenciosa em conflitos;
- sem ImageGen no fluxo visual sem nova autorização explícita;
- decisões puramente técnicas podem ser fechadas autonomamente quando preservam produto, segurança/privacidade e custo zero;
- mudanças de UX aprovada, privacidade, modelo de custo ou escopo do produto voltam ao usuário.
