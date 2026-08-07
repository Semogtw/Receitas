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

## 5. “Disponibilizar offline” por receita

Cada receita pode ser marcada, por dispositivo, como **Disponível offline**.

Ao ativar essa opção, o aplicativo deve tentar manter localmente:

- dados estruturados da receita;
- foto de capa;
- galeria permanente da receita;
- fotos do histórico de preparos associado à receita;
- derivados necessários para visualização;
- originais das fotos quando essa for a política final escolhida para o modo offline completo.

A implementação pode baixar em fila para não bloquear a interface.

A UI deve indicar:

- preparando conteúdo offline;
- disponível offline;
- parcialmente disponível;
- falha de download com possibilidade de tentar novamente.

Marcar uma receita como disponível offline é uma preferência **local ao dispositivo**, não uma preferência obrigatoriamente sincronizada entre os dois membros.

## 6. Acesso sem internet

Sem conexão:

- capas e miniaturas em cache devem continuar aparecendo;
- mídias já presentes localmente devem abrir normalmente;
- receitas marcadas para offline devem funcionar com o máximo de conteúdo previamente baixado;
- uma foto que exista apenas no remoto deve mostrar estado claro de indisponibilidade temporária, sem fingir que o arquivo foi perdido;
- a ausência do original local não impede acesso aos dados estruturados da receita.

## 7. Storage remoto

Os originais sincronizados ficam em **Supabase Storage privado**.

Regras:

- não usar bucket público para fotos pessoais;
- leitura e escrita devem respeitar a autorização do `pair`;
- caminhos/objetos não substituem RLS ou validações de autorização;
- URLs de acesso temporário não devem ser tratadas como identificadores permanentes do arquivo;
- registros do banco devem guardar identidade estável da mídia e referência suficiente para resolver o objeto remoto autorizado.

## 8. Integridade e ciclo de vida

Uma foto não deve ser considerada remotamente segura apenas porque uma requisição de upload foi iniciada.

Antes de liberar a única cópia local para limpeza, o sistema deve possuir evidência suficiente de que:

- o upload concluiu;
- o objeto remoto corresponde ao registro esperado;
- o vínculo entre mídia, receita/preparo e `pair` está persistido;
- não existe erro pendente que deixe o arquivo órfão.

Arquivos órfãos remotos devem ser tratados por rotina segura de reconciliação, nunca por exclusão agressiva baseada apenas em idade.

## 9. Exclusão e lixeira

Excluir uma foto do produto é diferente de removê-la do cache.

- limpeza de cache só remove cópia local regenerável;
- exclusão funcional usa o mesmo modelo de soft delete/lixeira aprovado para outras entidades relevantes;
- exclusão definitiva deve remover metadados e objeto remoto somente após validações apropriadas;
- uma mídia marcada como excluída não deve reaparecer apenas porque ainda existe um arquivo em cache.

## 10. Backup

O backup completo deve poder incluir os originais das mídias, independentemente de estarem ou não presentes no cache do dispositivo que iniciou a exportação.

Se algum original necessário ao backup estiver apenas no Storage remoto, o processo de backup deve obtê-lo de forma autorizada ou falhar de maneira explícita; não deve substituir silenciosamente o original por miniatura.

As regras completas de backup/restauração estão em `docs/BACKUP_RESTORE.md`.

## 11. Estado local e sincronização

A fila de mídia é separada da sincronização dos dados estruturados.

Estados locais úteis por arquivo podem incluir:

- somente local;
- upload pendente;
- enviando;
- sincronizado;
- download pendente;
- disponível offline;
- falha temporária;
- remoção de cache permitida.

Esses estados não precisam corresponder a uma única coluna remota; parte deles é estado operacional do cliente.

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
3. foto sincronizada pode ser removida do cache sem desaparecer do produto;
4. reabrir uma foto removida do cache baixa novamente o arquivo quando online;
5. receita marcada como disponível offline mantém seu conteúdo previamente baixado sem rede;
6. receita não marcada para offline continua funcional em dados estruturados mesmo se algum original não estiver local;
7. limpar cache não executa soft delete nem exclusão remota;
8. logout impede exposição de mídia privada da sessão anterior pela interface;
9. usuário fora do `pair` não acessa objeto remoto por conhecer seu identificador;
10. backup completo inclui originais e não substitui silenciosamente arquivos por miniaturas.

## 14. Relação com outros documentos

- Produto: `docs/PRODUCT.md`.
- Arquitetura: `docs/ARCHITECTURE.md`.
- Modelo de dados: `docs/DATA_MODEL.md`.
- Sincronização: `docs/SYNC.md`.
- Backup/restauração: `docs/BACKUP_RESTORE.md`.
- Autenticação e segurança: `docs/AUTH_SECURITY.md`.
