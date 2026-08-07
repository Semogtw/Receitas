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

A documentação é atualizada conforme as decisões de produto são aprovadas, para evitar depender apenas do histórico da conversa.
