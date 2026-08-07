# Arquitetura

> Documento vivo. Registra decisões técnicas já aprovadas e deve ser atualizado junto das decisões de produto.

## 1. Direção geral

O aplicativo será uma **PWA privada, mobile-first e local-first**.

A interface deve continuar funcional sem conexão. O backend existe para autenticação, sincronização entre os dois usuários, armazenamento remoto, operações privilegiadas e recuperação/portabilidade dos dados.

## 2. Stack aprovada

- **Frontend:** React + TypeScript + Vite.
- **PWA:** manifest, service worker e instalação pela tela inicial.
- **Banco local/sincronização:** PowerSync, usando armazenamento local persistente adequado à Web.
- **Backend:** Supabase.
- **Banco remoto:** Supabase Postgres.
- **Autenticação:** Supabase Auth com e-mail e senha.
- **Mídia:** Supabase Storage em buckets privados.
- **Operações privilegiadas:** Supabase Edge Functions quando a lógica não deve residir no cliente.

### Por que não Expo Web como base

A direção aprovada prioriza uma PWA Web de alta qualidade agora, sem carregar complexidade específica de uma futura distribuição nativa. A camada local-first é tratada como requisito central, não como melhoria posterior.

## 3. Fonte de leitura da interface

A UI lê prioritariamente do banco local.

Fluxo conceitual:

```text
UI
 ↓
Banco local
 ↓
Fila de mutações / sincronização
 ↓
PowerSync + Supabase
 ↓
Postgres remoto
```

A ausência de internet não deve bloquear ações normais como consultar receitas, editar dados já disponíveis, planejar refeições ou marcar itens da lista de compras.

## 4. Escritas offline

Alterações feitas offline são persistidas localmente imediatamente e entram no fluxo de sincronização.

Princípios:

- a interface não deve fingir que uma alteração foi enviada ao servidor quando ainda está apenas local;
- o usuário pode continuar trabalhando enquanto a sincronização está pendente;
- operações devem ser idempotentes sempre que possível;
- falhas transitórias de rede geram retry, não perda de dados;
- estados de sincronização importantes devem ser observáveis pela interface;
- entidades que precisam ser criadas offline recebem IDs estáveis antes de chegar ao servidor;
- cada mutação editável deve carregar informação suficiente sobre a versão/base conhecida sobre a qual foi criada.

A política detalhada de sincronização, retry, versionamento e conflitos está em [`SYNC.md`](./SYNC.md) e é normativa para a implementação.

## 5. Conflitos

A política de produto exige preservação explícita de conflitos.

Não depender de last-write-wins para alterações concorrentes semanticamente incompatíveis.

Regra central:

> **Auto-merge somente quando a combinação puder ser demonstrada como segura. Havendo ambiguidade semântica, preservar todas as versões e criar um conflito explícito.**

Entidades editáveis devem carregar metadados suficientes para detectar que uma mutação foi produzida sobre uma base desatualizada.

Quando a alteração concorrente atingir campos ou entidades semanticamente independentes, o sistema pode mesclar automaticamente desde que a união seja determinística e não viole invariantes. Exemplos incluem avaliações pessoais distintas de um mesmo preparo e alterações em campos realmente independentes da receita.

Quando houver sobreposição ou ambiguidade — como duas alterações diferentes no mesmo campo, no mesmo ingrediente/etapa, exclusão concorrendo com edição ou reordenações incompatíveis — o sistema deve:

1. preservar a versão local;
2. preservar a versão remota concorrente;
3. criar registro de conflito;
4. manter uma versão estável disponível para leitura;
5. permitir resolução por escolha ou mesclagem campo a campo;
6. registrar a resolução sem apagar imediatamente as versões anteriores.

Conflitos não bloqueiam o restante do aplicativo e podem ser resolvidos posteriormente.

A especificação completa está em [`SYNC.md`](./SYNC.md).

## 6. Mídia local-first

Fotos são tratadas separadamente dos metadados estruturados.

Fluxo esperado:

1. usuário seleciona/tira uma foto;
2. o arquivo recebe uma referência local imediata;
3. o registro relacionado pode ser salvo offline;
4. a mídia entra em fila de upload;
5. quando online, o arquivo é enviado ao bucket privado;
6. metadados locais/remotos são reconciliados;
7. cópias locais podem continuar em cache conforme política de armazenamento.

A aplicação não deve bloquear o cadastro de um preparo apenas porque o upload de uma foto ainda não terminou.

A política de armazenamento local é **seletiva**, não uma duplicação obrigatória de toda a biblioteca: capas, miniaturas e mídia recente têm prioridade de cache; originais sincronizados permanecem no Storage privado e podem ser baixados sob demanda. Cada receita pode ser marcada como **Disponibilizar offline**, elevando seus dados e mídia à prioridade de retenção/download local.

Nunca remover a única cópia local de um arquivo enquanto o upload remoto ainda não tiver sido confirmado.

A especificação normativa de cache, download sob demanda e disponibilidade offline está em [`MEDIA_OFFLINE.md`](./MEDIA_OFFLINE.md).

## 7. Segurança

A especificação normativa de autenticação, bootstrap, convites e fechamento do app está em [`AUTH_SECURITY.md`](./AUTH_SECURITY.md).

### 7.1 Unidade de autorização

O **par** é a unidade de segurança.

Praticamente toda entidade compartilhada possui `pair_id` ou é alcançável de forma inequívoca por uma entidade com `pair_id`.

Regra conceitual:

```text
usuário autenticado
        ↓
é membro do pair_id?
   ↓ sim       ↓ não
 acesso       negar
```

### 7.2 RLS

Row Level Security deve existir nas tabelas compartilhadas do Supabase.

O frontend nunca é considerado autoridade para autorização. Mesmo que alguém descubra endpoints, IDs ou a chave pública do projeto, operações fora do par devem ser rejeitadas pelo backend.

### 7.3 Segredos

- `service_role` e demais segredos administrativos nunca entram no bundle da PWA.
- O segredo de bootstrap nunca entra no bundle da PWA nem no armazenamento local do cliente.
- Operações administrativas ficam em ambiente servidor/Edge Function.
- Chaves públicas próprias do cliente são tratadas como públicas e protegidas por RLS, não por obscuridade.

### 7.4 Storage

- buckets de fotos são privados;
- acesso depende da associação ao par;
- URLs públicas permanentes para conteúdo pessoal não são o padrão;
- upload e leitura devem respeitar autorização equivalente à dos registros do banco.

## 8. Formação fechada do par

Não existe cadastro público.

O fluxo aprovado é:

1. enquanto o sistema ainda não foi inicializado, um **bootstrap único protegido por segredo servidor** cria a primeira conta/membro e o `pair`;
2. o bootstrap é marcado como consumido e passa a ser rejeitado permanentemente;
3. o primeiro membro pode gerar um convite de uso único e com expiração para a segunda pessoa;
4. a segunda conta é criada/associada somente por meio desse convite válido;
5. a associação é criada atomicamente;
6. o convite é consumido;
7. ao atingir dois membros, o `pair` passa ao estado fechado e novas adesões são rejeitadas pelo backend.

O fechamento é uma invariante de backend. Esconder tela, rota ou botão não é considerado controle de segurança.

## 9. Edge Functions previstas

Operações candidatas a funções privilegiadas:

- consumo do bootstrap inicial;
- criação/aceitação de convite;
- importação de receita por URL;
- geração e restauração de backup;
- operações administrativas de exclusão definitiva;
- rotinas que precisem acessar segredos ou serviços externos;
- validações de consistência que não possam ser confiadas ao cliente.

## 10. Importação por URL

Parsing de páginas externas não deve depender exclusivamente do navegador do usuário, devido a CORS, variabilidade de HTML e necessidade de regras de segurança.

Fluxo preferido:

```text
PWA envia URL
     ↓
Edge Function valida e busca a página
     ↓
parser tenta dados estruturados primeiro
     ↓
fallback de extração quando necessário
     ↓
resultado estruturado retorna como rascunho
     ↓
usuário revisa antes de salvar
```

A função deve aplicar proteções contra abuso de fetch do lado servidor, incluindo validação rigorosa de URL e prevenção de SSRF.

A especificação detalhada do importador está em [`IMPORTING.md`](./IMPORTING.md).

## 11. Backup e restauração

Backups devem usar formato portável e independente do banco interno sempre que razoável.

Estrutura conceitual:

```text
backup.zip
├── manifest.json
├── data/
│   ├── recipes.json
│   ├── categories.json
│   ├── cooking-sessions.json
│   ├── meal-plan.json
│   └── ...
└── media/
    └── ...
```

Restauração deve validar versão do formato, integridade básica, associações e pertencimento antes de inserir dados.

A restauração oferece os modos **Mesclar** e **Substituir tudo**. O segundo exige a geração e validação de um backup de segurança do estado atual antes de qualquer alteração destrutiva. A especificação normativa está em [`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md).

## 12. Exclusão lógica

Entidades recuperáveis usam soft delete, normalmente via `deleted_at` ou mecanismo equivalente.

A sincronização precisa propagar exclusões lógicas como estado, em vez de interpretar ausência remota como autorização para destruir cópias locais imediatamente.

Exclusão concorrendo com edição da mesma entidade deve ser tratada como conflito, não como vitória automática da exclusão ou da edição.

## 13. Estado de conectividade

A experiência deve diferenciar pelo menos:

- sincronizado;
- alterações locais pendentes;
- sincronizando;
- falha temporária;
- conflito aguardando resolução.

O aplicativo não deve transformar conectividade em um banner permanente ou intrusivo quando tudo estiver normal.

## 14. Restrições arquiteturais

- Sem cadastro público.
- Sem segredo de bootstrap no frontend.
- Sem backend de autorização implementado apenas no frontend.
- Sem banco remoto como dependência para toda renderização.
- Sem sincronização própria improvisada quando PowerSync cobrir o caso com confiabilidade.
- Sem sobrescrita silenciosa de conflitos reais.
- Sem auto-merge quando for necessário interpretar intenção humana.
- Sem uploads públicos por padrão.
- Sem depender do cache local como única cópia de mídia sincronizada.
- Sem arquitetura multi-tenant genérica para vários pares.
