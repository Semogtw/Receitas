# Runbook — retomar Supabase Free pausado

Use este procedimento quando o backend do Receitas estiver indisponível e o Dashboard confirmar que o projeto Supabase **correto do Receitas** foi pausado.

## Invariantes

- Não limpar dados do navegador/PWA enquanto houver qualquer possibilidade de mutações ou mídia somente locais.
- Não usar `fichario-staging`: esse projeto pertence a outro produto.
- Não gerar keep-alive artificial para contornar a política de inatividade do plano gratuito.
- Não aplicar migrations, funções ou restores até confirmar explicitamente o Project Ref do ambiente alvo.
- Nunca colocar `service_role`, tokens administrativos ou segredos de bootstrap em logs, screenshots ou frontend.

## Política do provedor verificada em 2026-08-10

A documentação oficial atual do Supabase informa que projetos Free com baixa atividade podem ser pausados após um período de 7 dias e que um projeto pausado pode ser retomado pelo Dashboard durante uma janela de até **1 ano**. Depois dessa janela, o caminho documentado é recuperar os backups disponíveis e migrar para um projeto novo.

Essas regras são externas ao repositório e devem ser revalidadas na documentação oficial antes de uma recuperação futura.

## 1. Confirmar que é pausa, não outro incidente

1. Abra o Supabase Dashboard.
2. Confirme organização, nome do projeto e Project Ref do Receitas.
3. Confirme que o estado exibido é pausado/inativo.
4. Se o projeto estiver ativo, trate o incidente como conectividade/Auth/Storage/Edge Function, não como pausa.
5. Antes de qualquer ação destrutiva, abra o Receitas nos dispositivos que ainda possuem dados e preserve o estado local.

Sinais compatíveis com pausa:

- Auth/backend deixam de responder ao mesmo tempo;
- sync fica pendente, mas dados já locais continuam legíveis;
- uploads permanecem pendentes;
- o Dashboard mostra o projeto como pausado.

## 2. Preservar clientes antes de retomar

Em cada dispositivo acessível:

1. Não desinstale a PWA.
2. Não limpe site data, IndexedDB, OPFS ou cache do navegador.
3. Abra **Configurações → Diagnósticos** e registre somente os contadores técnicos disponíveis.
4. Observe se há mutações sem sync, uploads pendentes ou conflitos.
5. Se houver estado pendente, mantenha o dispositivo intacto até o backend voltar e as filas drenarem.

O backup completo normal do produto pode recusar exportação enquanto há mutações/uploads pendentes; isso é uma proteção intencional e não deve ser contornada durante o incidente.

## 3. Retomar o projeto

No Supabase Dashboard:

1. selecione o projeto correto do Receitas;
2. use **Resume project**;
3. aguarde o projeto voltar ao estado operacional;
4. não faça deploy/migration em paralelo durante a retomada.

Se a opção de retomada não existir por expiração da janela do provedor, interrompa este runbook e siga o procedimento oficial de recuperação para um projeto novo usando os backups disponibilizados pelo Supabase.

## 4. Verificar banco e schema antes de liberar clientes

No ambiente correto, confirme que as migrations continuam aplicadas. Preferência:

```bash
supabase migration list --linked
```

O `supabase link` deve ter sido feito deliberadamente para o Project Ref do Receitas antes desse comando.

Como sanity check de schema, confirme no SQL Editor que tabelas essenciais continuam presentes, sem consultar conteúdo pessoal:

```sql
select
  to_regclass('public.pairs') is not null as pairs_ok,
  to_regclass('public.pair_members') is not null as pair_members_ok,
  to_regclass('public.recipes') is not null as recipes_ok,
  to_regclass('public.recipe_photos') is not null as recipe_photos_ok,
  to_regclass('public.cooking_sessions') is not null as cooking_sessions_ok;
```

Todos os campos devem resultar em `true`.

Se migrations estiverem ausentes ou divergentes, não permita escrita de clientes até entender a divergência. Não faça reset do banco remoto.

## 5. Verificar Auth, Storage e Edge Functions

### Auth

- confirme que signup público continua desabilitado;
- confirme que anonymous login continua desabilitado;
- faça login somente com as identidades de teste/operador apropriadas ao ambiente;
- confirme que o par continua fechado e não surgiu terceiro membro ativo.

### Storage

No SQL Editor, verifique somente metadados dos buckets:

```sql
select id, public
from storage.buckets
where id in ('recipe-media', 'restore-staging')
order by id;
```

Buckets presentes devem continuar privados (`public = false`). O identificador canônico da mídia do produto é `recipe-media` com hífen; `recipe_media` não é um alias válido.

Não faça download em massa de mídia de produção para um runner público.

### Edge Functions

Confirme no Dashboard que as funções esperadas estão implantadas. Teste chamadas autenticadas pelos fluxos normais do app e verifique que endpoints protegidos recusam requisições sem JWT, em vez de retornar sucesso anônimo.

## 6. Retomar PowerSync

A pausa do Supabase pode interromper a fonte do PowerSync. Depois que o Supabase estiver saudável:

1. verifique a instância PowerSync do Receitas;
2. se ela também tiver sido desprovisionada, siga `docs/runbooks/powersync-redeploy.md`;
3. aguarde reprocessamento/reconexão antes de avaliar a fila dos clientes.

## 7. Verificar drenagem local-first

Em cada um dos dois clientes:

1. reconecte o app;
2. aguarde PowerSync ficar conectado;
3. aguarde a fila de mutações semânticas diminuir até zero;
4. aguarde a fila de upload de mídia diminuir até zero;
5. confirme que não surgiram conflitos inesperados;
6. confirme que alterações feitas offline aparecem no outro dispositivo depois do sync.

Não considere a recuperação concluída só porque o Dashboard voltou a ficar verde.

## 8. Fechar a recuperação

Quando ambos os clientes estiverem sincronizados:

- gere um backup completo do produto e valide o ZIP/checksum;
- exporte diagnósticos sanitizados se houver algo útil para investigação;
- registre data, Project Ref **sem qualquer segredo**, migrations aplicadas e resultado dos checks;
- revalide no Dashboard que o projeto permanece no plano Free se custo zero continuar sendo requisito.

## Critério de sucesso

A recuperação termina somente quando:

- Supabase está ativo;
- schema/Auth/RLS/Storage/Edge Functions estão coerentes;
- PowerSync está conectado e com isolamento por par preservado;
- filas locais de mutação e mídia drenaram;
- os dois usuários veem o mesmo estado canônico;
- um backup completo pós-recuperação é validado.
