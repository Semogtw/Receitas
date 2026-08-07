# Receitas

Aplicativo pessoal de receitas para exatamente duas pessoas, pensado como PWA privada, local-first e compartilhada.

## Objetivo

Criar um aplicativo doméstico completo para cadastrar, cozinhar, organizar e planejar receitas em conjunto, com histórico visual dos preparos, funcionamento offline e sincronização entre os dois usuários.

Este projeto **não** é uma plataforma multiusuário, não possui grupos públicos e não tem objetivo de distribuição comercial. O produto é desenhado especificamente para um único par de usuários.

## Princípios

- **Exatamente duas pessoas:** o par é a unidade de segurança e compartilhamento.
- **Local-first:** a interface trabalha sobre dados locais e continua útil sem internet.
- **Sincronização segura:** alterações são sincronizadas quando houver conexão.
- **Sem perda silenciosa:** conflitos de edição são preservados e resolvidos explicitamente.
- **Dados portáveis:** backup e restauração fazem parte do produto.
- **PWA privada:** sem publicação em App Store; foco em instalação pela tela inicial e uso cotidiano no celular.
- **Visual culinário, não genérico:** a interface deve lembrar um caderno/livro de receitas moderno, sem estética de dashboard SaaS ou template gerado por IA.

## Documentação

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — escopo funcional e comportamento do produto.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitetura local-first, sincronização, segurança e backend.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — entidades, relacionamentos e regras de dados.
- [`docs/UX.md`](docs/UX.md) — direção visual e princípios de experiência.
- [`docs/FRONTEND.md`](docs/FRONTEND.md) — engenharia e qualidade do frontend: anti-template/anti-“cara de IA”, componentes, React, Vite/PWA, estados, responsividade, acessibilidade, performance e QA.
- [`docs/TOOLS_AND_PLUGINS.md`](docs/TOOLS_AND_PLUGINS.md) — política de uso de **@Build Web Apps, @Context7, @Supericons, Superpowers, Codex Security, GitHub, Supabase e demais plugins/connectors** conforme a responsabilidade de cada tarefa.
- [`docs/SYNC.md`](docs/SYNC.md) — política normativa de sincronização e conflitos.
- [`docs/AUTH_SECURITY.md`](docs/AUTH_SECURITY.md) — autenticação, bootstrap, convites e fechamento do app.
- [`docs/ACCOUNT_LIFECYCLE.md`](docs/ACCOUNT_LIFECYCLE.md) — logout, isolamento local, remoção excepcional de identidade e eventual substituição administrativa sem reabrir o par.
- [`docs/IMPORTING.md`](docs/IMPORTING.md) — importação de receitas por URL e texto.
- [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md) — exportação, validação e modos de restauração.
- [`docs/MEDIA_STORAGE.md`](docs/MEDIA_STORAGE.md) — mídia local-first, cache e disponibilidade offline.
- [`docs/COOKING_MODE.md`](docs/COOKING_MODE.md) — ciclo de vida do modo cozinha e preparos em andamento.
- [`docs/SHOPPING_LISTS.md`](docs/SHOPPING_LISTS.md) — múltiplas listas de compras nomeadas, lista padrão e geração de itens.
- [`docs/SEARCH_FILTERS.md`](docs/SEARCH_FILTERS.md) — busca local-first, filtros combináveis e ordenação de receitas.
- [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) — regras de continuidade do desenvolvimento, incluindo quando as ferramentas acima devem entrar no fluxo e a decisão explícita de **não usar ImageGen no fluxo visual sem nova autorização do usuário**.

A documentação é atualizada conforme as decisões de produto são aprovadas, para evitar depender apenas do histórico da conversa.

Sessões futuras de desenvolvimento devem ler `docs/DEVELOPMENT_WORKFLOW.md`, `docs/TOOLS_AND_PLUGINS.md` e as especificações relevantes antes de alterar o produto. Tarefas de frontend devem ler também `docs/FRONTEND.md` e `docs/UX.md`.
