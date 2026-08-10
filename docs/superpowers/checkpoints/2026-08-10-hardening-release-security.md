# Checkpoint — hardening de release e segurança

Data: 2026-08-10  
Branch: `feat/hardening-deploy-release`

Este checkpoint registra apenas evidência que realmente existia durante a execução. Mudanças posteriores ao último SHA validado continuam explicitamente pendentes de novo run, mesmo que tenham testes escritos.

## 1. Gates executáveis já comprovados

O `Offline-Toolchains` executou o Receitas em runner público com checkout privado read-only, sem artifact de source/build e sem credenciais remotas de staging.

Runs importantes:

- `31360151562` — frontend/release scripts/source/lint/TS/Vitest/Deno/build verdes; agregado vermelho somente por lockfile ausente;
- `31360628868` — repetiu os gates e validou limite de header Pages;
- `31361097560` — validou o pinning SSRF em Deno;
- `31362874464` — primeiro gate autoritativo com replay das migrations + pgTAP/contratos SQL; tudo verde exceto lockfile;
- `31363887761` — validou purge completo do grafo de receita e enfileiramento de mídia;
- `31364615029` — validou integração inicial de disponibilidade offline/mídia;
- `31364955791` — validou também os guards de integração de receita/cozinha/mídia.

No momento deste checkpoint, commits posteriores adicionaram lixeira integrada, retry explícito de cleanup remoto e reconciliação automática de mídia offline. Eles possuem testes escritos, mas devem receber novo run exato antes de serem promovidos de “implementados” para “verificados”.

## 2. Supabase local agora é gate real

O workflow `Run Receitas CI` no `Offline-Toolchains` passou a executar:

1. `supabase start`;
2. `supabase db reset --local --no-seed`;
3. todos os arquivos pgTAP via `supabase test db --local`;
4. contratos SQL `DO ... RAISE` via `psql -v ON_ERROR_STOP=1`;
5. `supabase stop --no-backup` em cleanup.

Isso prova replay do histórico de migrations e invariantes RLS/Storage/RPC sem tocar staging remoto.

O gate foi corrigido para não tratar pgTAP como simples SQL com exit code 0: arquivos com `select plan(...)` usam o executor pgTAP do Supabase, tornando `not ok` bloqueante.

## 3. SSRF / importação URL

Finding fechado:

- antes: DNS era validado, mas `fetch(hostname)` podia fazer uma segunda resolução e abrir janela TOCTOU para DNS rebinding;
- agora: cada request usa `Deno.createHttpClient` apontando o transporte TCP para um IP público previamente resolvido/validado;
- URL/hostname original continua sendo usado pelo request para Host/TLS;
- redirects são manuais, revalidados, re-resolvidos e recebem novo pin;
- downgrade HTTPS→HTTP permanece bloqueado;
- todos os A/AAAA precisam ser públicos.

Testes Deno e typecheck passaram em runner real.

Ainda é obrigatório confirmar em staging que o Supabase Edge Runtime implantado aceita o transporte pinado antes de produção.

## 4. Schema privado / least privilege

Migration `0030_private_account_admin_least_privilege.sql`:

- reforça `private` sem `USAGE` para `PUBLIC`, `anon` e `authenticated`;
- remove `EXECUTE` direto de todas as funções privadas existentes;
- altera default privileges do schema para que novas funções não nasçam executáveis por `PUBLIC`.

O source audit também rejeita migrations futuras que concedam `USAGE` no schema privado ou `EXECUTE/ALL` em `private.*` para browser roles.

Contratos SQL de account-admin e restore verificam grants dos entrypoints service-only.

## 5. Storage de mídia

O identificador canônico é **`recipe-media`**.

Foi corrigida uma divergência em `supabase/config.toml`, que usava `recipe_media`. O source audit agora cruza:

- frontend;
- migration de Storage;
- Edge restore;
- `config.toml`.

Qualquer retorno do typo com underscore falha o gate.

### Upload imutável

A migration `0031_media_storage_insert_only.sql` remove UPDATE/DELETE físico do browser.

O cliente agora:

- usa `upsert:false`;
- em retry, aceita objeto já existente somente quando tamanho/MIME conhecido/bytes são idênticos;
- nunca recebe permissão para sobrescrever objeto privado divergente.

O pgTAP autoritativo validou a política.

## 6. Hard-delete e limpeza remota

O RPC histórico `permanently_delete_entity(text, uuid, uuid)` não coordena Storage e deixou de ser browser-callable.

A migration `0032_media_permanent_delete_queue.sql` introduz:

- `private.media_delete_queue`;
- `permanently_delete_entity_server` service-only;
- RPCs service-only para leitura/complete/failure da fila;
- enqueue do `storage_path` na mesma transação que remove metadata;
- purge explícito de dependências para receita e sessão de preparo;
- cleanup de joins/dependências para categorias/listas/períodos de refeição.

Para receita, o contrato SQL cria uma fixture com:

- receita;
- ingrediente;
- etapa;
- foto;
- sessão;
- foto da sessão;
- rating;
- categoria/join;
- planner;
- import.

O run `31363887761` comprovou que o grafo dependente é removido, a categoria compartilhada permanece e as duas fotos entram na fila privada.

A Edge `permanent-delete`:

- valida JWT;
- deriva `pairId` da membership server-side;
- ignora `pairId` malicioso do browser;
- remove objetos com `service_role`;
- mantém falhas retryáveis na fila;
- não expõe paths privados ao cliente.

Commits mais recentes adicionaram uma ação explícita de retry da fila e o `TrashPanel`; aguardam o próximo run completo depois deste checkpoint.

## 7. UI que estava implementada mas inalcançável

Foram encontrados e corrigidos casos reais de feature “presente no source, ausente na aplicação”:

- completion de replacement fora do `AuthGate`;
- restore merge/replace e account recovery em Configurações;
- estilos cooking/media/account-admin;
- `RecipeDetail` agora expõe `Cozinhar agora`;
- `RecipePhotosPanel` aparece no detalhe da receita;
- `CookingSessionPhotosPanel` aparece após finalizar preparo;
- um `MediaRuntime` único é compartilhado pela rota.

O `ui-integration-audit` transforma essas integrações em invariantes estáticas.

## 8. Disponibilidade offline por receita

A implementação atual usa `device_preferences`, portanto é local ao dispositivo e não sincroniza a preferência entre o par.

`OfflineRecipeMediaManager`:

- reúne fotos da receita e fotos do histórico de preparos;
- verifica quais blobs já existem no cache local;
- baixa somente os ausentes pelo fluxo autenticado;
- mantém estado `available`/`partial`;
- não desmarca a preferência quando download falha;
- commits mais recentes adicionam `reconcile()` para puxar novas fotos após sync/reconexão sem regravar a preferência.

`OfflineRecipeAvailability` foi integrado ao detalhe da receita.

O cache é separado do runtime cache do Workbox; `runtimeCaching: []` continua sendo invariante.

## 9. E2Es escritos, ainda não executados em staging

Além dos E2Es de plano 06 e release, foram adicionados:

- `offline-recovery.spec.ts` — receita criada offline sobrevive reload e chega a browser limpo depois do reconnect;
- `deployed-security.spec.ts` — headers/deep links/robots no origin HTTPS real;
- `recipes.spec.ts` — lifecycle UI create/reload/edit/trash;
- `cooking.spec.ts` — entrada no modo cozinhar e registro de preparo;
- `media.spec.ts` — foto de fixture adicionada offline, reload local, reconnect e confirmação em contexto limpo.

Esses arquivos são **gates escritos**, não evidência de staging verde.

## 10. Blocker de reprodutibilidade

`pnpm-lock.yaml` ainda não está versionado.

Já foi gerado com segurança no runner e transferido somente de forma criptografada, mas o conector de escrita do GitHub não aceita arquivo local como payload e não foi concedido write token ao checkout público.

Portanto:

- gates individuais podem ficar verdes usando resolução efêmera para descobrir erros adicionais;
- o agregador permanece vermelho deliberadamente;
- `pnpm install --frozen-lockfile` **não** deve ser alegado como aprovado.

Não ampliar `PRIVATE_REPOSITORIES_TOKEN`: ele permanece Contents: Read-only por desenho.

## 11. Infraestrutura externa ainda pendente

- Supabase staging de **Receitas** não está conectado nesta sessão;
- `fichario-staging` é de outro produto e não foi tocado;
- PowerSync staging não está provisionado/conectado;
- Cloudflare Pages preview real não foi executado;
- E2E autenticado/destrutivo não foi executado;
- troca real entre duas versões de service worker não foi exercitada;
- iOS PWA em dispositivo físico continua gate externo.

## 12. Próxima sequência

1. validar o head atual completo no toolchain;
2. corrigir qualquer erro das integrações Trash/offline reconcile;
3. atualizar `MEDIA_STORAGE.md`, `RELEASE_STATUS.md`, `TESTING.md` e checklist com o novo run;
4. incluir os novos E2Es de plano 04 na suíte final de release;
5. continuar revisão de superfícies de mídia/trash/recovery;
6. quando staging Receitas existir, executar Edge deployment, PowerSync, E2E e disaster-recovery drill.
