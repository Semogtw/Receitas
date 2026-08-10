# Checklist de release — Receitas

Última atualização: 2026-08-10.

Este documento mapeia os **21 critérios de aceite** da seção 31 de `docs/superpowers/specs/2026-08-07-receitas-design.md` para evidências reais. Estados possíveis:

- **Verificado** — existe execução atual suficiente para o escopo declarado;
- **Parcial** — código/testes existem, mas falta um gate de integração/deploy/dispositivo;
- **Pendente** — ainda não há evidência suficiente para release.

Um critério parcial não deve ser tratado como concluído na release final.

## Evidência base atual

No commit `0d747fe5591efb490d5c5cba5428c139c6cf6db9`, o runner dedicado do `Offline-Toolchains` executou com sucesso:

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

O job agregador permaneceu vermelho apenas porque `pnpm-lock.yaml` ainda não estava versionado e, portanto, o install foi de descoberta com `--no-frozen-lockfile`.

Depois desse SHA, novos commits adicionaram o teste de remount do cooking draft, runbooks e hardening de limite de headers. Esses commits precisam continuar passando no runner antes de promoção.

## Critérios de aceite

| # | Critério | Estado | Evidência atual | Gate ainda necessário |
| --- | --- | --- | --- | --- |
| 1 | Apenas as duas identidades autorizadas acessam dados | Parcial | migrations/RLS, pair capacity, invite/bootstrap e account-admin possuem testes de contrato/source | `supabase db reset` + SQL/RLS em ambiente isolado e tentativa real cross-pair/terceiro membro |
| 2 | PWA funciona como aplicação doméstica real em mobile | Pendente | manifest/PWA shell e browser matrix estão configurados | Playwright mobile/WebKit em staging + instalação/teste em iPhone real |
| 3 | Receitas podem ser criadas/editadas offline | Parcial | repositório local-first e mutações possuem unit/integration tests | E2E offline autenticado com reload e posterior sync |
| 4 | Sync posterior não perde alterações | Parcial | outbox semântica, retry/coalescing e connector são testados | dois clientes reais/staging com offline → reconnect → ACK |
| 5 | Conflitos incompatíveis preservam versões | Parcial | merge/conflict resolver e backend de conflitos possuem testes | concorrência real em dois clientes e resolução em staging |
| 6 | Fotos novas nunca são descartadas antes de cópia segura | Parcial | blob cache, upload queue, checksum e metadata têm testes; backup bloqueia mídia incompleta | interrupção/reload/upload real em browser/device e Storage staging |
| 7 | Histórico só nasce quando preparo é finalizado | Verificado em código/teste | cooking repository/finalization tests e fluxo `CookingWorkspace` | smoke de navegador ainda recomendado |
| 8 | Avaliações individuais permanecem independentes | Parcial | domínio/repository impõe ator por rating e possui testes | dois usuários reais sincronizando ratings no mesmo preparo |
| 9 | Porções/conversões não corrompem receita original | Verificado em código/teste | testes de scaling, rational amounts, conversion profiles e controles | QA visual do fluxo |
| 10 | Compras e planejador funcionam offline | Parcial | repositories/domain/UI possuem testes local-first | E2E offline + reconnect em staging |
| 11 | Busca e filtros funcionam localmente | Verificado em código/teste | índice/query local e filtros possuem testes; sem chamada remota necessária | smoke browser final |
| 12 | Backup completo pode ser restaurado | Parcial | formato ZIP, inspector, staging, merge e serviços de restore possuem testes | disaster-recovery drill em staging com mídia real |
| 13 | Restauração destrutiva possui backup de segurança anterior | Parcial | replace-all exige safety backup validado server-side; tests/E2E escritos | executar E2E destrutivo opt-in em staging e restaurar safety backup |
| 14 | Importação URL exige revisão e protege contra SSRF | Parcial forte | parsers/review + `safe-fetch` Deno tests passaram; DNS/redirect/downgrade/type/size são validados | E2E URL contra fixtures HTTP controladas em staging |
| 15 | UX não assume estética SaaS/template genérico | Pendente de QA | direção visual implementada em CSS/componentes | revisão renderizada desktop/mobile claro/escuro |
| 16 | Claro/escuro e acessibilidade básica funcionam | Parcial | semântica de componentes coberta por Testing Library; estilos de tema existem | teclado, contraste, reduced-motion e visual QA cross-browser |
| 17 | Erros/sync pendente são explicáveis e recuperáveis | Parcial forte | sync state, diagnostics sanitizados, upload retry e mensagens possuem testes | indisponibilidade real de staging + recovery runbook |
| 18 | Segredos não entram no frontend | Verificado para build sintético | source audit + secret scanner + artifact audit passaram em `build:pages` | repetir com env pública real antes do deploy |
| 19 | RLS protege todos os dados compartilhados | Parcial | migrations e SQL tests existem; source-security audit passa | executar SQL/pgTAP após reset de banco isolado |
| 20 | Deploy/serviços essenciais permanecem gratuitos | Parcial | guardrail `verify:cost`; stack Free e limites revalidados em docs oficiais em 2026-08-10 | conferir dashboards reais do Supabase/PowerSync/Cloudflare no provisioning |
| 21 | Testes cobrem invariantes críticas e fluxos reais | Parcial forte | lint, TS, Vitest, scripts, Deno e build estão verdes no runner | frozen install + E2E + SQL + staging + device/visual gates |

## Gates bloqueadores antes de produção

Produção não deve ser promovida enquanto qualquer item abaixo estiver pendente:

- [ ] versionar `pnpm-lock.yaml` e provar `pnpm install --frozen-lockfile`;
- [ ] repetir todos os gates não-E2E no head final;
- [ ] identificar/provisionar explicitamente o Supabase **do Receitas**;
- [ ] executar migrations do zero e todos os SQL/RLS tests em ambiente isolado;
- [ ] implantar e validar Edge Functions no staging correto;
- [ ] identificar/provisionar PowerSync staging e provar isolamento por par;
- [ ] implantar Cloudflare Pages preview e verificar `_headers`, `_redirects`, manifest, SW e deep links no origin real;
- [ ] executar Playwright smoke/release em Chromium + WebKit + perfis mobile configurados;
- [ ] executar offline → reload/update → reconnect com mutação pendente;
- [ ] executar concorrência real e resolução de conflito;
- [ ] executar importação URL contra fixtures controladas;
- [ ] executar merge restore e replace-all com safety backup em staging;
- [ ] executar QA de acessibilidade/tema/layout;
- [ ] executar gate de PWA instalada em iOS real quando houver dispositivo disponível;
- [ ] confirmar dashboards no Free tier;
- [ ] exercitar rollback do frontend e, quando aplicável, recuperação de backend/sync.

## Invariantes de segurança para a promoção

- `main` não recebe merge automático só porque os gates estáticos passaram.
- `fichario-staging` nunca é alvo do Receitas.
- nenhum service role/bootstrap secret entra no frontend, Pages ou artifact público.
- restore nunca cria membership/Auth por dados importados.
- replace-all nunca roda sem safety backup server-side validado contra o estado atual.
- pair capacity permanece dois usuários e fluxo administrativo não reabre convite normal.
- dados locais pendentes são preservados antes de qualquer limpeza/reinstalação.
- public runner não recebe credenciais de E2E/backend/deploy.

## Evidência operacional relacionada

- `docs/RELEASE_STATUS.md`
- `docs/RELEASE_RUNBOOK.md`
- `docs/DEPLOYMENT_OPERATIONS.md`
- `docs/runbooks/supabase-resume.md`
- `docs/runbooks/powersync-redeploy.md`
- `docs/runbooks/incident-data-preservation.md`

Este checklist deve ser atualizado com **IDs/SHA/resultados**, não apenas com a frase “testado”, conforme os gates restantes forem realmente executados.
