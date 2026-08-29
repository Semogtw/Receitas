# Estado de desenvolvimento — 2026-08-29

Checkpoint operacional do projeto **Receitas**.

Não há pull request aberta observada neste repositório no momento deste snapshot. A `main` é a fonte de verdade da documentação e do planejamento atual.

## Estado executivo

- **Design:** aprovado.
- **Roadmap de implementação:** concluído e organizado em sete planos.
- **Implementação de produto:** **ainda não iniciada** no estado documentado.
- **Próximo passo canônico:** executar `docs/superpowers/plans/2026-08-07-01-foundation-pwa.md`.
- **Fonte de verdade do processo:** `docs/superpowers/STATUS.md`.

A regra principal de continuidade é simples: **não transformar documentação detalhada em claim de código existente**. O projeto possui arquitetura e comportamento planejados com bastante profundidade, mas isso não significa que PWA, Supabase, PowerSync, auth, sync ou deploy já estejam implementados.

## Objetivo do produto

Aplicativo privado de receitas para **exatamente duas pessoas**, pensado para uso doméstico cotidiano.

O produto deve permitir:

- cadastrar e organizar receitas;
- cozinhar com modo dedicado;
- registrar preparos;
- fotos/mídia;
- planejamento de refeições;
- listas de compras;
- busca e filtros;
- funcionamento offline;
- sincronização segura entre o par;
- importação;
- backup e restauração.

Não é uma rede social, SaaS público, plataforma de grupos ou produto comercial multi-tenant.

## Invariantes de produto

### Exatamente duas pessoas

O par é unidade do produto e da segurança.

Evitar generalizar prematuramente para:

- organizações;
- workspaces;
- famílias arbitrárias;
- times;
- grupos públicos;
- RBAC complexo.

Se algum requisito futuro realmente exigir expansão, tratar como mudança de arquitetura, não como “só adicionar array de membros”.

### Local-first

A UI deve continuar útil sem conexão.

Isso implica:

- reads locais rápidos;
- mutações locais representáveis offline;
- fila/outbox ou mecanismo equivalente;
- retries idempotentes;
- convergência ao voltar online;
- conflitos explícitos onde não há merge seguro.

Offline não deve significar apenas “service worker abre a tela”. Os dados essenciais do uso cotidiano precisam existir localmente conforme os planos de sync/media.

### Sem perda silenciosa

Quando os dois usuários editarem estado incompatível:

- preservar ambos os lados quando necessário;
- apresentar conflito compreensível;
- não escolher arbitrariamente o último timestamp se isso puder destruir intenção;
- registrar versão/identidade suficiente para retries e resolução.

### Custo obrigatório zero

O projeto foi desenhado com requisito de **US$ 0 de custo recorrente obrigatório**.

Isso não significa escolher sempre a tecnologia “mais barata” sem critério; significa manter uma arquitetura que funcione dentro de tiers gratuitos adequados ao uso de duas pessoas.

Antes de adicionar serviço:

1. verificar se possui free tier compatível;
2. verificar limites que podem bloquear uso normal;
3. evitar dependência cujo free tier seja apenas trial;
4. documentar fallback/migração quando o serviço puder hibernar ou mudar limites;
5. não incluir API paga como requisito para CRUD básico.

## Direção visual

A experiência deve lembrar um **caderno/livro de receitas moderno**, não um dashboard SaaS genérico.

Evitar:

- cards uniformes demais sem hierarquia editorial;
- grids de métricas;
- excesso de badges;
- gradientes/efeitos apenas para parecer “AI generated”; 
- sidebar de administração desnecessária;
- tabela como padrão para conteúdo culinário.

Priorizar:

- fotos e conteúdo;
- tipografia legível;
- hierarquia de ingredientes/passos;
- estados de preparo claros;
- toque confortável no celular;
- navegação simples;
- feedback offline/sync discreto, mas compreensível.

Owners: `docs/UX.md` e `docs/FRONTEND.md`.

## Arquitetura planejada

A documentação atual prevê uma stack baseada em:

- React;
- Vite/PWA;
- Supabase;
- PostgreSQL/RLS;
- Storage privado;
- PowerSync para sincronização local-first;
- Vitest/Testing Library;
- Playwright;
- Cloudflare Pages no desenho de deploy gratuito.

Essas tecnologias são **planejadas**, não evidência de implementação já existente.

## Roadmap de implementação

### Fase 1 — Foundation PWA

Plano: `2026-08-07-01-foundation-pwa.md`.

Objetivos:

- scaffold React/Vite;
- PWA;
- design tokens;
- layout/navegação;
- componentes fundamentais;
- testes de navegador básicos;
- estados offline/UI de fundação.

Essa é a próxima ação correta. Não começar por backend complexo antes da UI/fundação e contratos mínimos definidos no plano.

### Fase 2 — Backend, auth e dados

Plano: `2026-08-07-02-backend-auth-data.md`.

Objetivos:

- Supabase;
- schema;
- RLS;
- bootstrap do par;
- convite;
- autenticação;
- Storage privado.

Segurança precisa refletir “duas pessoas” no banco, não apenas esconder rotas na UI.

### Fase 3 — Local-first sync

Plano: `2026-08-07-03-local-first-sync.md`.

Objetivos:

- PowerSync;
- mutações offline;
- idempotência;
- retry;
- resolução de conflitos;
- convergência.

Este é um dos maiores riscos técnicos do projeto e deve receber testes de rede instável/process restart, não apenas happy path.

### Fase 4 — Recipes, cooking e media

Plano: `2026-08-07-04-recipes-cooking-media.md`.

Objetivos:

- CRUD de receitas;
- ingredientes/quantidades;
- conversões;
- histórico de preparo;
- modo cozinha;
- timers;
- fotos;
- disponibilidade offline de mídia conforme política.

### Fase 5 — Planning, shopping e search

Plano: `2026-08-07-05-planning-shopping-search.md`.

Objetivos:

- planejador;
- múltiplas listas de compras;
- lista padrão;
- consolidação de ingredientes;
- busca local;
- filtros;
- ordenação.

### Fase 6 — Import, backup e diagnostics

Plano: `2026-08-07-06-import-backup-diagnostics.md`.

Objetivos:

- importar receita por URL/texto;
- validação segura;
- export/backup;
- restore;
- lifecycle excepcional de conta;
- diagnósticos privados.

### Fase 7 — Hardening, deploy e release

Plano: `2026-08-07-07-hardening-deploy-release.md`.

Objetivos:

- segurança;
- acessibilidade;
- performance;
- deploy gratuito;
- runbooks;
- recuperação;
- release.

## Modelo de dados

Owner: `docs/DATA_MODEL.md`.

Princípios esperados:

- IDs estáveis;
- timestamps/versionamento suficientes para sync;
- relações explícitas;
- separação entre receita, histórico de preparo, planejamento e lista de compras;
- mídia referenciada sem transformar blob em estado relacional pesado;
- deletion/restore pensados junto de sincronização.

Antes de criar migration, conferir o plano atual e evitar inventar entidade que já esteja definida na documentação.

## Auth e segurança

Owner: `docs/AUTH_SECURITY.md`.

O app é privado, mas isso não reduz a necessidade de segurança.

Preservar:

- RLS real;
- bootstrap fechado;
- convite limitado ao segundo membro;
- Storage privado;
- nenhuma URL pública permanente para mídia privada;
- sessão/refresh tratados pelas ferramentas apropriadas;
- nenhum secret de backend no bundle do navegador.

A UI saber que “só existem duas pessoas” não substitui policy no banco.

## Account lifecycle

Owner: `docs/ACCOUNT_LIFECYCLE.md`.

A arquitetura precisa distinguir:

- logout;
- limpeza de estado local;
- remoção excepcional de identidade;
- substituição administrativa quando prevista;
- preservação/transferência dos dados do par.

Não reabrir o app para membership arbitrário só para resolver um caso de recuperação.

## Sincronização

Owner: `docs/SYNC.md`.

Testes importantes quando implementada:

- A offline edita, B online edita;
- dois edits compatíveis;
- edits incompatíveis;
- retry após resposta perdida;
- app fecha com outbox pendente;
- reconnect;
- servidor rejeita mutação;
- clock local errado;
- mídia disponível em um aparelho e ausente no outro;
- delete concorrente com edit.

## Mídia

Owner: `docs/MEDIA_STORAGE.md`.

Objetivo é uma experiência local-first sem transformar o celular em cache ilimitado.

Definir/testar:

- thumbnail vs original;
- política de download;
- cache;
- eviction;
- upload interrompido;
- mídia usada em histórico;
- comportamento offline;
- privacidade do Storage.

## Modo cozinha

Owner: `docs/COOKING_MODE.md`.

O modo cozinha deve ser uma experiência própria, não apenas a tela de detalhes com fonte maior.

Considerar:

- ingredientes necessários;
- passos;
- progresso da sessão;
- timers;
- tela ligada/retomada;
- reload/crash;
- registro do preparo terminado;
- cancelamento;
- uso com uma mão e tela pequena.

## Listas de compras

Owner: `docs/SHOPPING_LISTS.md`.

O produto prevê múltiplas listas nomeadas e uma padrão.

Preservar:

- origem dos itens quando gerados de planejamento/receita;
- consolidação compreensível;
- edição manual;
- checked state local-first;
- conflitos entre os dois usuários;
- unidade/quantidade sem conversão silenciosa incorreta.

## Busca e filtros

Owner: `docs/SEARCH_FILTERS.md`.

A busca deve funcionar localmente para o corpus doméstico.

Não adicionar serviço externo de busca sem necessidade. O volume para duas pessoas deve favorecer simplicidade, baixo custo e disponibilidade offline.

## Importação

Owner: `docs/IMPORTING.md`.

Importação por URL/texto deve ser tratada como entrada não confiável.

Regras:

- parser bounded;
- sanitização;
- preview/revisão antes de persistir quando necessário;
- nenhum HTML/script remoto executado como parte do conteúdo;
- falha parcial não cria receita “pronta” silenciosamente;
- usuário pode corrigir campos antes de salvar.

## Backup e restore

Owner: `docs/BACKUP_RESTORE.md`.

Backup não deve ser adiado para “depois da release”, porque o produto é pessoal e os dados acumulam valor.

Exigir:

- formato versionado;
- validação antes de restore;
- modo seguro para merge/substituição conforme especificado;
- IDs/conflitos tratados explicitamente;
- mídia com política clara;
- teste de round-trip.

## Observabilidade

Owner: `docs/OBSERVABILITY.md`.

O projeto não precisa de analytics comportamental invasivo.

Preferir:

- erros acionáveis;
- logs locais/sanitizados;
- diagnóstico privado;
- estado de sync visível quando necessário;
- nenhuma captura desnecessária de conteúdo de receita/usuário.

## Deploy e operação

Owner: `docs/DEPLOYMENT_OPERATIONS.md`.

Direção atual:

- Cloudflare Pages;
- Supabase Free;
- PowerSync Free dentro dos limites adequados;
- estratégia para hibernação/limites;
- custo recorrente obrigatório zero.

Antes de release, verificar limites atuais dos serviços; documentação de agosto de 2026 não deve ser tratada como garantia eterna de pricing/free tier.

## Testes

Owner: `docs/TESTING.md`.

Estratégia planejada:

- unit;
- component;
- integration;
- Playwright;
- offline/network cases;
- segurança/RLS;
- backup/restore;
- sync/conflicts;
- acessibilidade;
- mobile layout.

Não considerar service worker/PWA “pronto” apenas porque build gera manifest.

## Ferramentas e agentes

Owners:

- `docs/TOOLS_AND_PLUGINS.md`;
- `docs/DEVELOPMENT_WORKFLOW.md`.

Princípios:

- usar ferramentas especializadas conforme responsabilidade;
- preservar custo zero como requisito;
- documentação é fonte de verdade durável;
- decisões de UI devem seguir UX/FRONTEND, não templates genéricos;
- ImageGen não faz parte do fluxo visual por padrão sem nova autorização específica documentada;
- agentes devem continuar trabalhando até um checkpoint coerente, com testes e docs sincronizados.

## Primeira sessão de implementação — ordem recomendada

Ao iniciar o código pela primeira vez:

1. ler `docs/superpowers/STATUS.md`;
2. ler `docs/DEVELOPMENT_WORKFLOW.md`;
3. ler `docs/TOOLS_AND_PLUGINS.md`;
4. ler `docs/FRONTEND.md` e `docs/UX.md`;
5. ler o roadmap mestre;
6. executar somente o plano `01-foundation-pwa` inicialmente;
7. estabelecer testes/CI mínimos sem antecipar backend;
8. criar a primeira experiência navegável com design system coerente;
9. rodar gates;
10. atualizar STATUS antes de iniciar fase 2.

## O que NÃO fazer na fase 1

- implementar Supabase inteiro antes da fundação PWA;
- adicionar PowerSync antes de existir modelo/fluxo básico;
- criar abstração multi-tenant;
- implementar IA de receita;
- adicionar analytics;
- criar dashboard admin;
- antecipar importador complexo;
- inventar backend próprio para substituir serviços planejados sem motivo;
- marcar fases 2–7 como “em andamento” porque interfaces/types foram esboçados.

## Definition of Done da fase 1

Seguir o plano canônico, mas como resumo, esperar:

- app React/Vite inicializado;
- PWA configurada e testada no escopo planejado;
- tokens/design foundation;
- navegação principal;
- layout mobile-first;
- estados vazios/loading/error coerentes;
- testes essenciais;
- build verde;
- Playwright/smoke relevante;
- docs/STATUS atualizados;
- nenhum backend fictício apresentado como funcional.

## Definition of Done do produto

Muito depois da fase 1, release real exige:

- auth/RLS do par;
- sync local-first robusto;
- CRUD de receitas;
- cooking mode;
- mídia;
- planning/shopping/search;
- import;
- backup/restore testado;
- offline real;
- conflict handling;
- acessibilidade/performance;
- deploy dentro da estratégia de custo;
- runbooks/diagnostics;
- uso real pelos dois usuários sem perda de dados.

## Fontes de verdade

- `README.md` — apresentação/status de alto nível;
- `docs/superpowers/STATUS.md` — estado do processo;
- `docs/superpowers/specs/2026-08-07-receitas-design.md` — design consolidado;
- `docs/superpowers/plans/2026-08-07-receitas-roadmap.md` — roadmap mestre;
- planos `01`–`07` — execução por fase;
- `docs/PRODUCT.md` — comportamento;
- `docs/ARCHITECTURE.md` — arquitetura;
- `docs/DATA_MODEL.md` — dados;
- `docs/UX.md` / `docs/FRONTEND.md` — experiência;
- docs específicos de sync/auth/media/cooking/shopping/search/import/backup/observability/deploy/testing.

## Regra de atualização deste snapshot

Quando a implementação começar, este documento precisa deixar de dizer “implementação ainda não iniciada”. A primeira sessão que produzir código deve atualizar `docs/superpowers/STATUS.md` e, se este snapshot continuar sendo usado como entrada de continuidade, registrar o commit inicial, gates observados e fase ativa sem antecipar fases futuras.