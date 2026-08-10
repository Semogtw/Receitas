# Runbook — drill de backup e restauração

Este exercício comprova que o formato completo de backup, merge, `replace_all`, safety backup e mídia continuam recuperáveis. Execute apenas em **staging dedicado do Receitas**, nunca em produção ou em contas pessoais.

## Objetivo

Ao final do drill devem existir evidências de que:

1. um ZIP completo válido pode ser exportado;
2. importar o mesmo estado em modo Mesclar é idempotente/no-op quando nada divergiu;
3. corrupção de arquivo/mídia é detectada antes do commit;
4. `replace_all` exige safety backup validado pelo servidor;
5. o safety backup realmente consegue restaurar o estado que foi substituído;
6. fotos continuam ligadas ao owner correto e com checksum/tamanho válidos;
7. falhas antes do commit não deixam estado canônico parcialmente substituído.

## Pré-condições

- staging Supabase, Storage e PowerSync confirmados como pertencentes a Receitas;
- migrations aplicadas até a versão atual;
- Edge Functions atuais implantadas;
- identidade/par **exclusivos para E2E/drill**;
- pelo menos uma receita com ingrediente, etapa e foto já sincronizada;
- `mutation_outbox` vazia;
- fila de mídia vazia;
- nenhuma foto em estado diferente de `uploaded`;
- nenhuma restauração administrativa pendente;
- browser com espaço local suficiente para OPFS/ZIP.

Antes de começar, registre:

```text
Receitas commit SHA:
Migration final:
Supabase staging Project Ref:
PowerSync staging project/instance:
Cloudflare staging origin:
Data/hora UTC:
Operador:
```

Nunca registre secrets, tokens, conteúdo privado de receitas ou e-mails pessoais.

## Fase A — criar o estado A

No par de staging:

1. crie uma receita com título único `DRILL-A-<timestamp>`;
2. adicione ao menos um ingrediente e uma etapa;
3. adicione uma foto pequena de fixture, sem conteúdo pessoal;
4. marque uma flag simples, como favorita;
5. crie uma entrada relacionada no planner ou lista de compras, se o fixture do ambiente permitir;
6. aguarde sync e upload chegarem a zero pendente;
7. abra o segundo cliente e confirme que o estado A chegou remotamente.

Registre apenas IDs técnicos/contagens se necessários; não copie corpo de receita para relatório público.

## Fase B — exportar backup A

Em **Configurações → Backup completo**:

1. gere o ZIP completo;
2. confirme que o produto não reporta mutações/uploads pendentes;
3. preserve o checksum final exibido;
4. mantenha o arquivo `A.zip` fora do storage do navegador que será manipulado;
5. valide `A.zip` pelo inspector do próprio produto antes de prosseguir.

Resultado esperado:

- inspector aceita manifest;
- todos os `data/*` e `media/*` batem SHA/bytes;
- nenhum arquivo Auth/session/secret aparece no backup.

## Fase C — provar merge idempotente

Sem alterar o par:

1. selecione `A.zip` no restore completo;
2. execute somente a validação/staging primeiro;
3. confirme que selecionar o arquivo **não** altera estado canônico;
4. aplique o merge explicitamente;
5. aguarde sync.

Resultado esperado:

- conteúdo visível permanece igual;
- linhas semanticamente equivalentes são no-op;
- não surgem IDs duplicados;
- não aparece terceiro membro/identidade;
- nenhuma foto é duplicada somente por repetir o mesmo backup.

## Fase D — provar rejeição de corrupção

Crie uma cópia descartável de `A.zip` e modifique bytes de um `media/*` ou `data/*` sem atualizar o manifesto.

1. selecione o ZIP corrompido;
2. aguarde o inspector local;
3. confirme que a validação falha;
4. confirme que nenhum job remoto é criado quando a corrupção é detectável localmente;
5. confirme que nenhuma mutação canônica ocorreu.

Não use esse arquivo em produção nem tente “corrigir” o checksum manualmente.

## Fase E — criar estado B

Altere o staging de forma inequívoca:

1. crie `DRILL-B-<timestamp>`;
2. adicione uma foto de fixture diferente;
3. opcionalmente altere um campo da receita A;
4. aguarde sync/upload completo;
5. confirme no segundo cliente.

Agora o estado canônico é **B** e difere do `A.zip`.

## Fase F — replace-all de B por A

1. escolha `A.zip` em **Substituir tudo**;
2. deixe a aplicação gerar o safety backup do estado B;
3. preserve o safety ZIP `SAFETY-B.zip` e seu checksum;
4. confirme que o servidor aceitou o safety backup como representação exata do estado atual;
5. somente depois execute a ação destrutiva de `replace_all`;
6. aguarde commit e sync.

Resultados obrigatórios:

- `DRILL-B-*` deixa de aparecer como item ativo;
- `DRILL-A-*` volta ao estado representado por `A.zip`;
- mídia A resolve corretamente;
- o par/Auth não é substituído pelo backup;
- nenhum estado parcialmente misturado fica visível após commit.

Se o safety backup não for validado pelo servidor, **não** contorne o bloqueio.

## Fase G — restaurar B usando o safety backup

Este é o passo que prova que o “backup de segurança” não é apenas ritual.

1. use `SAFETY-B.zip` como entrada de um novo `replace_all`;
2. permita que o produto gere um novo safety backup do estado A atual (`SAFETY-A2.zip`);
3. preserve `SAFETY-A2.zip`;
4. execute o replace somente após validação server-side;
5. aguarde sync completo nos dois clientes.

Resultado esperado:

- `DRILL-B-*` retorna;
- a foto B resolve e conserva checksum/tamanho;
- o estado correspondente a B retorna de forma coerente;
- o novo safety backup A2 também passa no inspector.

## Fase H — conflito de merge

Com B ativo:

1. altere uma propriedade da receita A/B no staging atual;
2. importe um backup que contenha a mesma stable ID com valor divergente em modo **Mesclar**;
3. aplique o merge.

Resultado esperado:

- nenhuma versão é silenciosamente sobrescrita;
- surge conflito normal no Conflict Center;
- payload local/remoto mantém as versões necessárias à decisão;
- mídia promovida necessária a conflito permanece referenciada e não é removida pelo cleanup.

Resolva o conflito pela UI e confirme sync no segundo cliente.

## Fase I — cleanup e retenção

Depois dos jobs terminarem:

1. execute/aguarde o cleanup normal de restore staging;
2. confirme que objetos temporários órfãos podem ser removidos;
3. confirme que mídia canônica ou referenciada por conflito aberto não foi apagada;
4. confirme que jobs que falharam cleanup continuam disponíveis para retry, em vez de serem apagados parcialmente.

Não faça `rm` manual em Storage para “deixar limpo”.

## Automação Playwright relacionada

Quando staging estiver provisionado:

```bash
export E2E_EMAIL='...'
export E2E_PASSWORD='...'
export E2E_DESTRUCTIVE_RESTORE=1
pnpm playwright test tests/e2e/backup-restore.spec.ts
```

O E2E automatizado cobre partes importantes do round-trip, inclusive corrupção e ida/volta por safety backup. Este runbook continua necessário para a inspeção operacional de mídia, dois clientes, cleanup e evidência de ambiente.

## Critério de aprovação

O drill só é verde se **todos** os pontos abaixo forem verdadeiros:

- [ ] A.zip exportado e validado;
- [ ] merge de A sobre A foi idempotente;
- [ ] ZIP corrompido foi rejeitado antes de mutação canônica;
- [ ] B foi criado e sincronizado;
- [ ] safety B foi validado antes do replace;
- [ ] replace A removeu B ativo e restaurou A;
- [ ] safety B restaurou B de volta;
- [ ] fotos A/B resolveram com metadata/checksum coerentes;
- [ ] conflito divergente preservou ambas as versões;
- [ ] cleanup não removeu mídia canônica/referenciada;
- [ ] dois clientes convergiram após cada operação;
- [ ] nenhum membro/Auth foi criado por dados de backup.

## Registro do resultado

Criar uma nota/checkpoint com:

```text
Drill date:
Candidate SHA:
Migration head:
Environment identifiers (no secrets):
A backup checksum:
Safety B checksum:
Safety A2 checksum:
Merge result:
Corruption rejection result:
Replace A result:
Restore B result:
Media validation result:
Cleanup result:
Two-client convergence result:
Open issues:
```

Não marque campos como aprovados sem execução real. Se o drill falhar em algum ponto, preserve os artifacts de teste localmente pelo tempo necessário para diagnóstico e documente a etapa exata antes de corrigir o código.
