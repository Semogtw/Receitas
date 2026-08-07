# Decisão — ciclo de autenticação por convites do Supabase

**Data:** 2026-08-07  
**Status:** decisão técnica ativa durante implementação do plano 02

## Contexto

O produto já exige:

- exatamente duas identidades autorizadas;
- nenhum cadastro público;
- e-mail verificado para ambas;
- autenticação final por e-mail e senha;
- bootstrap protegido por segredo servidor;
- convite de uso único/expirável para o segundo membro;
- nenhuma chave administrativa no frontend.

A implementação deve permanecer em serviços gratuitos.

## Decisão

A criação inicial das duas identidades usa o mecanismo administrativo **`Supabase Auth admin.inviteUserByEmail()`**, executado somente em Edge Functions com chave secreta de servidor.

Isso substitui, como detalhe de implementação, qualquer passo antigo do plano que sugerisse receber uma senha no endpoint de bootstrap ou criar a senha administrativamente.

O usuário define a própria senha ao concluir o convite do Supabase. O link do Supabase também confirma o endereço de e-mail antes de o membro obter autorização aos dados do par.

`auth.admin.createUser()` não é usado como fluxo normal de formação do par porque, segundo a documentação atual do Supabase, ele não envia o e-mail de confirmação. Não será criado um mecanismo paralelo de e-mail/token apenas para contornar isso.

## Bootstrap do primeiro membro

1. cliente envia apenas o e-mail e o segredo de bootstrap para a Edge Function `bootstrap`;
2. a função valida o segredo exclusivamente no servidor;
3. a função usa `inviteUserByEmail()` para criar a identidade pendente e enviar o convite;
4. a função chama a RPC privilegiada `create_bootstrap_pair(user_id)`;
5. essa RPC usa um singleton privado bloqueado com `FOR UPDATE`, cria o `pair`, reserva a primeira membership e consome o bootstrap definitivamente;
6. se a RPC falhar depois de a identidade Auth ter sido criada, a função tenta remover imediatamente esse Auth user como compensação;
7. ao abrir o convite do Supabase, o usuário confirma o e-mail, define a senha e entra na PWA;
8. `activate_current_pair_membership()` só ativa a primeira membership depois que `auth.users.email_confirmed_at` existir.

A membership pendente não passa por RLS porque `activated_at` ainda é nulo.

## Convite do segundo membro

O convite do segundo membro possui **duas credenciais complementares**:

1. o token de convite do próprio Supabase Auth, enviado por e-mail, que prova posse do endereço e confirma o e-mail;
2. um token opaco do domínio Receitas, de alta entropia, uso único e expiração, que vincula aquela identidade à segunda vaga do `pair`.

O token do domínio:

- é gerado com CSPRNG;
- é enviado apenas como parte do `redirectTo` do convite Supabase;
- somente o SHA-256 hexadecimal é persistido em `pair_invites`;
- nunca é registrado em logs do servidor;
- é vinculado ao `pair` e ao `invited_user_id`.

## Reserva da segunda vaga

Criar um convite pendente reserva a segunda vaga para impedir corridas, mas **não fecha semanticamente o par como formado**.

Enquanto o convite está pendente:

- existem duas memberships não removidas;
- somente a primeira está `activated_at != null`;
- `pairs.status` permanece `open_for_second_member`;
- uma terceira membership é rejeitada pelo limite de capacidade;
- o segundo usuário ainda não passa por `is_pair_member()`.

O par muda para `closed` somente quando o segundo usuário:

1. confirma o e-mail pelo convite do Supabase;
2. retorna autenticado à PWA;
3. apresenta o token de domínio correspondente;
4. chama `accept_pair_invite(token_hash)` com a própria sessão;
5. a RPC confirma que o token pertence exatamente a `auth.uid()`, não expirou e não foi consumido/inutilizado;
6. a membership é ativada;
7. o trigger fecha o par ao detectar dois membros ativados.

`activate_current_pair_membership()` rejeita memberships que possuem `invite_id`, impedindo que o segundo usuário contorne o token de domínio.

## Reenvio/substituição de convite pendente

Como uma conta ainda não ativada não é membro pleno do produto, um convite pendente pode ser revogado e substituído sem violar a regra de não reabrir um par já formado.

A Edge Function executa:

1. `revoke_pending_pair_invite(pair_id, creator_user_id)`, que invalida o token antigo e remove apenas a membership **nunca ativada** associada a ele;
2. se houver um Auth user pendente antigo, tenta removê-lo pelo Admin API;
3. cria/envia a nova identidade pelo `inviteUserByEmail()`;
4. reserva atomicamente o novo convite/membership com `reserve_pair_invite(...)`;
5. se a reserva falhar, remove o Auth user recém-criado como compensação.

Duas tentativas concorrentes podem chegar à etapa externa do Auth, mas somente uma consegue reservar a segunda vaga; a perdedora deve limpar a identidade Auth que criou.

Remover um membro **já ativado** continua sem reabrir o par automaticamente e segue `docs/ACCOUNT_LIFECYCLE.md`.

## Chaves do Supabase

Para código novo no servidor, preferir a nomenclatura atual:

- browser: publishable key;
- servidor/Edge Function: secret key.

A função pode aceitar `SUPABASE_SERVICE_ROLE_KEY` somente como fallback de compatibilidade com ambientes legados do Supabase. Nenhuma dessas chaves privilegiadas entra em `VITE_*`, bundle, local storage ou logs do cliente.

## E-mail

O fluxo usa o remetente de e-mail disponível pelo Supabase enquanto ele atender o uso privado de duas pessoas e continuar gratuito.

Os limites do provedor devem ser respeitados; não criar keep-alive, spam de reenvio ou mecanismo para burlar rate limits. Se o envio gratuito deixar de ser suficiente, pesquisar primeiro outra alternativa gratuita compatível antes de considerar custo recorrente.

## Relação com o plano de implementação

Esta decisão **substitui os detalhes antigos** dos Tasks 4 e 5 de `docs/superpowers/plans/2026-08-07-02-backend-auth-data.md` onde eles divergirem deste fluxo, especialmente:

- bootstrap não recebe senha;
- senha não é escolhida pelo servidor;
- segundo membro usa convite administrativo do Supabase + token de domínio;
- `pair_members.activated_at` é a fronteira de autorização;
- o par fecha após aceitação/verificação do segundo membro, não apenas ao enviar o convite.

As invariantes de produto do plano e de `docs/AUTH_SECURITY.md` permanecem inalteradas.
