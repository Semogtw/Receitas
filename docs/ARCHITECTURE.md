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
- **Arquivos de backup:** `@zip.js/zip.js`, gerados/lidos por streaming no cliente.
- **Hospedagem do frontend:** Cloudflare Pages Free.
- **Sync gerenciado:** PowerSync Cloud Free.
- **Backend gerenciado:** Supabase Free.

A arquitetura deve permanecer com **custo recorrente obrigatório de US$ 0**. Se um provedor gratuito deixar de atender o projeto, a primeira resposta deve ser reavaliar alternativas gratuitas compatíveis, não introduzir assinatura paga automaticamente.

A política detalhada de deploy, limites e operação está em [`DEPLOYMENT_OPERATIONS.md`](./DEPLOYMENT_OPERATIONS.md).

### Por que não Expo Web como base

A direção aprovada prioriza uma PWA Web de alta qualidade agora, sem carregar complexidade específica de uma futura distribuição nativa. A camada local-first é tratada como requisito central, não como melhoria posterior.

### Por que Cloudflare Pages para o frontend

O frontend é essencialmente estático e não precisa de runtime serverless próprio do host. Cloudflare Pages Free oferece CDN, builds suficientes para o projeto e requests de assets estáticos gratuitos/ilimitados documentados, mantendo o deploy simples e sem custo.

Vercel Hobby permanece como fallback técnico possível, não como dependência arquitetural.

## 3. Fonte de leitura da interface

A UI lê prioritariamente do banco local.

Fluxo conceitual:

```text
UI
 ↓
Banco local PowerSync
 ↓
CRUD queue + mutation_outbox semântico
 ↓
PowerSync uploadData
 ↓
Edge Function sync-mutation
 ↓
Supabase Postgres
```

O PowerSync continua responsável por persistência/sincronização local e sua fila CRUD. O `mutation_outbox` local-only adiciona a informação semântica que o produto precisa para preservar conflitos: `mutation_id`, entidade/ID, ator, `base_revision`, snapshot-base e payload local.

A ausência de internet não deve bloquear ações normais como consultar receitas, editar dados já disponíveis, planejar refeições ou marcar itens da lista de compras.

## 4. Escritas offline e aplicação remota

Alterações feitas offline são persistidas localmente imediatamente e entram no fluxo de sincronização.

Princípios:

- a interface não deve fingir que uma alteração foi enviada ao servidor quando ainda está apenas local;
- o usuário pode continuar trabalhando enquanto a sincronização está pendente;
- entidades criadas offline recebem UUID estável antes de chegar ao servidor;
- cada mutação editável registra a revisão/base conhecida sobre a qual foi criada;
- payloads do outbox são representações JSON-safe de persistência, não objetos de runtime como `File`, `Blob` ou DOM;
- cada mutação possui `mutation_id` estável para idempotência;
- falhas transitórias de rede geram retry, não perda de dados;
- o PowerSync só conclui a transação CRUD depois de obter resultado remoto durável para todos os itens correspondentes;
- ausência/corrupção do envelope semântico é erro de integridade, nunca autorização para cair em last-write-wins.

### 4.1 Dispatcher de mutações

A Edge Function `sync-mutation` recebe somente tipos de entidade explicitamente permitidos.

Ela:

1. autentica o usuário;
2. confirma associação ativa ao `pair_id`;
3. rejeita tipo de entidade fora da allowlist;
4. consulta `applied_mutations` pelo `mutation_id`;
5. se já aplicado, retorna o resultado anterior sem repetir a escrita;
6. se a revisão-base coincide, aplica a alteração e incrementa revisão;
7. se a revisão divergiu, executa comparação base/local/remoto;
8. auto-mescla somente alterações comprovadamente independentes;
9. em incompatibilidade, grava `conflicts` antes de confirmar o resultado ao cliente.

Nomes de tabela nunca são montados a partir de string arbitrária recebida do cliente; o dispatcher usa políticas/queries estáticas para cada tipo sincronizável.

A política detalhada de sincronização, retry, versionamento e conflitos está em [`SYNC.md`](./SYNC.md) e é normativa para a implementação. O plano técnico correspondente está em `docs/superpowers/plans/2026-08-07-03-local-first-sync.md`.

## 5. Conflitos

A política de produto exige preservação explícita de conflitos.

Não depender de last-write-wins para alterações concorrentes semanticamente incompatíveis.

Regra central:

> **Auto-merge somente quando a combinação puder ser demonstrada como segura. Havendo ambiguidade semântica, preservar todas as versões e criar um conflito explícito.**

Entidades editáveis carregam metadados suficientes para detectar que uma mutação foi produzida sobre uma base desatualizada.

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
4. a mídia entra em fila durável de upload;
5. quando online, o arquivo é enviado ao bucket privado;
6. metadados locais/remotos são reconciliados;
7. cópias locais podem continuar em cache conforme política de armazenamento.

A aplicação não deve bloquear o cadastro de um preparo apenas porque o upload de uma foto ainda não terminou.

A política de armazenamento local é **seletiva**, não uma duplicação obrigatória de toda a biblioteca: capas, miniaturas e mídia recente têm prioridade de cache; originais sincronizados permanecem no Storage privado e podem ser baixados sob demanda. Cada receita pode ser marcada como **Disponibilizar offline**, elevando seus dados e mídia à prioridade de retenção/download local.

Nunca remover a única cópia local de um arquivo enquanto o upload remoto ainda não tiver sido confirmado.

A especificação normativa de cache, download sob demanda e disponibilidade offline está em [`MEDIA_STORAGE.md`](./MEDIA_STORAGE.md).

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
- variáveis `VITE_*` são tratadas como públicas e nunca armazenam segredo.

### 7.4 Storage

- buckets de fotos são privados;
- acesso depende da associação ao par;
- URLs públicas permanentes para conteúdo pessoal não são o padrão;
- upload e leitura devem respeitar autorização equivalente à dos registros do banco;
- staging de restauração e backups de segurança também usam caminhos privados e vinculados ao par/job correto.

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

Operações privilegiadas previstas:

- consumo do bootstrap inicial;
- criação/aceitação de convite;
- `sync-mutation` para aplicação idempotente/versionada das mutações sincronizadas;
- importação de receita por URL;
- validação/staging/commit de restauração de backup;
- administração excepcional de identidade/membro;
- operações administrativas de exclusão definitiva quando exigirem privilégio;
- rotinas que precisem acessar segredos ou serviços externos;
- validações de consistência que não possam ser confiadas ao cliente.

**Geração/compactação do ZIP de backup não é uma Edge Function.** Ela acontece no cliente por streaming para evitar depender do limite de CPU das Edge Functions gratuitas e para aproveitar os dados já sincronizados/local-first.

## 10. Importação por URL

Parsing de páginas externas não deve depender exclusivamente do navegador do usuário, devido a CORS, variabilidade de HTML e necessidade de regras de segurança.

Fluxo preferido:

```text
PWA envia URL
     ↓
Edge Function valida DNS/IP e busca a página
     ↓
parser tenta dados estruturados primeiro
     ↓
fallback de extração quando necessário
     ↓
resultado estruturado retorna como rascunho
     ↓
usuário revisa antes de salvar
```

A função aplica validação rigorosa de URL, proteção SSRF inclusive após resolução DNS e redirects, timeout, limite de bytes/content-type e parsing inerte sem execução de HTML/scripts externos.

A especificação detalhada do importador está em [`IMPORTING.md`](./IMPORTING.md).

## 11. Backup e restauração

Backups usam formato portável e independente do banco interno sempre que razoável.

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

### 11.1 Geração do backup

Um backup rotulado como completo só é gerado quando a fila de sincronização conhecida está drenada. Assim, ele representa uma cópia canônica consistente e não ignora mutações locais pendentes.

Fluxo:

```text
snapshot local sincronizado
      +
originais baixados do Storage privado
      ↓
Zip.js por streams
      ↓
OPFS quando disponível
      ↓
arquivo .zip para download/compartilhamento
```

- JSONs pequenos podem ser comprimidos normalmente;
- fotos/originais já comprimidos são armazenados no ZIP sem recompressão desnecessária;
- cada entrada possui tamanho e SHA-256 no manifesto;
- OPFS é preferido para não manter backups grandes inteiros na heap JS;
- fallback por `Blob` existe apenas abaixo de um limite de memória testado; acima dele o app falha de modo explícito em vez de omitir mídia;
- o backup nunca contém senha, sessão, token, segredo de bootstrap ou credencial de provedor.

### 11.2 Restauração

Restauração usa duas fases:

1. **preflight/staging:** o cliente lê o ZIP por stream, valida localmente e envia dados/mídias em lotes para staging privado; cada lote é revalidado no servidor;
2. **commit:** somente um job cujo manifesto inteiro, hashes, tamanhos, referências e regras de identidade passaram na validação fica `ready_to_commit`.

Nenhuma linha canônica é alterada durante preflight.

A restauração oferece:

- **Mesclar:** IDs estáveis identificam entidades; dados idênticos não fazem nada, ausentes são inseridos e divergências reais usam o sistema normal de conflitos;
- **Substituir tudo:** antes do commit destrutivo, o cliente gera automaticamente um backup completo do estado atual, o torna disponível ao usuário, envia a mesma cópia para staging privado e o servidor exige que esse safety backup também esteja validado.

Mídias validadas podem ser promovidas/copied para chaves finais antes da transação estruturada; se a transação falhar, objetos órfãos permanecem não referenciados e entram em limpeza de job, sem produzir estado canônico parcial.

A especificação normativa está em [`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md). O plano técnico detalhado está em `docs/superpowers/plans/2026-08-07-06-import-backup-diagnostics.md`.

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

## 14. Operação gratuita e hibernação

Supabase Free e PowerSync Cloud Free podem pausar/desativar projetos após aproximadamente uma semana de inatividade, conforme os planos atuais.

Isso é aceito como trade-off do requisito de custo zero porque:

- dados já locais continuam consultáveis;
- mutações podem permanecer na fila local;
- uploads sem confirmação permanecem protegidos localmente;
- os serviços podem ser retomados e a sincronização continuar depois.

Não gerar keep-alive artificial para contornar políticas de gratuidade.

O runbook de operação e retomada deve ser mantido em `DEPLOYMENT_OPERATIONS.md` e refinado no primeiro deploy real.

## 15. Testes

A estratégia técnica de testes está em [`TESTING.md`](./TESTING.md).

Direção:

- Vitest para domínio/unidade/integração;
- Testing Library para comportamento de componentes;
- Playwright para E2E, WebKit/mobile e cenários offline;
- QA renderizado com @Build Web Apps quando disponível;
- testes de RLS/backend e Codex Security nas superfícies sensíveis.

Build ou typecheck isolados não são suficientes para considerar uma feature concluída.

## 16. Restrições arquiteturais

- Sem cadastro público.
- Sem segredo de bootstrap no frontend.
- Sem backend de autorização implementado apenas no frontend.
- Sem banco remoto como dependência para toda renderização.
- Sem sobrescrita silenciosa de conflitos reais.
- Sem auto-merge quando for necessário interpretar intenção humana.
- Sem caminho de escrita de domínio que contorne o envelope versionado/dispatcher de mutação.
- Sem uploads públicos por padrão.
- Sem depender do cache local como única cópia de mídia sincronizada.
- Sem arquitetura multi-tenant genérica para vários pares.
- Sem serviço pago obrigatório.
- Sem keep-alive artificial apenas para contornar hibernação de plano gratuito.
- Sem gerar backups completos em runtime servidor quando o streaming client-side cumpre o requisito com menor custo/risco operacional.
