# Release status — Receitas

Última atualização: 2026-08-10.

Branch de hardening: `feat/hardening-deploy-release`.

> Este arquivo separa **implementado no source** de **executado e comprovado**. A existência de um script/teste não conta como gate verde.

## Resumo

| Área | Estado | Observação |
| --- | --- | --- |
| Runtime/custo | Verificado sem staging | Node/pnpm pinados; audits de custo/source e testes dos scripts passaram no runner público |
| Static Pages/artifact | Verificado localmente no runner | `build:pages`, CSP/header generation, secret scan e artifact audit passaram com endpoints públicos `.invalid`; origin real ainda não verificado |
| Lint/TypeScript/unit | Verificado | ESLint, `tsc` e Vitest passaram no SHA `0d747fe5591efb490d5c5cba5428c139c6cf6db9` |
| Edge Functions | Verificado estaticamente | `deno test supabase/functions` e `deno check supabase/functions/*/index.ts` passaram no mesmo SHA |
| PWA lifecycle/local state | Verificado em unit/integration | update explícito, sem runtime cache privado, cooking draft persiste e foi restaurado após remount completo |
| Release E2E | Estruturalmente implementado | smoke autenticado + release suite escritos; staging/browser deploy real ainda não executados |
| Lockfile | **Blocker de reprodutibilidade** | lockfile foi gerado/criptografado/recuperado e verificado localmente, mas ainda não está versionado no repo |
| Supabase staging Receitas | Bloqueado por provisioning | único projeto conectado nesta sessão é `fichario-staging`, que não pertence a Receitas |
| PowerSync staging Receitas | Pendente | projeto/endpoint de staging ainda não disponível nesta sessão |
| Cloudflare Pages staging | Pendente | deploy real não executado nesta sessão |
| Staging acceptance | Pendente | depende dos três serviços de Receitas corretamente provisionados |
| Produção | Pendente | proibido promover antes de staging verde |
| Clean-machine gate | Parcialmente verificado | checkout privado, Node, pnpm, install, lint/typecheck/unit/Deno/build funcionam no toolchain; frozen install aguarda lockfile |
| Pós-release/rollback | Documentado, não exercitado | runbooks existem; drill real depende de staging |

## Evidência de execução remota

O repositório público `Semogtw/Offline-Toolchains` possui um fluxo dedicado de Receitas com:

- request owner-only sem secrets;
- checkout do repositório privado com credencial não persistida;
- Node `24.18.0`;
- pnpm obtido do `packageManager` do próprio repo;
- Deno `2.8.1`;
- nenhum artifact contendo source/build privado;
- cleanup do checkout em `always()`;
- E2E/backend credentials deliberadamente excluídos.

No workflow run `31360151562`, apontado ao commit:

```text
0d747fe5591efb490d5c5cba5428c139c6cf6db9
```

passaram individualmente:

```text
pnpm test:release-scripts
pnpm verify:source
pnpm lint
pnpm typecheck
pnpm test:run
deno test supabase/functions
deno check supabase/functions/*/index.ts
pnpm build:pages
```

O step agregador falhou somente porque o checkout ainda não continha `pnpm-lock.yaml`. O install foi executado com resolução efêmera apenas para continuar descobrindo possíveis falhas; isso **não** conta como install reproduzível de release.

## Lockfile

Um handoff separado no toolchain:

1. fez checkout privado read-only;
2. executou `pnpm install --lockfile-only --no-frozen-lockfile`;
3. criptografou `pnpm-lock.yaml` antes de remover o checkout privado;
4. publicou somente ciphertext com retenção de 1 dia;
5. removeu plaintext e checkout antes do upload.

O artifact foi baixado e descriptografado neste ambiente. A descriptografia foi comparada byte a byte com o plaintext recuperado.

SHA-256 correto do `pnpm-lock.yaml` recuperado:

```text
9f1b695c9a41fab6c5089464bbe80afcb502f4dd892bb9bdfbf57ae3930998c1
```

O arquivo ainda precisa ser versionado em `feat/hardening-deploy-release` e então o CI deve ser reexecutado para provar `pnpm install --frozen-lockfile`.

## Trabalho estrutural concluído nesta branch

- `.node-version` fixa Node 24.18.0.
- `verify-zero-cost-config` impede flags de planos pagos/custo recorrente explícito e Pages Functions.
- `generate-pages-headers` cria CSP com origens HTTPS/WSS exatas de Supabase/PowerSync e headers de privacidade.
- `validate-build-secrets` rejeita markers/valores privileged, keys, `.env` e source maps no browser artifact.
- `release-artifact-audit` exige manifest, `robots.txt`, `_redirects`, `_headers`, noindex e política de referrer.
- `source-security-audit` trava signup, anonymous login, password floor, private Storage, JWT das Edge Functions e sequência de migrations.
- `pwa-source-audit` trava update explícito, `runtimeCaching: []`, fallback e ausência de source maps explícitos.
- `ui-integration-audit` impede restore/recovery implementados de voltarem a ficar inacessíveis na UI.
- `/auth/finish-replacement` está fora do `AuthGate`.
- Configurações expõe merge restore, replace-all e account recovery.
- estilos de cooking/media/account-admin entram no bundle principal.
- `supabase/config.toml` possui password floor 12 e `account-admin` com JWT obrigatório.
- `app-shell.spec.ts` autentica antes de testar o shell privado.
- `release-acceptance.spec.ts` cobre deep links, Settings, metadata de privacidade, service worker e callback público de replacement.
- `pnpm verify:release` compõe gates escritos e a suíte E2E de release.
- runbooks de Supabase, PowerSync e preservação de dados locais foram adicionados em `docs/runbooks/`.

## PWA e sobrevivência de estado local

A conclusão anterior de que os arquivos de cooking draft não existiam estava errada. O head atual contém:

- `src/features/cooking/data/local-cooking-draft-store.ts`;
- `src/features/cooking/components/CookingMode.tsx`;
- `src/features/cooking/components/CookingWorkspace.tsx`.

O contrato atualmente coberto é:

- draft ativo é armazenado em `device_preferences` sob `active_cooking_draft`;
- alterações de etapa são persistidas antes de substituir o estado em memória;
- sair do modo cozinhar não limpa o draft;
- ao montar o workspace novamente para a mesma receita, o draft persistido é restaurado;
- teste de integração avança a etapa, desmonta todo o workspace e monta novamente, confirmando a retomada na etapa persistida;
- Workbox não possui `runtimeCaching` de respostas privadas;
- update do PWA depende de ação explícita do usuário.

Isso prova a fronteira de persistência do cooking draft em código/teste. O gate de **troca real de versão do service worker em origin implantado** continua pendente para staging/device.

## Infraestrutura conectada nesta sessão

Supabase visível:

- `fichario-staging` — pertence a outro produto.

Nenhuma migration/function/configuração de Receitas foi aplicada nele e isso deve permanecer assim.

Receitas staging/produção ainda precisam ser identificados/provisionados explicitamente.

## Gates ainda não executados/completos

Não descrever como verdes até execução real:

```text
pnpm install --frozen-lockfile
pnpm test:e2e:smoke
pnpm test:e2e:release
pnpm verify
pnpm verify:release
SQL/pgTAP / migrations em Supabase real
PowerSync rules/reconnect/isolation em staging real
Cloudflare Pages headers/deep links/offline em deploy real
PWA update entre duas versões realmente implantadas
a11y/visual QA completa em browsers configurados
iOS PWA em dispositivo real
backup/restore disaster-recovery drill contra staging
rollback de frontend/backend em ambiente real
```

## Runbooks

- `docs/runbooks/supabase-resume.md`
- `docs/runbooks/powersync-redeploy.md`
- `docs/runbooks/incident-data-preservation.md`
- `docs/RELEASE_RUNBOOK.md`

As políticas de free tier registradas nesses documentos foram reconsultadas em fontes oficiais em 2026-08-10; devem ser revalidadas novamente antes de operação futura.

## Regra para execução remota

Se for necessário checkout do código ou GitHub Actions para executar gates, usar o repositório de **toolchains**, conforme a instrução do projeto. Não adicionar workflows de execução descartável ao repositório Receitas.
