# Modo Cozinha e Ciclo do Preparo

> Especificação normativa do comportamento de um preparo em andamento. O modo cozinha é um estado operacional temporário; o histórico persistente só nasce quando o usuário confirma que o preparo foi concluído.

## 1. Princípio central

**Abrir ou iniciar o modo cozinha não cria automaticamente um `cooking_session`.**

Isso evita poluir o histórico com receitas apenas consultadas, preparos interrompidos ou sessões abandonadas.

Enquanto o preparo estiver em andamento, progresso, posição e timers pertencem ao estado local temporário do dispositivo.

## 2. Início do preparo

Ao iniciar o modo cozinha, o aplicativo cria ou recupera um estado local de preparo em andamento associado à receita.

Esse estado deve ser suficiente para preservar, conforme aplicável:

- receita em uso e contexto necessário para gerar posteriormente o snapshot histórico aprovado;
- porções/escala escolhidas para aquele preparo;
- etapa atual;
- marcações transitórias de ingredientes e passos;
- timers ativos e seus timestamps/deadlines;
- momento de início e última atividade úteis à retomada.

Esse estado temporário não deve ser apresentado como um preparo já realizado no histórico.

## 3. Retomada

Sair do modo cozinha não significa abandonar o preparo.

- navegação interna deve preservar o progresso;
- recarregamentos recuperáveis devem restaurar o estado quando o armazenamento local ainda estiver disponível;
- ao voltar à receita, a interface deve oferecer retomada clara do preparo em andamento;
- timers recuperados devem recalcular o estado a partir de timestamps, conforme a política já aprovada para timers;
- a retomada não depende de conexão com a Internet.

A retomada é local ao dispositivo; esta especificação não cria requisito de sincronizar um preparo em andamento ou timers em tempo real entre dispositivos.

## 4. Finalizar preparo

O histórico persistente só é criado por uma ação explícita de **“Finalizar preparo”**.

Ao finalizar:

1. o aplicativo transforma o preparo em andamento em um `cooking_session` persistente;
2. registra data/hora, porções e o contexto/snapshot necessário da receita;
3. encerra o estado operacional do modo cozinha para aquela execução;
4. abre a etapa pós-preparo para complementar o registro com fotos, avaliações individuais, comentários individuais e observação compartilhada.

A ausência de avaliação de um dos membros não impede a finalização, conforme as regras já aprovadas do histórico.

A finalização deve ser idempotente o suficiente para evitar que repetição acidental da mesma confirmação crie dois preparos para a mesma execução.

## 5. Encerrar sem registrar

O modo cozinha deve oferecer uma ação explícita de **“Encerrar sem registrar”**.

Essa ação:

- abandona o estado local daquele preparo em andamento;
- não cria `cooking_session`;
- não altera o estado derivado “Já fizemos”;
- encerra/cancela timers vinculados àquele preparo local quando apropriado;
- não altera a definição canônica da receita.

Como a ação descarta progresso local, a interface deve pedir confirmação proporcional ao risco sem usar linguagem alarmista.

## 6. Histórico e estado “Já fizemos”

Somente `cooking_sessions` persistidos contam como preparos válidos para o histórico.

Portanto:

- abrir a receita não conta como preparo;
- iniciar modo cozinha não conta como preparo;
- abandonar modo cozinha não conta como preparo;
- somente concluir por “Finalizar preparo” torna a execução parte do histórico e pode fazer a receita passar a ser considerada “Já fizemos”.

## 7. Relação com timers

Timers fazem parte do estado operacional do modo cozinha e não da definição canônica da receita.

- podem existir vários simultaneamente;
- devem continuar recuperáveis localmente enquanto o preparo permanecer retomável;
- não precisam ser gravados no histórico após a finalização, salvo se uma futura decisão de produto exigir registrar telemetria de duração real;
- abandonar o preparo não deve deixar timers órfãos associados a uma execução inexistente.

## 8. Estado local versus domínio sincronizado

O preparo em andamento é **estado local transitório**, não uma entidade compartilhada do domínio remoto por padrão.

Isso reduz conflitos desnecessários e mantém o modo cozinha funcional mesmo sem rede.

O `cooking_session` passa a participar da sincronização normal somente depois de “Finalizar preparo”. A partir daí, fotos, observação compartilhada e avaliações individuais seguem as regras normais de mídia e sincronização.

## 9. Falhas e segurança contra perda

- fechar acidentalmente a PWA não deve apagar deliberadamente um preparo retomável se o armazenamento local continuar disponível;
- falha de rede não deve impedir finalização local; o novo `cooking_session` pode entrar na fila de sincronização;
- a UI deve distinguir “preparo em andamento” de “preparo já salvo”; 
- uma falha durante a transição de finalização não pode resultar silenciosamente em duplicação ou perda do registro.

## 10. Cenários mínimos de teste

1. iniciar modo cozinha não cria `cooking_session`;
2. sair e voltar restaura etapa/progresso quando o estado local continua disponível;
3. timers são recuperados por timestamp após recarregamento recuperável;
4. “Encerrar sem registrar” remove o estado operacional e não cria histórico;
5. “Finalizar preparo” cria exatamente um `cooking_session`;
6. finalizar offline cria o registro local e o deixa pendente de sincronização;
7. após finalizar, a tela pós-preparo permite adicionar fotos, avaliações/comentários individuais e observação compartilhada;
8. abandonar um preparo não altera “Já fizemos”;
9. timers não ficam órfãos após abandono;
10. repetição acidental da confirmação de finalização não cria preparos duplicados.

## 11. Relação com outros documentos

- Requisitos funcionais: `docs/PRODUCT.md`.
- UX geral e ergonomia: `docs/UX.md`.
- Modelo persistente do histórico: `docs/DATA_MODEL.md`.
- Timers e funcionamento local-first: `docs/ARCHITECTURE.md` e `docs/SYNC.md`.
- Fotos pós-preparo: `docs/MEDIA_STORAGE.md`.
