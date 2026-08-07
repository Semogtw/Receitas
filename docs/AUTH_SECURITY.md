# Autenticação e Fechamento do Aplicativo

> Especificação normativa da formação do par e das superfícies de criação de conta. O objetivo é manter o produto fechado para exatamente duas pessoas sem depender de obscuridade da URL ou de controles apenas no frontend.

## 1. Princípio central

O aplicativo não possui cadastro público.

Existem somente dois caminhos legítimos de criação de conta/membro dentro do ciclo de vida normal do produto:

1. **bootstrap inicial**, que cria a primeira conta e o primeiro `pair`;
2. **convite de uso único**, que permite a entrada da segunda pessoa.

Depois que o segundo membro entra, o sistema fica fechado para novas contas/membros pelo fluxo do aplicativo.

## 2. Bootstrap inicial

O bootstrap existe apenas enquanto ainda não há par inicializado.

Regras:

- exige um **segredo de configuração de alta entropia** conhecido apenas pelo operador do projeto;
- o segredo nunca pode ser incluído no bundle público da PWA, em código-fonte servido ao navegador ou em logs expostos ao cliente;
- a validação acontece em ambiente servidor/Edge Function;
- a operação deve criar de forma atômica o primeiro usuário/membro e o `pair` correspondente, ou falhar sem deixar estado intermediário utilizável;
- após sucesso, o backend registra que o bootstrap foi consumido;
- depois de consumido, novas tentativas de bootstrap são rejeitadas mesmo que alguém descubra a rota ou possua uma cópia antiga do segredo;
- o frontend não é autoridade para decidir se o bootstrap está aberto ou fechado.

O fechamento do bootstrap é uma **invariante de backend**, não uma condição de interface.

## 3. Convite do segundo membro

Depois do bootstrap, somente o primeiro membro pode iniciar o fluxo que cria o convite para a segunda pessoa.

O convite deve:

- usar token imprevisível e de uso único;
- possuir expiração;
- estar vinculado ao `pair` correto;
- ser invalidado assim que consumido;
- ser recusado se o par já possuir dois membros ativos;
- não poder ser reaproveitado para criar outra conta ou outro vínculo;
- ter aceitação validada no backend.

A criação da segunda conta e a associação ao par devem ser tratadas de forma que duas aceitações concorrentes não consigam ultrapassar o limite de dois membros.

## 4. Fechamento definitivo do par

Quando o segundo membro é associado com sucesso:

- o `pair` passa ao estado fechado;
- qualquer convite ainda pendente é invalidado;
- novas tentativas de criação de membro são rejeitadas pelo backend;
- não existe botão, endpoint de produto ou fluxo normal para “adicionar terceira pessoa”;
- remover um membro, caso um fluxo administrativo venha a existir, **não reabre automaticamente o cadastro** nem cria uma vaga reutilizável sem uma decisão explícita de produto.

A regra de exatamente duas pessoas é uma invariante de domínio e de autorização.

## 5. Superfície pública

É aceitável que a PWA e a tela de login sejam publicamente alcançáveis na Internet. Segurança não depende de esconder o endereço.

O que não deve existir publicamente:

- formulário genérico de cadastro;
- endpoint cliente capaz de criar usuários arbitrários;
- chave administrativa;
- segredo de bootstrap;
- tokens de convite em logs públicos;
- autorização baseada somente em componentes ocultos ou rotas escondidas.

Descobrir o endereço do aplicativo não deve ser suficiente para ganhar acesso aos dados ou criar uma conta.

## 6. Autorização depois do login

Autenticação identifica o usuário; autorização depende da associação ao `pair`.

Para dados compartilhados, a regra conceitual é:

```text
usuário autenticado
        ↓
pertence ao pair_id do recurso?
   ↓ sim              ↓ não
 permitir             negar
```

RLS e validações de backend permanecem obrigatórias mesmo com somente dois usuários conhecidos.

## 7. Convites e vazamento de token

O token de convite deve ser tratado como credencial temporária.

Boas propriedades exigidas:

- alta entropia;
- vida útil limitada;
- uso único;
- armazenamento seguro no backend;
- comparação/validação que não dependa do frontend;
- invalidação imediata após consumo;
- ausência de dados pessoais sensíveis no próprio token quando isso não for necessário.

Se um token expirar ou for invalidado, o primeiro membro pode gerar outro enquanto o par ainda possuir apenas um membro.

## 8. Recuperação de senha

Cada uma das duas contas existentes pode recuperar o próprio acesso por **redefinição de senha via e-mail**.

Esse fluxo é estritamente de recuperação de identidade já existente e **não é uma superfície de cadastro**.

Regras:

- solicitar recuperação para um e-mail não cria usuário, `pair`, convite ou associação nova;
- somente uma conta já existente pode concluir a redefinição de senha;
- concluir a recuperação mantém o mesmo `user_id` e a mesma associação ao `pair`;
- a recuperação nunca aumenta o número de membros do par;
- o fluxo continua disponível mesmo depois que o par está fechado;
- tokens/links de recuperação devem ter validade limitada e ser invalidados conforme as garantias do provedor de autenticação;
- mensagens públicas de solicitação devem evitar revelar desnecessariamente se determinado e-mail possui conta, quando isso puder ser feito sem prejudicar a experiência;
- redefinir a senha não deve reabrir bootstrap, convite ou qualquer outra capacidade de criação de conta;
- o plano de implementação deve verificar o comportamento de sessões existentes após troca de senha e adotar a opção mais segura oferecida pelo provedor.

A recuperação de senha é, portanto, compatível com o princípio de exatamente duas pessoas: ela restaura acesso a uma identidade existente, não cria uma nova identidade autorizada.

## 9. Rate limiting e abuso

Rotas sensíveis como login, bootstrap, criação/aceitação de convite e recuperação de credenciais devem ser protegidas contra tentativas automatizadas em volume.

A estratégia exata pode combinar limites do provedor e controles adicionais no backend, mas a ausência de cadastro público **não elimina** a necessidade de proteger superfícies de autenticação contra abuso.

## 10. Sessão e armazenamento no cliente

- tokens de sessão nunca são tratados como autorização absoluta fora das regras de backend;
- dados locais pertencem a um usuário autenticado e ao `pair` correspondente;
- logout deve impedir que outro usuário que abra o mesmo navegador veja o conteúdo privado apenas por navegar na interface;
- o plano de implementação deve definir limpeza/isolamento do armazenamento local por identidade para evitar mistura de dados entre sessões;
- segredos administrativos nunca são persistidos no armazenamento local da PWA.

## 11. Operações privilegiadas

Devem permanecer em ambiente servidor/Edge Function, entre outras:

- consumo do bootstrap;
- criação e aceitação de convite;
- qualquer operação que use `service_role` ou segredo equivalente;
- exclusão definitiva de conteúdo quando exigir privilégio adicional;
- importação de URL quando envolver fetch servidor;
- geração/restauração de backup quando exigir acesso abrangente a dados/mídia.

## 12. Invariantes que testes devem cobrir

No mínimo:

1. bootstrap funciona antes da inicialização e falha depois de consumido;
2. segredo incorreto não cria usuário nem `pair`;
3. convite válido adiciona somente o segundo membro;
4. o mesmo convite não pode ser consumido duas vezes;
5. convites expirados são recusados;
6. duas aceitações concorrentes não criam terceiro membro;
7. usuário autenticado fora do `pair` não lê nem altera dados;
8. possuir a URL da PWA não permite cadastro;
9. possuir a chave pública do cliente não contorna RLS;
10. fechamento do par é aplicado no backend, não apenas na interface;
11. recuperação de senha funciona para conta existente sem criar nova identidade ou novo membro;
12. solicitação de recuperação para endereço sem conta não cria usuário;
13. redefinição de senha preserva `user_id` e associação ao `pair`;
14. recuperação de senha não reabre bootstrap nem capacidade de convite após fechamento do par.

## 13. Relação com outros documentos

- Requisitos funcionais: `docs/PRODUCT.md`.
- Arquitetura e RLS: `docs/ARCHITECTURE.md`.
- Modelo das entidades `pairs`, `pair_members` e `pair_invites`: `docs/DATA_MODEL.md`.
- Política de sincronização: `docs/SYNC.md`.
