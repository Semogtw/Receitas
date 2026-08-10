# Release status — Receitas

Última atualização estrutural: 2026-08-10.

Branch de hardening: `feat/hardening-deploy-release`.

> Este arquivo separa **implementado no source** de **executado e comprovado**. A existência de um script/teste não conta como gate verde.

## Resumo

| Área | Estado | Observação |
| --- | --- | --- |
| Runtime/custo | Estruturalmente implementado | Node pinado; guard de custo zero escrito; não executado |
| Static Pages/security headers | Estruturalmente implementado | fallback, CSP generator, secret scan e artifact audit escritos; build não executado |
| Release E2E | Estruturalmente implementado | smoke autenticado + release suite escritos; não executados |
| PWA lifecycle | Parcial | update explícito e no runtime cache cobertos; cooking draft planejado não existe |
| Supabase staging Receitas | Bloqueado por provisioning | único projeto conectado é `fichario-staging`, que não pertence a Receitas |
| PowerSync staging Receitas | Pendente | projeto/endpoint de staging ainda não disponível nesta sessão |
| Cloudflare Pages staging | Pendente | deploy real não executado nesta sessão |
| Staging acceptance | Pendente | depende dos três serviços de Receitas corretamente provisionados |
| Produção | Pendente | proibido promover antes de staging verde |
| Clean-machine gate | Pendente | nenhum checkout/gate remoto foi executado |
| Pós-release/rollback | Documentado | runbook escrito; não exercitado em ambiente real |

## Trabalho estrutural concluído nesta branch

- `.node-version` fixa Node 24.18.0.
- `verify-zero-cost-config` impede flags de planos pagos/custo recorrente explícito e Pages Functions.
- `generate-pages-headers` cria CSP com origens HTTPS/WSS exatas de Supabase/PowerSync e headers de privacidade.
- `validate-build-secrets` rejeita markers/valores privileged, keys, `.env` e source maps no browser artifact.
- `release-artifact-audit` exige manifest, `robots.txt`, `_redirects`, `_headers`, noindex e no-referrer.
- `source-security-audit` trava signup, anonymous login, password floor, private Storage, JWT das Edge Functions e sequência de migrations.
- `pwa-source-audit` trava update explícito, `runtimeCaching: []`, fallback e ausência de source maps explícitos.
- `ui-integration-audit` impede restore/recovery implementados de voltarem a ficar inacessíveis na UI.
- `/auth/finish-replacement` foi recolocado fora do `AuthGate`.
- Configurações voltou a expor merge restore, replace-all e account recovery.
- estilos de cooking/media/account-admin voltaram a entrar no bundle principal.
- `supabase/config.toml` ganhou password floor 12 e `account-admin` com JWT obrigatório.
- `app-shell.spec.ts` agora autentica antes de testar o shell privado.
- `release-acceptance.spec.ts` cobre deep links, Settings, metadata de privacidade, service worker e callback público de replacement.
- `pnpm verify:release` compõe os gates escritos e a suíte E2E de release.

## Gap de cooking/update

O plano 04 define cooking-in-progress como device-local e referencia explicitamente:

- `src/features/cooking/data/cooking-draft-store.ts`
- `src/features/cooking/components/CookingMode.tsx`

Esses arquivos não existem no head atual. Portanto a release **não pode alegar** que um cooking draft ativo sobrevive a reload/update. O comportamento que existe e está estruturalmente protegido é:

- update do PWA por ação explícita do usuário;
- shell precacheado;
- ausência de Workbox runtime cache para dados privados;
- dados já gravados pela camada local-first permanecem responsabilidade do PowerSync/SQLite.

## Infraestrutura conectada nesta sessão

Supabase visível:

- `fichario-staging` — Project Ref `qhoyykgzscuekrttwihc`.

Esse projeto é de outro produto. Nenhuma migration/function/configuração de Receitas foi aplicada nele e isso deve permanecer assim.

Receitas staging/produção ainda precisam ser identificados/provisionados explicitamente.

## Gates ainda não executados

Nenhum destes gates deve ser descrito como verde até execução real:

```text
pnpm lint
pnpm typecheck
pnpm test:run
pnpm test:release-scripts
pnpm verify:source
pnpm build:pages
pnpm test:e2e:smoke
pnpm test:e2e:release
pnpm verify
pnpm verify:release
Deno tests das Edge Functions
SQL/pgTAP / migrations em Supabase real
PowerSync rules/reconnect/isolation em staging real
Cloudflare Pages headers/deep links/offline em deploy real
```

## Regra para execução remota

Se for necessário checkout do código ou GitHub Actions para executar gates, usar o repositório de **toolchains**, conforme a instrução do projeto. Não adicionar workflows de execução descartável ao repositório Receitas.
