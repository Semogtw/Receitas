# Mídia e disponibilidade offline

> Especificação normativa para fotos, cache local e disponibilidade offline. O objetivo é manter a experiência local-first sem transformar o dispositivo em uma cópia obrigatória de todos os originais em resolução completa.

## 1. Princípio central

Fotos e metadados possuem ciclos de sincronização diferentes.

A aplicação deve permanecer útil offline, mas não precisa manter todos os arquivos originais de toda a biblioteca no dispositivo o tempo inteiro.

## 2. Camadas de mídia

A experiência pode trabalhar com diferentes representações do mesmo conteúdo:

- **miniatura**, otimizada para listas e histórico;
- **imagem de visualização**, adequada à tela de receita/galeria;
- **original**, preservado no Storage privado para qualidade máxima e backup.

A existência dessas variantes é detalhe de implementação, mas a arquitetura deve permitir reduzir uso de armazenamento e tráfego sem degradar a experiência visual cotidiana.

## 3. Conteúdo mantido prioritariamente local

O cliente deve priorizar cache local para:

- capas de receitas;
- miniaturas usadas em listas, histórico e planejador;
- fotos acessadas recentemente;
- mídia recém-criada no dispositivo enquanto o upload ainda estiver pendente;
- mídia pertencente a receitas explicitamente marcadas como disponíveis offline.

O cache pode crescer e ser podado conforme limites reais da plataforma, preservando conteúdo explicitamente solicitado para uso offline com prioridade maior que conteúdo apenas recente.

## 4. Originais

O original em resolução completa é armazenado no **Supabase Storage privado** depois do upload concluído.

Regras:

- originais não precisam permanecer permanentemente em todos os dispositivos;
- podem ser baixados sob demanda quando o usuário abrir a imagem em alta resolução ou solicitar disponibilidade offline completa;
- ausência do original local não impede exibir miniatura/preview já armazenados;
- o app deve distinguir “não está baixado” de “não existe” e de “upload falhou”.

## 5. Foto recém-tirada ou selecionada

Ao adicionar mídia:

1. o arquivo recebe referência local imediatamente;
2. o registro relacionado pode ser salvo sem aguardar rede;
3. o arquivo entra na fila de upload;
4. a interface mostra que o upload está pendente quando isso for relevante;
5. após upload confirmado, a referência remota passa a ser a cópia canônica de recuperação;
6. a cópia local pode continuar em cache conforme política do dispositivo.

Nunca remover a única cópia local de uma foto antes de confirmar que o upload remoto terminou com sucesso.

## 6. “Disponibilizar offline” por receita

Cada receita pode ser marcada explicitamente como **Disponibilizar offline**.

Essa ação deve baixar e manter localmente, na medida suportada pela plataforma:

- dados estruturados da receita;
- capa;
- fotos da galeria da receita;
- fotos relevantes do histórico de preparos;
- previews e/ou originais necessários para a experiência offline definida.

O usuário deve conseguir ver o estado da operação: pendente, baixando, disponível, parcialmente disponível ou falha.

Desmarcar a opção permite que essa mídia volte a ser elegível para limpeza de cache, sem excluir os arquivos remotos.

## 7. Limites e pressão de armazenamento

PWAs dependem das políticas de armazenamento do navegador/sistema operacional. Por isso:

- o aplicativo não deve prometer retenção local absoluta quando a plataforma puder limpar armazenamento;
- sempre que APIs de persistência estiverem disponíveis, podem ser solicitadas de forma apropriada;
- conteúdo remoto sincronizado deve poder ser recuperado novamente;
- a interface deve evitar alarmismo, mas deve informar quando uma receita marcada para offline deixou de estar completamente disponível;
- nunca considerar cache local como único backup de mídia já sincronizada.

## 8. Cache e limpeza

A política de limpeza automática deve priorizar a remoção de conteúdo regenerável:

1. previews/miniaturas antigas não marcadas para offline;
2. fotos originais antigas já confirmadas no Storage privado;
3. demais mídia remota que possa ser baixada novamente.

Não limpar automaticamente:

- uploads ainda pendentes;
- arquivos que ainda não possuem cópia remota confirmada;
- mídia necessária para uma receita marcada como disponível offline, salvo quando a plataforma remover dados por conta própria.

## 9. Segurança

- Storage remoto é privado;
- URLs permanentes públicas não são usadas como mecanismo padrão;
- arquivos locais ficam sujeitos ao modelo de segurança do navegador/dispositivo;
- logout deve impedir acesso pela interface aos dados privados do usuário anterior;
- a estratégia de implementação deve isolar referências/cache por identidade e `pair` para evitar mistura entre sessões.

## 10. Relação com sincronização

Metadados de mídia e bytes do arquivo não precisam sincronizar na mesma transação.

Estados conceituais úteis incluem:

- local_only;
- upload_pending;
- uploading;
- synced;
- download_pending;
- cached;
- available_offline;
- failed.

Os nomes finais podem mudar, mas a interface deve ser capaz de explicar se a mídia está somente local, sincronizada remotamente ou disponível offline.

## 11. Testes mínimos

A implementação deve cobrir pelo menos:

1. foto criada offline continua acessível antes do upload;
2. upload concluído nunca remove a única cópia antes da confirmação remota;
3. falha de upload mantém possibilidade de retry;
4. receita marcada para offline baixa a mídia esperada;
5. desmarcar offline não exclui mídia remota;
6. limpeza de cache não remove upload pendente;
7. original ausente localmente pode ser recuperado do Storage privado quando online;
8. logout/alternância de identidade não expõe cache privado da sessão anterior pela UI;
9. estado parcial de download offline é representado corretamente;
10. remoção de dados locais pela plataforma não é interpretada como exclusão remota.

## 12. Relação com outros documentos

- Arquitetura geral: `docs/ARCHITECTURE.md`.
- Produto e fotos: `docs/PRODUCT.md`.
- UX de fotos e estados de sincronização: `docs/UX.md`.
- Política de sincronização: `docs/SYNC.md`.
- Backup e restauração: `docs/BACKUP_RESTORE.md`.
