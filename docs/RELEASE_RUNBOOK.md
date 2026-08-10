# Runbook de release — Receitas

Este documento transforma o plano de hardening em uma sequência operacional reproduzível. Ele não declara nenhum gate como aprovado por existir no repositório: cada comando precisa ser executado no ambiente indicado e seu resultado precisa ser registrado antes de promover uma release.

## 1. Regras que não podem ser quebradas

- O aplicativo continua sendo uma PWA React/TypeScript estática; não adicionar servidor próprio nem Cloudflare Pages Functions.
- O custo recorrente alvo permanece **US$ 0**. Alterações que exigem plano pago bloqueiam a release até nova decisão explícita.
- O browser recebe somente valores públicos `VITE_*`. `service_role`, secrets de bootstrap, senhas E2E e chaves privadas nunca entram no bundle.
- Supabase Storage continua privado e mídia é acessada somente pelo fluxo autenticado do produto.
- Signup público e login anônimo continuam desabilitados.
- O par continua sendo fechado; recovery administrativo não pode reabrir o fluxo normal de convite.
- Updates do PWA continuam explícitos (`registerType: 'prompt'`) e o Workbox não ganha runtime cache de dados privados.
- Produção nunca é usada para E2E destrutivo.

### Trava de projeto nesta sessão

O único projeto visível atualmente no conector Supabase é `fichario-staging` (`qhoyykgzscuekrttwihc`). **Ele pertence a outro produto e nunca deve receber migrations, functions, buckets ou dados de Receitas.**

Até um projeto inequivocamente pertencente a Receitas aparecer no ambiente conectado, provisioning e testes reais de Supabase permanecem pendentes.

## 2. Runtime esperado

```bash
node --version
# esperado: v24.18.0 conforme .node-version

corepack enable
pnpm --version
# projeto fixa pnpm@10.15.0

deno --version
# gate remoto atual usa Deno 2.8.1

pnpm install --frozen-lockfile
```

O frozen install continua bloqueado até `pnpm-lock.yaml` ser versionado.

Se checkout ou GitHub Actions forem necessários para executar estes gates remotamente, use o **repositório de toolchains**. Não adicione workflows de execução descartável ao repositório Receitas.

## 3. Gates antes de qualquer staging

Execute na branch/candidato exato de release:

```bash
pnpm test:release-scripts
pnpm verify:source
pnpm lint
pnpm typecheck
pnpm test:run
pnpm verify:edge
```

Esses gates cobrem, entre outros:

- custo zero e ausência de Pages Functions;
- signup fechado, senha mínima, Storage privado e JWT das Edge Functions;
- sequência contínua de migrations;
- schema `private` sem grants para browser roles;
- Workbox sem runtime cache privado;
- integration guards de restore/recovery;
- geração de headers com origens exatas e limite de tamanho do Cloudflare Pages;
- scanner de material privilegiado no artefato;
- testes + typecheck das Supabase Edge Functions em Deno.

Nenhum desses resultados deve ser inferido a partir de revisão estática: registre a execução real.

## 4. Build estático do Cloudflare Pages

O build precisa conhecer somente a configuração pública real do ambiente:

```bash
export VITE_SUPABASE_URL='https://<receitas-staging>.supabase.co'
export VITE_SUPABASE_ANON_KEY='<public-anon-key-do-staging>'
export VITE_POWERSYNC_URL='https://<receitas-staging>.powersync...'
export RELEASE_ENV='preview'
pnpm build:pages
```

`VITE_SUPABASE_ANON_KEY` é uma credencial pública destinada ao navegador e **não** deve ser confundida com `service_role`/secret key.

`build:pages` executa:

1. TypeScript + Vite;
2. geração de `dist/_headers` com CSP restrita às origens informadas;
3. scanner de secrets/arquivos sensíveis no `dist`;
4. auditoria do artefato (`manifest`, `robots`, `_redirects`, `_headers`, metadata de privacidade).

Para produção use `RELEASE_ENV=production`; somente nesse modo o gerador inclui HSTS.

Nunca faça commit de um `_headers` com endpoints concretos de staging/produção. Ele é artefato de build.

## 5. Provisionar Supabase staging de Receitas

Pré-condição: confirmar **por nome e Project Ref** que o projeto pertence a Receitas.

Ordem:

1. configurar Auth com signup/anônimo fechados e senha mínima compatível com `supabase/config.toml`;
2. aplicar migrations `0001` até a migration mais recente, sem pular/renumerar histórico;
3. confirmar bucket canônico `recipe-media` privado;
4. confirmar bucket `restore-staging` privado;
5. provisionar secrets server-only necessários às Edge Functions;
6. publicar `bootstrap`, `pair-invite`, `import-url`, `backup-restore` e `account-admin` com a política JWT declarada no source;
7. executar testes SQL/contratos e testes Deno contra esse staging;
8. criar somente a identidade/par de teste dedicado ao E2E.

`recipe_media` não é um alias: frontend, migration, políticas de Storage e restore devem continuar usando exatamente `recipe-media`.

Nunca copie dados pessoais de produção para staging.

### Gate específico do import por URL

O importador agora fixa cada conexão ao IP público previamente resolvido/validado e re-resolve/re-fixa cada redirect para mitigar DNS rebinding. O Deno gate prova tipos e comportamento unitário, mas o staging deve confirmar que o Supabase Edge Runtime implantado aceita o `Deno.createHttpClient` usado no transporte pinado antes de promoção.

## 6. Provisionar PowerSync staging

- criar projeto separado para Receitas staging;
- apontar exclusivamente para o Supabase staging confirmado acima;
- aplicar as sync rules versionadas do repositório;
- confirmar que um usuário recebe somente dados do próprio par;
- validar reconnect, fila local e conflito com duas sessões de teste;
- registrar a URL pública do PowerSync em `VITE_POWERSYNC_URL` do ambiente de staging.

## 7. Provisionar Cloudflare Pages staging

Configuração esperada:

- output: `dist`;
- build command: `pnpm build:pages`;
- Node 24.18.0;
- nenhuma Pages Function;
- somente `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_POWERSYNC_URL` e `RELEASE_ENV=preview` como configuração browser/release;
- preview HTTPS antes de qualquer promoção.

Depois do deploy, informe o origin exato:

```bash
export E2E_DEPLOYED_URL='https://<preview>.pages.dev'
pnpm verify:deployed
```

O gate consulta as respostas HTTP reais e confirma:

- CSP gerada e sem wildcards amplos de rede;
- valor de CSP dentro do limite do provedor;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- `X-Frame-Options: DENY`;
- `X-Robots-Tag: noindex, nofollow`;
- deep links retornam o shell SPA com status 200;
- `robots.txt` contém `Disallow: /`;
- HTML contém metadata `noindex,nofollow`.

`vite preview` **não** substitui esse gate porque não emula o processamento de `_headers` do Cloudflare Pages.

## 8. Aceitação em staging

Variáveis E2E devem apontar apenas para a identidade dedicada de staging:

```bash
export E2E_EMAIL='...'
export E2E_PASSWORD='...'
pnpm verify:release
```

A suíte de release inclui:

- shell e reload offline;
- criação de receita offline → reload → reconnect → confirmação em um contexto de browser novo;
- import;
- backup/restore;
- diagnósticos;
- superfícies de recovery.

O E2E de recuperação offline cria uma fixture com UUID e remove apenas essa fixture ao final.

Para o round-trip destrutivo de `replace_all`, o opt-in precisa ser deliberado:

```bash
export E2E_DESTRUCTIVE_RESTORE=1
```

Nunca habilite esse opt-in contra produção.

## 9. PWA e persistência local

O head atual contém e testa:

- `src/features/cooking/data/local-cooking-draft-store.ts`;
- `src/features/cooking/components/CookingMode.tsx`;
- `src/features/cooking/components/CookingWorkspace.tsx`.

O cooking draft ativo fica em `device_preferences` e existe teste que avança uma etapa, desmonta todo o workspace e monta novamente, retomando exatamente a etapa persistida.

Além disso:

- Workbox está com `runtimeCaching: []`;
- atualização é explícita via prompt;
- o E2E de offline recovery cobre persistência de uma mutação de receita no banco local através de reload completo e posterior chegada em um contexto limpo via sync.

O que ainda precisa de staging/deploy real é uma troca efetiva entre **duas versões do service worker** com estado pendente, não a existência do mecanismo local de persistência.

## 10. Drill de backup/restore

Antes da primeira produção e periodicamente quando o formato mudar, siga:

```text
docs/runbooks/backup-restore-drill.md
```

O drill deve provar merge, replace-all, safety backup, mídia e round-trip de recuperação usando staging dedicado. Nunca usar produção para esse exercício.

## 11. Promoção para produção

Só depois de staging completamente verde:

1. criar/confirmar projeto Supabase de produção separado;
2. aplicar a mesma sequência de migrations;
3. publicar as mesmas Edge Functions e secrets server-only;
4. criar PowerSync produção apontando apenas ao Supabase produção;
5. buildar Pages com endpoints públicos de produção e `RELEASE_ENV=production`;
6. executar smoke não destrutivo no domínio final;
7. executar `verify:deployed` no domínio final;
8. registrar SHA/tag da release e referências exatas de infraestrutura sem registrar secrets.

Não rode import SSRF/destructive restore/account recovery contra dados reais como “smoke”.

## 12. Rollback

Frontend:

- repromover o último artefato Pages conhecido como bom;
- não reapontar produção para staging.

Banco:

- migrations são forward-only; não apagar/regravar migrations já aplicadas;
- correções de schema entram como nova migration;
- antes de qualquer restore destrutivo, o produto exige o safety backup validado pelo servidor.

Storage/restore:

- não apagar manualmente objetos de restore/promovidos durante incidente sem confirmar referências de metadata/conflitos;
- usar o cleanup idempotente do fluxo já implementado.

Backend/sync:

- se o problema for pausa/desprovisionamento, usar os runbooks de Supabase/PowerSync em vez de resetar clientes;
- preservar filas locais e cooking draft antes de qualquer limpeza.

## 13. Evidência mínima por release

Registrar em `docs/RELEASE_STATUS.md` ou nota equivalente:

- commit SHA candidato;
- Node/pnpm/Deno usados;
- resultado real de `pnpm install --frozen-lockfile`;
- resultado real de `pnpm verify:release`;
- resultado real de `pnpm verify:deployed`;
- resultado de migrations/Deno/SQL staging;
- Project Refs de **Receitas** staging/produção (nunca secrets);
- URLs públicas staging/produção;
- resultado de headers/deep links/offline;
- qualquer gate pulado e o motivo.
