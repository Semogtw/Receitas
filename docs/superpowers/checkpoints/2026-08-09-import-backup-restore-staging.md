# Checkpoint — import, backup completo e staging de restore

**Branch:** `feat/import-backup-diagnostics`  
**Data:** 2026-08-09  
**Status:** Tasks 1–5 do plano 06 avançadas estruturalmente; gates executáveis continuam pendentes no ambiente atual e não são tratados como verdes.

## Importação determinística

Implementado:

- parser Schema.org/JSON-LD por `JSON.parse`, sem execução de conteúdo remoto;
- suporte a `Recipe`, `@graph`, `HowToStep`/`HowToSection` e durações ISO;
- parser de texto colado com heurísticas determinísticas e preservação das linhas não entendidas;
- ingredientes só ganham estrutura quando quantidade/unidade podem ser reconhecidas de forma conservadora;
- importação por URL passa exclusivamente por Edge Function autenticada;
- texto colado permanece local;
- revisão editável é obrigatória antes do save canônico;
- link editado na revisão é revalidado antes da criação da receita;
- URL de imagem remota não é baixada/anexada automaticamente.

## Fetch seguro de URL

`import-url` implementa:

- JWT obrigatório e checagem de membership ativa;
- rate limit persistente em Postgres (`0016_import_url_rate_limit.sql`);
- HTTP/HTTPS apenas, sem credenciais embutidas;
- bloqueio explícito de localhost e classes privadas/reservadas IPv4/IPv6;
- resolução DNS por hop e rejeição se qualquer endereço resolvido for proibido;
- redirects manuais e revalidados;
- bloqueio de downgrade HTTPS -> HTTP;
- timeout, limite de redirects, limite de corpo e allowlist de content type;
- nenhum cookie/Authorization do browser é encaminhado ao site alvo;
- HTML remoto vira somente JSON-LD inerte e texto visível sanitizado.

Limitação conhecida/documentada: `fetch` padrão do runtime não oferece pinning público simples entre DNS validado e conexão TLS; o código reduz exposição revalidando cada destino/redirect, mas DNS rebinding continua sendo uma superfície a revisar quando houver API de conexão pinável compatível com Edge Runtime.

## Shared Edge helpers

Durante revisão estática foi encontrado um erro de compilação que os gates indisponíveis não haviam revelado: `import-url/index.ts` já usava `withCorsAndErrors` e `createServerClient`, mas os shared helpers não os exportavam.

Corrigido preservando compatibilidade:

- `createServerClient()` reutiliza o único admin client;
- `getRequestUserId()` aceita chamadas antiga e nova;
- `withCorsAndErrors()` centraliza OPTIONS/origin/CORS, 401 e erro interno sem expor detalhes.

## Backup completo v1

Novo formato `receitas-backup` v1 em ZIP:

- manifesto versionado;
- SHA-256 e byte count de cada entrada;
- JSON canônico/determinístico;
- structured data de receitas, categorias, histórico, planner, compras e conversões;
- metadata + binários originais de fotos;
- nenhum password/session/token/service-role/provider credential por campo;
- `data/pair.json` contém somente identidade de exportação do conjunto, não memberships/Auth.

O JSON legado existente em `src/features/backup` foi preservado apenas por compatibilidade; ele não é apresentado como equivalente ao backup completo.

## Gate de sincronização do backup

Um arquivo só pode ser chamado de completo quando:

- `mutation_outbox` do par está vazio;
- fila local de upload de mídia está vazia;
- snapshot é lido dentro de `PowerSyncDatabase.readTransaction()`;
- nenhum metadata de foto está em estado diferente de `uploaded`;
- as filas são checadas novamente depois do snapshot.

## ZIP e memória

- `@zip.js/zip.js` foi adicionado de forma pinada em `package.json` (`2.8.36`);
- imagens usam store/no-compression;
- saída é OPFS-first quando `navigator.storage.getDirectory()` existe;
- Blob fallback é limitado a 128 MiB de payload estimado;
- acima disso, navegador sem OPFS falha explicitamente em vez de tentar montar arquivo gigante em RAM.

Limitação ainda aberta: o serviço atualmente acumula os `Blob`s de mídia baixados antes da escrita do ZIP e calcula o SHA final por `file.arrayBuffer()`. O writer é OPFS-first, mas o caminho ainda pode ser melhorado para streaming/hash incremental real.

## Preflight local do restore

Antes de qualquer chamada remota:

- limite do arquivo ZIP;
- limite de quantidade de entradas, tamanho descompactado e ratio de compressão;
- rejeição de paths absolutos/traversal/backslash/drive/duplicados;
- rejeição de diretórios, arquivos criptografados e symlink-like entries;
- manifesto estrito e sem campos desconhecidos;
- todas as entradas devem ser declaradas e ter o byte count correto;
- SHA-256 de todo JSON e de toda mídia é recalculado;
- UTF-8 dos JSONs é estrito;
- referências cruzadas do domínio são verificadas;
- todas as rows permanecem no source pair do backup;
- cada `photo-metadata` precisa casar exatamente com `media/<photo-id>.<ext>` por MIME, bytes e SHA quando persistido.

Teste integrado prova que um ZIP corrompido falha antes de qualquer `create_job` remoto.

## Staging privado do restore

Migrations:

- `0017_restore_staging.sql` — jobs privados, lotes JSON, mídia staged, state machine e RPCs service-role;
- `0018_restore_staging_storage_path.sql` — normaliza object keys dentro do bucket privado.

Invariantes:

- schema `private`, sem grants para browser;
- bucket `restore-staging` privado, sem policy de cliente;
- job `uploading -> validating -> ready_to_commit -> committing -> completed`, com rejeição controlada;
- prazo padrão de 24 horas;
- cada lote JSON <= 1 MiB;
- cada lote repete hash/tamanho do arquivo canônico inteiro;
- final-preflight reagrupa lotes em ordem, reserializa o arquivo completo e recalcula SHA/tamanho;
- mídia sobe pelo token assinado para o namespace `<pair>/<job>/...` e só é registrada depois que a Edge Function baixa e verifica MIME/tamanho/SHA;
- `finalize_staging` exposto usa o preflight estrito independente do browser;
- nenhuma tabela canônica é mutada durante preflight/staging.

## Gates não executados

Continuam **não executados**, portanto não verdes:

- `pnpm install` / regeneração de `pnpm-lock.yaml`;
- `pnpm lint`;
- `pnpm typecheck`;
- Vitest;
- Playwright;
- `deno test` das Edge Functions;
- aplicação real das migrations 0016–0018;
- pgTAP/Supabase local;
- deploy/teste de Edge Functions num projeto Supabase real.

O ambiente atual não oferece os gates necessários sem checkout/runner externo. O repositório público de toolchains não será usado para imprimir logs de um repositório privado sem uma estratégia que evite vazamento de paths/erros privados.

## Próximo trabalho

- commit transacional `merge` do restore usando conflitos explícitos para divergência;
- promoção segura de mídia staged para `recipe-media`;
- `replace_all` condicionado a safety backup validado;
- cleanup de staging expirado;
- UI de restore;
- account administration e diagnostics sanitizados;
- E2E e hardening final quando os gates executáveis estiverem disponíveis.
