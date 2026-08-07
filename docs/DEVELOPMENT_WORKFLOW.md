# Fluxo de Desenvolvimento

> Regras operacionais para sessões e agentes que continuarem o projeto. Este documento complementa as especificações de produto, arquitetura, dados e UX; não substitui nenhuma delas.

## 1. Fonte de verdade

Antes de implementar ou alterar comportamento, consultar os documentos relevantes em `docs/` e preservar as decisões já aprovadas.

Em caso de conflito entre uma sugestão de ferramenta/plugin e a especificação do projeto, **a especificação do projeto vence**.

Decisões novas de produto devem ser documentadas antes ou junto da implementação correspondente, em vez de ficarem somente no histórico da conversa.

## 2. Uso de @Build Web Apps

**Usar @Build Web Apps sempre que estiver disponível e houver benefício real para a tarefa.**

Ele é especialmente recomendado para:

- implementação de telas e fluxos React;
- criação ou refinamento de componentes e layouts responsivos;
- revisão de qualidade visual do frontend;
- correção de regressões de UI, interação, responsividade e acessibilidade;
- investigação de erros de console e comportamento renderizado;
- validação do fluxo real no navegador após mudanças de frontend;
- revisão/refatoração de React com foco em desempenho, bundle e renderização;
- modernização ou polimento de uma superfície já aprovada sem alterar decisões de produto.

Não invocar o plugin de forma mecânica quando a tarefa for estritamente de banco, migração, RLS, Edge Function, documentação ou outra área em que ele não acrescente valor. O objetivo é aproveitar suas capacidades quando úteis, não criar dependência artificial.

## 3. Regra específica sobre design e ImageGen

Neste projeto, o usuário **optou explicitamente por não usar ImageGen no fluxo de design da interface**.

Portanto:

- não gerar conceitos de UI com ImageGen por padrão;
- não substituir a direção aprovada em `docs/UX.md` por um conceito visual gerado automaticamente;
- usar `docs/UX.md`, as especificações funcionais e qualquer design explicitamente aprovado como fonte de verdade visual;
- @Build Web Apps pode e deve continuar sendo usado para engenharia de frontend, revisão, responsividade, testes e QA visual sem ImageGen;
- ImageGen só pode voltar a fazer parte do fluxo se o usuário autorizar isso explicitamente em uma decisão posterior.

Essa regra prevalece sobre defaults de ferramentas que normalmente sugeririam gerar um conceito visual antes de codificar.

## 4. React e qualidade de implementação

A stack aprovada usa React + TypeScript + Vite. Em tarefas React, aproveitar as práticas do @Build Web Apps para:

- evitar waterfalls desnecessários;
- manter bundle enxuto e carregar código pesado apenas quando necessário;
- reduzir re-renders evitáveis;
- manter componentes pequenos, claros e reutilizáveis;
- evitar `App` monolítico;
- separar estado, helpers e componentes por responsabilidade;
- preservar acessibilidade e comportamento responsivo;
- não introduzir dependências ou abstrações sem ganho concreto.

O código deve seguir primeiro as convenções existentes no repositório quando elas já estiverem estabelecidas.

## 5. QA de frontend

Toda mudança não trivial de UI deve ser validada no produto renderizado; build ou typecheck isolados não bastam para afirmar que a interface funciona.

Quando as capacidades correspondentes do @Build Web Apps estiverem disponíveis:

1. definir o fluxo de usuário que está sendo alterado;
2. abrir e testar a aplicação no navegador;
3. verificar que a tela não está vazia e não apresenta overlay de erro;
4. verificar erros e warnings relevantes de console;
5. exercitar pelo menos a interação principal alterada;
6. conferir um viewport mobile e um desktop quando aplicável;
7. procurar clipping, overflow, quebras de texto, targets de toque ruins, assets ausentes e regressões de responsividade;
8. corrigir problemas encontrados antes de considerar a tarefa concluída.

Se houver Browser integrado, ele deve ser preferido para esse ciclo. Se não estiver disponível ou houver bloqueio real, Playwright pode ser usado como fallback, registrando o motivo.

## 6. Fidelidade ao produto

@Build Web Apps é uma ferramenta de execução e revisão, não uma autorização para redesenhar o produto.

Ao trabalhar no frontend:

- não inventar seções, métricas, dashboards ou textos de marketing;
- não transformar páginas de receita em dashboards SaaS;
- não adicionar gradientes genéricos, glassmorphism, excesso de cards, badges ou pills;
- preservar a direção de “caderno/livro de receitas moderno” de `docs/UX.md`;
- tratar fotografia de comida como conteúdo principal, não decoração;
- manter boa densidade de informação e ergonomia mobile;
- respeitar todas as decisões já documentadas de navegação, modo cozinha, conflitos, fotos e estados offline.

## 7. Relação com outras ferramentas e skills

Usar a ferramenta mais adequada para cada responsabilidade:

- **@Build Web Apps:** frontend React, UI, interação, responsividade, QA visual e revisão de performance do frontend;
- **Superpowers:** processo de design/planejamento, TDD, depuração sistemática, execução e verificação conforme a fase do projeto;
- **Supabase/Postgres:** modelagem, consultas, RLS, migrações e backend quando essas ferramentas estiverem em uso;
- demais plugins/skills: somente quando trouxerem capacidade específica relevante.

Uma ferramenta não deve ser usada para substituir outra que tenha responsabilidade mais apropriada.

## 8. Documentação e commits

Manter a documentação sincronizada com as decisões e com a implementação.

Preferir commits pequenos e descritivos em marcos lógicos, especialmente quando uma sessão puder ser interrompida. Não deixar decisões importantes existirem apenas na memória da sessão.

## 9. Checklist curto para uma tarefa de frontend

Antes de concluir uma tarefa de frontend, verificar:

- [ ] li as especificações relevantes;
- [ ] usei @Build Web Apps onde trouxe benefício real;
- [ ] respeitei a decisão de não usar ImageGen;
- [ ] preservei a direção visual aprovada;
- [ ] apliquei boas práticas de React quando pertinentes;
- [ ] testei a interface renderizada e a interação principal;
- [ ] conferi mobile e desktop quando aplicável;
- [ ] não deixei erro relevante de console conhecido sem explicação;
- [ ] atualizei documentação se o comportamento ou a arquitetura mudou.
