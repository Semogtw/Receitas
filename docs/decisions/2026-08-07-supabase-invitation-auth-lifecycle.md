# Decisão — ciclo de autenticação por convites do Supabase

**Data:** 2026-08-07  
**Status:** decisão técnica ativa durante implementação do plano 02

## Contexto

O produto exige exatamente duas identidades autorizadas, nenhum cadastro público, e-mail verificado para ambas, autenticação final por e-mail/senha, bootstrap protegido por segredo servidor e convite expirável/uso único para a segunda pessoa. Nenhuma chave administrativa pode entrar no frontend e toda a solução precisa permanecer gratuita.

## Identidades criadas por convite administrativo

As duas identidades iniciais são criadas por **`Supabase Auth admin.inviteUserByEmail()`**, somente em Edge Functions com chave secreta do servidor.

Isso substitui qualquer versão antiga do plano que sugerisse receber senha no endpoint de bootstrap ou escolher senha administrativamente.

O usuário define a própria senha ao concluir o convite do Supabase. A conta só obtém autorização aos dados após o endereço estar confirmado e a membership correspondente ter sido ativada.

`auth.admin.createUser()` não é usado como fluxo normal porque a documentação atual não envia o e-mail de confirmação automaticamente por esse método.

## Bootstrap do primeiro membro

1. `/setup` envia apenas e-mail, ação e segredo de bootstrap à Edge Function `bootstrap`;
2. o segredo é comparado somente no servidor;
3. a função confirma que o bootstrap ainda está disponível;
4. `inviteUserByEmail()` cria a identidade pendente e envia o link;
5. `create_bootstrap_pair(user_id)` usa um singleton privado bloqueado com `FOR UPDATE`, cria o `pair`, reserva a primeira membership e consome o bootstrap definitivamente;
6. se o Auth user for criado mas a operação de banco falhar, a função tenta removê-lo como compensação;
7. ao abrir o convite, o usuário confirma o e-mail e define a senha;
8. `activate_current_pair_membership()` ativa a primeira membership somente quando `email_confirmed_at` já existe.

A membership pendente não passa por `is_pair_member()` porque `activated_at` permanece nulo.

## Reenvio seguro do convite inicial

Consumir o bootstrap não significa que um link de e-mail nunca possa expirar. Para não reabrir signup nem exigir intervenção manual no banco, `bootstrap` aceita `action: "reinvite"`, ainda exigindo o mesmo segredo de alta entropia.

A operação usa estado privado e recuperável:

- `begin_bootstrap_reinvite(email)` bloqueia o singleton, verifica que existe exatamente a primeira membership pendente, confirma o mesmo e-mail, remove temporariamente apenas essa reserva e grava um `attempt_id` privado;
- o Auth user antigo é removido;
- um novo convite administrativo para o mesmo e-mail é enviado;
- `finish_bootstrap_reinvite(attempt_id, new_user_id)` restaura a reserva usando o novo Auth UUID sem criar outro `pair`;
- se a remoção do Auth user antigo falhar de forma confirmada, `abort_bootstrap_reinvite()` restaura a reserva anterior;
- se a requisição cair depois de criar o novo Auth user mas antes de finalizar o banco, a próxima tentativa encontra o usuário pelo mesmo e-mail e conclui o `attempt_id` existente.

Durante esse estado não existe membro ativo capaz de criar um segundo convite, e o bootstrap continua consumido. Logo, a recuperação não abre uma superfície de terceiro usuário.

## Convite do segundo membro

A segurança do segundo convite usa **uma credencial entregue ao usuário: o convite de alta entropia do próprio Supabase Auth**. Uma segunda credencial do domínio na URL foi deliberadamente removida durante a revisão de segurança para evitar que um segredo adicional aparecesse em query strings, histórico ou logs do host.

A linha `pair_invites` continua sendo a garantia de domínio:

- é criada apenas por operação privilegiada;
- é vinculada ao `pair_id` e ao `invited_user_id` criado pelo convite administrativo;
- possui expiração própria;
- possui `consumed_at` e `invalidated_at`;
- reserva exatamente a segunda vaga;
- guarda um nonce aleatório somente como identificador interno; seu valor bruto nunca é enviado ao navegador.

O segundo usuário só pode concluir o vínculo depois que o convite Supabase o autenticar e verificar seu e-mail. A RPC `accept_pair_invite()` procura a única reserva pendente cujo `invited_user_id = auth.uid()`. Nenhum token do domínio é recebido do cliente.

## Reserva da segunda vaga

Criar um convite pendente reserva capacidade contra corridas, mas ainda não significa que o par esteja formado.

Enquanto o convite está pendente:

- existem duas memberships não removidas;
- somente a primeira está ativada;
- `pairs.status` continua `open_for_second_member`;
- uma terceira membership é rejeitada pelo trigger de capacidade;
- a segunda identidade ainda não passa por RLS.

O par passa a `closed` somente quando a segunda pessoa:

1. abre o convite Supabase;
2. confirma o e-mail e recebe sessão autenticada;
3. define uma senha com a política do projeto;
4. chama `accept_pair_invite()`;
5. a RPC confirma que a reserva pertence exatamente a `auth.uid()`, está válida e não expirou;
6. a membership é ativada;
7. o trigger detecta dois membros ativados e fecha o par.

A aceitação é idempotente: se a resposta de sucesso for perdida, repetir a RPC para a mesma identidade já ativada retorna o mesmo `pair_id`.

## Reenvio/substituição do segundo convite

Como uma identidade ainda não ativada não é membro pleno do produto, o membro ativo pode substituir um convite pendente sem violar a regra de par fechado.

A Edge Function:

1. invalida a reserva pendente e remove somente a membership nunca ativada;
2. tenta remover o Auth user pendente anterior;
3. cria/envia uma nova identidade com `inviteUserByEmail()`;
4. reserva atomicamente a segunda vaga para o novo `user_id`;
5. se a reserva perder uma corrida, remove o Auth user recém-criado como compensação.

Depois de duas memberships ativadas, o par fica `closed` e essa operação deixa de ser oferecida/aceita. Remover um membro já ativado não reabre automaticamente a vaga.

## Separação entre identidade Auth e autoria histórica

`pair_members.user_id` é tratado como UUID histórico estável, mas não mantém FK destrutiva obrigatória para `auth.users`.

A membership é criada apenas por funções privilegiadas que verificam a existência do Auth user naquele momento. Se uma conta Auth for removida no futuro, o UUID continua preservado em receitas, fotos, preparos, avaliações e demais referências históricas. Isso permite apagar/desativar a identidade de autenticação sem reescrever autoria nem apagar conteúdo compartilhado.

## Chaves do Supabase

Código novo prefere a nomenclatura atual:

- browser: publishable key;
- servidor/Edge Function: secret key.

`SUPABASE_SERVICE_ROLE_KEY` existe apenas como fallback de compatibilidade do runtime. Nenhuma chave privilegiada entra em `VITE_*`, bundle, local storage ou logs do cliente.

## Logout e cache local de autorização

Logout usa `auth.signOut({ scope: "local" })`, encerrando a sessão apenas naquele dispositivo. O pequeno auth-scope local (`userId` + `pairId`) existe somente para reabertura offline de uma sessão previamente validada e nunca concede acesso no servidor.

Se uma checagem online concluir que a membership não está mais ativa, esse cache é apagado imediatamente. Dados local-first não sincronizados não são destruídos pelo simples logout; sua política de isolamento/recuperação é tratada no plano de sync.

## E-mail e limites gratuitos

O fluxo usa o remetente disponibilizado pelo Supabase enquanto ele atender o uso privado de duas pessoas e permanecer gratuito. Os limites do provedor devem ser respeitados; não há keep-alive nem tentativa de burlar rate limits.

O ambiente local usa expiração de convite/OTP de 24 horas. No projeto hospedado, os valores de expiração e comprimento mínimo de senha serão configurados explicitamente no gate de provisionamento.

## Relação com o plano

Esta decisão substitui detalhes antigos dos Tasks 4–6 de `docs/superpowers/plans/2026-08-07-02-backend-auth-data.md` quando divergirem, especialmente:

- bootstrap não recebe senha;
- senha não é escolhida pelo servidor;
- primeiro convite expirado possui reinvite protegido e idempotente;
- segundo membro não recebe token adicional do domínio na URL;
- `pair_members.activated_at` é a fronteira de autorização;
- o par fecha apenas após a segunda identidade verificada aceitar a reserva;
- logout é local ao dispositivo.

As invariantes de produto de `docs/AUTH_SECURITY.md` e `docs/ACCOUNT_LIFECYCLE.md` permanecem válidas.
