# Mídia, Cache Local e Disponibilidade Offline

> Especificação normativa para fotos de receitas e de preparos. O objetivo é equilibrar uso offline real, consumo de armazenamento no dispositivo e preservação segura dos originais.

## 1. Princípio central

Fotos são conteúdo persistente do produto, mas **nem todo original precisa permanecer baixado em todos os dispositivos o tempo inteiro**.

A política aprovada separa:

- metadados e conteúdo estruturado, que permanecem local-first;
- representações leves de mídia, mantidas localmente com prioridade;
- originais em resolução completa, armazenados de forma canônica no Storage privado e baixados sob demanda;
- mídia explicitamente marcada para disponibilidade offline, que recebe prioridade de retenção local.

## 2. Originais e derivados

Para cada foto, o sistema pode manter representações distintas:

- original em resolução completa;
- versão otimizada para visualização comum;
- miniatura para listas, histórico e galerias compactas.

O original remoto não deve ser substituído silenciosamente por uma miniatura ou derivado de menor qualidade.

Metadados devem permitir identificar qual arquivo representa o original e quais são derivados regeneráveis.

## 3. Prioridades de cache local

O dispositivo deve priorizar a retenção local de:

1. fotos recém-criadas cujo upload ainda não terminou;
2. mídias explicitamente marcadas como necessárias offline;
3. capas de receitas;
4. miniaturas usadas em listas e histórico;
5. fotos visualizadas recentemente;
6. derivados de visualização comuns.

Originais completos que não estejam explicitamente marcados para uso offline podem ser removidos do cache local quando necessário, desde que uma cópia remota válida e autorizada esteja confirmada.

A remoção de cache **não é exclusão da foto do produto**.

## 4. Foto recém-tirada ou selecionada

Ao adicionar uma foto:

1. o arquivo recebe identidade estável e referência local imediata;
2. a interface pode exibi-lo sem esperar upload;
3. o registro da receita/preparo pode ser salvo offline;
4. o arquivo entra na fila local de upload;
5. enquanto o upload não for confirmado, a cópia local é considerada necessária e não deve ser removida pela política normal de limpeza do app;
6. quando online, o original é enviado ao Storage privado;
7. após confirmação de integridade e vínculo remoto, a mídia passa a obedecer à política normal de cache.

Falha de upload não deve apagar a única cópia conhecida pelo aplicativo.

### Upload remoto imutável

O bucket canônico é `recipe-media`.

O cliente não possui permissão de `UPDATE`/`DELETE` em `storage.objects` desse bucket. Upload normal é **insert-only** (`upsert: false`). Isso impede que um retry ou cliente modificado sobrescreva silenciosamente um objeto privado que já existe no mesmo path.

Como uma resposta de upload pode se perder depois que o Storage já aceitou o objeto, o retry é idempotente da seguinte forma:

1. tenta `INSERT` no path estável;
2. se o upload falhar, baixa o objeto já existente pelo fluxo autenticado;
3. só considera o retry concluído quando tamanho, MIME conhecido e bytes forem idênticos ao blob preparado localmente;
4. conteúdo divergente mantém a falha em vez de receber overwrite.

A migration `0031_media_storage_insert_only.sql` consolida essa política e remove as políticas históricas de UPDATE/DELETE do browser.

## 5. “Disponibilizar offline” por receita

Cada receita pode ser marcada, por dispositivo, como **Disponível offline**.

Ao ativar essa opção, o aplicativo tenta manter localmente:

- os dados estruturados da receita, já cobertos pelo banco PowerSync local-first;
- todas as fotos ativas da galeria permanente da receita;
- todas as fotos ativas dos preparos não excluídos associados à receita.

A preferência fica em `device_preferences` e é **local ao dispositivo**. Ela não é sincronizada obrigatoriamente entre os dois membros.

O gerenciador `OfflineRecipeMediaManager` calcula o conjunto diretamente do banco local. Para cada mídia ausente do cache, usa o `MediaRuntime` autenticado para baixar do Storage privado. O componente `OfflineRecipeAvailability`:

- mostra estado sem garantia quando a preferência está desligada;
- mostra disponível quando todo o conjunto conhecido está no cache;
- mostra parcial quando há arquivos conhecidos ausentes;
- permite retry manual;
- reconcilia automaticamente após alterações locais/sincronizadas e no evento de reconexão `online`;
- mantém a preferência quando algum download falha, para que uma tentativa posterior possa completar o conjunto.

Desativar a opção remove apenas a garantia/preferência local; não apaga metadata nem objetos remotos e não executa limpeza agressiva do cache.

### Limite da garantia

“Disponível offline” é uma garantia **best-effort do aplicativo**, não uma promessa de retenção absoluta do sistema operacional. Cache Storage ainda pode ser removido pelo navegador/plataforma sob pressão de armazenamento. Se isso acontecer, a inspeção volta a reportar estado parcial e o conteúdo sincronizado pode ser recuperado novamente quando houver rede.

Essa implementação está coberta por testes unitários/componentes e integra a suíte E2E de release escrita. O comportamento contra Storage/PowerSync reais continua dependendo do gate de staging antes da release final.

## 6. Acesso sem internet

Sem conexão:

- mídias já presentes no cache escopado ao par continuam abrindo normalmente;
- receitas marcadas para offline usam o máximo de conteúdo previamente baixado;
- uma foto que exista apenas no remoto mostra indisponibilidade temporária em vez de ser tratada como perdida;
- a ausência do original local não impede acesso aos dados estruturados da receita, que permanecem no banco local-first;
- reconciliação de downloads pendentes é retomada quando o navegador volta ao estado online.

## 7. Storage remoto e isolamento local

Os originais sincronizados ficam em **Supabase Storage privado**, no bucket `recipe-media`.

Regras remotas:

- não usar bucket público para fotos pessoais;
- leitura respeita membership ativa do `pair` presente no path;
- browser pode inserir apenas paths estruturados do próprio par;
- browser não pode atualizar nem apagar fisicamente objetos existentes;
- caminhos/objetos não substituem RLS ou validações de autorização;
- URLs de acesso temporário não devem ser tratadas como identificadores permanentes do arquivo;
- registros do banco guardam identidade estável da mídia e referência suficiente para resolver o objeto remoto autorizado.

`supabase/config.toml`, migrations, frontend e restore devem continuar usando exatamente `recipe-media`; `recipe_media` não é alias válido.

### Cache local por par

O Cache Storage de bytes privados é separado por `pairId + mediaId`. Um mesmo `mediaId` solicitado sob outro par é cache miss, ainda que exista fisicamente no mesmo origin.

Versões antigas usavam chave somente por `mediaId`. Para não perder a única cópia de um upload pendente durante upgrade, existe uma compatibilidade estrita: **somente um job durável da fila cujo `pairId` corresponde ao runtime ativo** pode ler uma chave legada; ao fazê-lo, o blob é migrado para a chave escopada e a chave antiga é removida. Leituras normais de mídia sincronizada nunca usam fallback legado.

O `MediaRuntime` também é construído com o par ativo, rejeita `queuePhoto` cross-pair e centraliza previews/cancelamento de uploads pendentes. Os arquivos PowerSync já são separados por `userId + pairId`, portanto a fila local do usuário anterior não é reutilizada por uma sessão com outro escopo.

No logout, a política local consulta a `mutation_outbox` e a fila real `media_upload_queue_v1`. Uma fila malformada é tratada de forma conservadora como dado local a preservar. Logout não é usado como fronteira de limpeza destrutiva.

## 8. Integridade e ciclo de vida

Uma foto não deve ser considerada remotamente segura apenas porque uma requisição de upload foi iniciada.

Antes de liberar a única cópia local para limpeza, o sistema deve possuir evidência suficiente de que:

- o upload concluiu;
- o objeto remoto corresponde ao registro esperado;
- o vínculo entre mídia, receita/preparo e `pair` está persistido;
- não existe erro pendente que deixe o arquivo órfão.

Arquivos órfãos remotos devem ser tratados por rotina segura de reconciliação, nunca por exclusão agressiva baseada apenas em idade.

Cancelar explicitamente um upload remove primeiro o job durável. A limpeza do blob local ocorre depois, em best-effort; isso evita o estado pior em que uma falha de banco deixaria um job persistente apontando para uma única cópia já apagada.

## 9. Exclusão e lixeira

Excluir uma foto do produto é diferente de removê-la do cache.

- limpeza de cache só remove cópia local regenerável;
- exclusão funcional usa o mesmo modelo de soft delete/lixeira aprovado para outras entidades relevantes;
- exclusão definitiva deve remover metadados e objeto remoto somente após validações apropriadas;
- uma mídia marcada como excluída não deve reaparecer apenas porque ainda existe um arquivo em cache.

### Hard-delete coordenado pelo servidor

A exclusão definitiva não usa mais um RPC browser-callable que apaga apenas metadata.

O fluxo atual é:

1. o cliente verifica que a row está na lixeira e não possui mutação local pendente;
2. chama a Edge Function `permanent-delete` enviando somente `entityType` + `entityId`;
3. a Edge valida o JWT e deriva o par ativo no servidor; `pairId` enviado pelo navegador não é autoridade;
4. `permanently_delete_entity_server` valida membership e registra paths de mídia em `private.media_delete_queue` na mesma transação que remove os dados canônicos;
5. a Edge tenta remover os objetos da fila usando `service_role` no bucket privado;
6. sucesso remove a entrada da fila; falha incrementa tentativa/erro técnico e mantém o path retryável.

A antiga `permanently_delete_entity(text, uuid, uuid)` é mantida apenas por compatibilidade de migration, mas perde `EXECUTE` de `anon/authenticated` em `0032_media_permanent_delete_queue.sql`.

Essa fila impede que falha do Storage obrigue o produto a dar DELETE físico ao browser ou perca a informação de qual objeto ficou órfão. O processamento operacional de uma fila que permaneça falhando ainda precisa ser exercitado no staging antes da release final.

## 10. Backup

O backup completo deve incluir os originais das mídias, independentemente de estarem ou não presentes no cache do dispositivo que iniciou a exportação.

Se algum original necessário ao backup estiver apenas no Storage remoto, o processo de backup deve obtê-lo de forma autorizada ou falhar de maneira explícita; não deve substituir silenciosamente o original por miniatura.

As regras completas de backup/restauração estão em `docs/BACKUP_RESTORE.md`.

## 11. Estado local e sincronização

A fila de mídia é separada da sincronização dos dados estruturados.

Estados operacionais ficam principalmente na fila local `media_upload_queue_v1` e na presença/ausência do blob no cache, não em uma enumeração remota que tente representar toda a máquina de estados do dispositivo.

Estados úteis para a interface incluem:

- aguardando upload;
- enviando;
- falha de upload;
- sincronizado/remoto;
- presente no cache;
- ausente do cache;
- receita disponível offline;
- receita parcialmente disponível offline.

A política geral de sincronização está em `docs/SYNC.md`.

## 12. Limpeza e pressão de armazenamento

O app pode oferecer limpeza manual de cache e realizar limpeza automática conservadora de arquivos regeneráveis.

Nunca remover automaticamente:

- a única cópia conhecida de uma foto ainda não sincronizada;
- mídia em upload não confirmado;
- conteúdo explicitamente marcado para disponibilidade offline sem informar que essa garantia será perdida;
- dados necessários para resolver uma operação pendente.

Quando houver pressão de espaço, a preferência de remoção deve começar por originais/derivados regeneráveis menos recentes e não marcados para offline, preservando miniaturas e capas quando razoável.

## 13. Testes mínimos

A implementação deve cobrir, no mínimo:

1. foto criada offline permanece visível e protegida até upload confirmado;
2. falha de upload não apaga a única cópia local;
3. retry de upload nunca sobrescreve objeto divergente e aceita apenas objeto já existente idêntico;
4. cache de um par não é lido por outro par com o mesmo `mediaId`;
5. blob legado só é migrado por job pendente do par correto;
6. receita marcada para offline baixa galeria + fotos de histórico conhecidas;
7. nova mídia sincronizada para receita marcada é reconciliada automaticamente;
8. reconexão tenta completar conjunto offline parcial;
9. desativar garantia offline não exclui mídia remota;
10. logout preserva mutation outbox/fila de mídia pendente e não expõe cache de outro par pela interface;
11. usuário fora do `pair` não acessa objeto remoto por conhecer seu identificador;
12. hard-delete não dá DELETE físico ao browser e deixa falha remota retryável em fila privada;
13. backup completo inclui originais e não substitui silenciosamente arquivos por miniaturas.

## 14. Relação com outros documentos

- Mídia offline: `docs/MEDIA_OFFLINE.md`.
- Produto: `docs/PRODUCT.md`.
- Arquitetura: `docs/ARCHITECTURE.md`.
- Modelo de dados: `docs/DATA_MODEL.md`.
- Sincronização: `docs/SYNC.md`.
- Backup/restauração: `docs/BACKUP_RESTORE.md`.
- Autenticação e segurança: `docs/AUTH_SECURITY.md`.
