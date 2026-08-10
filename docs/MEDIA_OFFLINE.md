# Mídia e disponibilidade offline

> Especificação normativa para fotos, cache local e disponibilidade offline. O objetivo é manter a experiência local-first sem transformar o dispositivo em uma cópia obrigatória de todos os originais em resolução completa.

## 1. Princípio central

Fotos e metadados possuem ciclos de sincronização diferentes.

A aplicação deve permanecer útil offline, mas não precisa manter todos os arquivos originais de toda a biblioteca no dispositivo o tempo inteiro.

## 2. Camadas de mídia

A arquitetura permite separar:

- conteúdo estruturado da receita, persistido no banco local-first;
- metadata de fotos, sincronizada como dados estruturados;
- bytes privados da imagem, mantidos no Cache Storage local e no Supabase Storage privado.

Derivados/miniaturas adicionais podem ser introduzidos depois, mas não substituem silenciosamente o original remoto usado por backup e recuperação.

## 3. Conteúdo mantido prioritariamente local

O cliente prioriza:

1. mídia recém-criada cuja fila de upload ainda não terminou;
2. mídia pertencente a receitas explicitamente marcadas para uso offline;
3. mídia já acessada e ainda presente no cache do navegador.

A plataforma ainda pode remover Cache Storage sob pressão de espaço; por isso o app nunca trata cache de mídia sincronizada como único backup.

## 4. Foto recém-tirada ou selecionada

Ao adicionar mídia:

1. o arquivo é preparado e salvo no cache local escopado ao `pair`;
2. um job durável é gravado em `device_preferences` (`media_upload_queue_v1`);
3. a interface consegue exibir o blob local antes da rede;
4. o upload é tentado quando online e retomado após reconexão;
5. só depois de Storage + publicação de metadata concluírem o job sai da fila.

Falha de upload mantém o job e a cópia local. Cancelamento explícito remove primeiro o job durável e só então tenta limpar o blob em best-effort, evitando deixar uma fila recuperável apontando para uma cópia já apagada.

## 5. Storage privado e retries

O bucket canônico é `recipe-media` e é privado.

Uploads normais do browser são insert-only. O cliente não possui UPDATE/DELETE físico no bucket. Um retry que encontra objeto existente só é aceito quando o conteúdo remoto corresponde ao blob preparado; objeto divergente não é sobrescrito.

Leitura remota usa autenticação e RLS do par.

## 6. “Disponibilizar offline” por receita

A feature está implementada como preferência **local ao dispositivo** em `device_preferences`.

Ao marcar uma receita, `OfflineRecipeMediaManager` calcula o conjunto atual de:

- fotos ativas da própria receita;
- fotos ativas de sessões de preparo não excluídas da mesma receita.

Os dados estruturados da receita já permanecem no banco local-first e não dependem de runtime caching privado do service worker.

O gerenciador baixa somente blobs ausentes. A UI representa:

- garantia desligada;
- conjunto completamente disponível;
- conjunto parcialmente disponível;
- erro de tentativa de download, mantendo a preferência para retry posterior.

A reconciliação ocorre:

- ao abrir/montar a superfície quando online;
- quando o banco local recebe alterações, incluindo sync de nova metadata;
- no evento `online` após reconexão;
- manualmente pelo botão de retry.

Desmarcar remove apenas a preferência; não deleta conteúdo remoto e não executa limpeza agressiva do cache.

## 7. Isolamento entre sessões

O cache de bytes privados é indexado por `pairId + mediaId`. Um runtime de outro par não obtém o blob apenas por conhecer/reutilizar o mesmo `mediaId`.

A compatibilidade com versões antigas, que usavam apenas `mediaId`, é restrita a uploads pendentes: um blob legado só pode ser reclamado quando existe um job durável cujo `pairId` coincide com o runtime atual. Nessa leitura, o blob é migrado para a chave escopada e a chave antiga é removida.

Leituras normais de mídia sincronizada **nunca** usam fallback legado.

O banco PowerSync local também é separado por `userId + pairId`, portanto fila, outbox e preferências de uma sessão não são montadas como banco ativo de outra identidade/escopo.

## 8. Logout e preservação local

Logout não é fronteira de destruição dos dados locais.

Antes de encerrar a sessão, a política local inspeciona:

- `mutation_outbox`;
- `media_upload_queue_v1`.

Fila de mídia malformada é tratada de maneira fail-safe como dado a preservar. Isso evita que erro de parsing transforme uma cópia possivelmente única em estado “seguro para limpar”.

A nova sessão só recebe runtime/cache do seu próprio `pairId`. Bytes antigos podem continuar fisicamente armazenados até eviction/limpeza, mas não são resolvidos pela interface de outro par.

## 9. Limites da retenção

“Disponibilizar offline” significa que o aplicativo tenta manter todo o conjunto conhecido no cache e detecta quando ele deixa de estar completo. Não significa que o sistema operacional garanta retenção eterna.

Se o navegador remover um blob:

- metadata e dados estruturados continuam existindo;
- a inspeção retorna estado parcial;
- quando online, o reconciliador pode baixar novamente o conteúdo autorizado.

## 10. Exclusão e cache

Remover cache não é excluir foto.

Soft delete/lixeira controla visibilidade funcional. Hard-delete usa a Edge Function `permanent-delete`, que deriva o par no servidor e coordena metadata com a fila privada `media_delete_queue`; falha de remoção no Storage fica retryável sem devolver DELETE físico ao browser.

Um blob local órfão sem metadata/job não reaparece na UI apenas por existir fisicamente no Cache Storage.

## 11. Backup

Backup completo não depende de a mídia estar no cache local. Originais ausentes localmente são obtidos de forma autorizada do Storage privado ou a exportação falha explicitamente; não há substituição silenciosa por miniatura.

## 12. Testes e gates

A implementação possui cobertura de unidade/componente para:

- persistência da preferência device-local;
- download apenas do conjunto ausente;
- estado parcial quando download falha;
- reconciliação de mídia nova após alteração do banco;
- retry após reconexão;
- isolamento de cache entre pares;
- migração legada somente por job do par correto;
- rejeição de queue/cancelamento cross-pair;
- preservação da fila real no logout.

A suíte E2E de release inclui jornada de mídia offline → reload → reconnect → segundo contexto de navegador. Esse E2E continua **pendente de execução contra staging real**; a existência do teste não é registrada como resultado verde até isso acontecer.

## 13. Relação com outros documentos

- Política detalhada de Storage/ciclo de vida: `docs/MEDIA_STORAGE.md`.
- Arquitetura geral: `docs/ARCHITECTURE.md`.
- Produto e fotos: `docs/PRODUCT.md`.
- UX de fotos e estados de sincronização: `docs/UX.md`.
- Política de sincronização: `docs/SYNC.md`.
- Backup e restauração: `docs/BACKUP_RESTORE.md`.
