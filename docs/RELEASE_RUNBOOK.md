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
# esperado: v24.18.0 conforme .node-version, ou Node 24 compatível com engines

corepack enable
pnpm --version
# projeto fixa pnpm@10.15.0

pnpm install --frozen-lockfile
```

Se checkout ou GitHub Actions forem necessários para executar estes gates remotamente, use o **repositório de toolchains**. Não adicione workflows de execução descartável ao repositório Receitas.

## 3. Gates locais antes de qualquer staging

Execute na branch/candidato exato de release:

```bash
pnpm test:release-scripts
pnpm verify:source
pnpm lint
pnpm typecheck
pnpm test:run
```

Esses gates cobrem, entre outros:

- custo zero e ausência de Pages Functions;
- signup fechado, senha mínima, Storage privado e JWT das Edge Functions;
- sequência contínua de migrations;
- Workbox sem runtime cache privado;
- integration guards de restore/recovery;
- geração de headers com origens exatas;
- scanner de material privilegiado no artefato.

Nenhum desses resultados deve ser inferido a partir de revisão estática: registre a execução real.

## 4. Build estático do Cloudflare Pages

O build precisa conhecer somente os endpoints públicos reais do ambiente:

```bash
export VITE_SUPABASE_URL='https://<receitas-staging>.supabase.co'
export VITE_POWERSYNC_URL='https://<receitas-staging>.powersync...'
export RELEASE_ENV='preview'
pnpm build:pages
```

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
3. confirmar bucket `recipe-media` privado;
4. confirmar bucket privado de restore staging quando criado pelas migrations;
5. provisionar secrets server-only necessários às Edge Functions;
6. publicar `bootstrap`, `pair-invite`, `import-url`, `backup-restore` e `account-admin` com a política JWT declarada no source;
7. executar testes SQL/pgTAP e testes Deno contra esse staging;
8. criar somente a identidade/par de teste dedicado ao E2E.

Nunca copie dados pessoais de produção para staging.

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
- Node 24;
- nenhuma Pages Function;
- somente `VITE_SUPABASE_URL`, `VITE_POWERSYNC_URL` e `RELEASE_ENV=preview` como configuração browser/release;
- preview HTTPS antes de qualquer promoção.

Depois do deploy confirme na resposta HTTP:

- CSP gerada;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- `X-Frame-Options: DENY`;
- `X-Robots-Tag: noindex, nofollow`;
- deep links retornam `index.html` com status 200;
- `robots.txt` contém `Disallow: /`.

## 8. Aceitação em staging

Variáveis E2E devem apontar apenas para a identidade dedicada de staging:

```bash
export E2E_EMAIL='...'
export E2E_PASSWORD='...'
pnpm verify:release
```

A suíte de release inclui shell/offline, import, backup/restore, diagnósticos e superfícies de recovery.

Para o round-trip destrutivo de `replace_all`, o opt-in precisa ser deliberado:

```bash
export E2E_DESTRUCTIVE_RESTORE=1
```

Nunca habilite esse opt-in contra produção.

## 9. Gap conhecido antes de declarar Task 4 completo

O plano de receitas/cozinha descreve `src/features/cooking/data/cooking-draft-store.ts` e `src/features/cooking/components/CookingMode.tsx` como mecanismo de cooking-in-progress device-local. Esses arquivos **não existem no head atual**.

Consequências:

- é correto afirmar que o PWA exige update explícito e não runtime-cacheia dados privados;
- é correto testar que dados já persistidos no banco local sobrevivem a reload;
- **não** é correto afirmar que um draft ativo de cozinha sobrevive a update/reload, porque essa feature ainda não foi implementada.

Esse gap deve ser resolvido no plano de cooking ou explicitamente retirado do escopo da primeira release antes de marcar a aceitação correspondente como verde.

## 10. Promoção para produção

Só depois de staging completamente verde:

1. criar/confirmar projeto Supabase de produção separado;
2. aplicar a mesma sequência de migrations;
3. publicar as mesmas Edge Functions e secrets server-only;
4. criar PowerSync produção apontando apenas ao Supabase produção;
5. buildar Pages com endpoints públicos de produção e `RELEASE_ENV=production`;
6. executar smoke não destrutivo no domínio final;
7. conferir headers e service worker no domínio final;
8. registrar SHA/tag da release e referências exatas de infraestrutura sem registrar secrets.

Não rode import SSRF/destructive restore/account recovery contra dados reais como “smoke”.

## 11. Rollback

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

## 12. Evidência mínima por release

Registrar em `docs/RELEASE_STATUS.md` ou nota equivalente:

- commit SHA candidato;
- Node/pnpm usados;
- resultado real de `pnpm verify:release`;
- resultado de migrations/Deno/SQL staging;
- Project Refs de **Receitas** staging/produção (nunca secrets);
- URLs públicas staging/produção;
- resultado de headers/deep links/offline;
- qualquer gate pulado e o motivo.
