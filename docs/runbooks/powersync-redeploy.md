# Runbook — reativar PowerSync Free desprovisionado

Use este procedimento quando o Supabase do Receitas estiver saudável, mas a instância PowerSync correta estiver desprovisionada/inativa ou os clientes não conseguirem retomar sync por causa da instância.

## Invariantes

- O banco local é parte do sistema; não limpar IndexedDB/OPFS/PWA para “forçar” o sync.
- Mutações locais pendentes devem permanecer na `mutation_outbox` até confirmação remota.
- Uploads de mídia pendentes devem permanecer na fila local até confirmação do Storage.
- Reimplantar somente as regras versionadas deste repositório.
- Nunca apontar Receitas para projeto/instância de outro produto.
- Não criar tráfego artificial para evitar desprovisionamento do plano Free.

## Política do provedor verificada em 2026-08-10

A documentação oficial do PowerSync informa que instâncias Free sem deploys ou conexões de clientes por mais de 7 dias podem ser desprovisionadas. A retomada pode ser feita pelo Dashboard/CLI mediante novo deploy de Sync Streams/Sync Rules. Esse processo reprocessa a instância do zero e faz os clientes ressincronizarem dados.

A configuração atual deve ser revalidada na documentação oficial antes de uma recuperação futura.

## 1. Confirmar a causa

Antes de redeploy:

1. confirme que o Supabase correto do Receitas está ativo;
2. confirme que Postgres/Auth respondem normalmente;
3. abra o PowerSync Dashboard e confirme projeto + instância do Receitas;
4. verifique se o estado é desprovisionado/inativo ou se há erro da conexão de origem;
5. se a instância estiver ativa, trate como incidente de regras/JWT/rede, não como simples deprovisionamento.

## 2. Preservar os dispositivos

Nos dois clientes:

- não desinstale a PWA;
- não limpe dados do site;
- não recrie o banco local;
- não descarte receitas/fotos por estarem “presas” offline;
- registre os contadores sanitizados em **Configurações → Diagnósticos**.

A aplicação deve continuar permitindo leitura do conteúdo já local enquanto a instância remota está indisponível.

## 3. Validar a configuração versionada

A fonte canônica das regras deste projeto é:

```text
powersync/sync-rules.yaml
```

Antes de deploy:

1. use o commit de release/staging que realmente será recuperado;
2. revise o diff desde o último deploy conhecido;
3. confirme que as regras continuam filtrando dados pelo par autenticado;
4. não faça alterações diretamente no Dashboard sem refletir a mesma configuração no repositório.

Se houver qualquer dúvida sobre isolamento entre pares, pare a retomada e execute os testes de autorização antes de expor a instância aos clientes.

## 4. Reimplantar a instância

Pelo PowerSync Dashboard ou CLI suportado pelo provedor:

1. abra o projeto e instância corretos;
2. reconfirme a conexão de origem com o Supabase correto;
3. implante a versão atual de `powersync/sync-rules.yaml`/Sync Streams equivalente;
4. aguarde o reprocessamento terminar;
5. não altere os endpoints públicos do frontend até a instância ficar saudável.

O reprocessamento completo após deprovisionamento é esperado no plano Free; não trate o volume inicial de re-sync como perda de dados por si só.

## 5. Verificar isolamento antes de liberar uso normal

Em staging ou com fixtures dedicadas, confirme:

- usuário A recebe apenas rows do próprio par;
- usuário B do mesmo par recebe o mesmo conjunto autorizado;
- identidade de outro par não recebe rows do par A/B;
- membership removida não continua recebendo dados novos;
- tabelas locais-only (`mutation_outbox`, preferências/dispositivos) nunca dependem de sync remoto.

Não use dados pessoais de produção para provar isolamento.

## 6. Reconectar clientes e observar re-sync

Em um cliente por vez:

1. abra a PWA online;
2. aguarde a conexão PowerSync;
3. permita a re-sincronização inicial concluir;
4. confirme que dados locais relevantes continuam presentes durante o processo;
5. confirme que a fila de mutações começa a drenar somente após a conexão estar pronta;
6. confirme que uploads de mídia retomam sem criar duplicatas canônicas.

Depois repita no segundo cliente.

## 7. Verificar mutações feitas durante a indisponibilidade

Use pelo menos uma alteração não destrutiva criada durante o período offline:

1. confirme que ela ainda existe localmente antes do sync;
2. aguarde o upload semântico;
3. confirme o ACK/removal da `mutation_outbox` pelo fluxo normal;
4. confirme que o outro cliente recebe a alteração;
5. confirme que o revisionamento remoto permanece monotônico e que não houve criação duplicada.

Se surgir conflito real, resolva pelo Conflict Center; não apague a fila manualmente.

## 8. Verificar mídia

Para mídia pendente:

- confirme que o blob local continua disponível;
- deixe a fila normal fazer upload para Storage privado;
- confirme SHA/byte size e metadata antes de considerar a mídia concluída;
- verifique que o outro dispositivo consegue resolver a mídia após sync.

## 9. Encerrar incidente

A recuperação termina quando:

- instância está provisionada e saudável;
- regras versionadas estão implantadas;
- isolamento por par foi confirmado;
- os dois clientes concluíram o re-sync;
- `mutation_outbox` e fila de mídia chegaram ao estado esperado;
- alterações offline foram preservadas e sincronizadas;
- nenhuma limpeza manual de banco local foi necessária.

Registre somente informações operacionais não sensíveis: data, commit das regras, ambiente e resultado dos checks.
