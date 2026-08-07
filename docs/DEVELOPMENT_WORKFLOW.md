# Fluxo de Desenvolvimento

> Regras operacionais para sessões e agentes que continuarem o projeto. Este documento complementa as especificações de produto, arquitetura, dados e UX; não substitui nenhuma delas.

## 1. Fonte de verdade

Antes de implementar ou alterar comportamento, consultar os documentos relevantes em `docs/` e preservar as decisões já aprovadas.

Para tarefas de frontend, **`docs/FRONTEND.md` é leitura obrigatória junto de `docs/UX.md` e da especificação funcional da feature**.

Para tarefas de desenvolvimento em geral, **`docs/TOOLS_AND_PLUGINS.md` define quando usar @Build Web Apps, @Context7, @Supericons, Superpowers, Codex Security, GitHub, Supabase e demais ferramentas conectadas**.

Em caso de conflito entre uma sugestão de ferramenta/plugin e a especificação do projeto, **a especificação do projeto vence**.

Decisões novas de produto devem ser documentadas antes ou junto da implementação correspondente, em vez de ficarem somente no histórico da conversa.

### 1.1 Autonomia para decisões técnicas

O usuário delegou as decisões **puramente técnicas** aos agentes de desenvolvimento, com duas condições obrigatórias:

1. a solução escolhida deve manter **custo recorrente obrigatório de US$ 0**;
2. entre as opções gratuitas compatíveis, deve ser escolhida a alternativa tecnicamente melhor para o projeto, considerando segurança, robustez, manutenção, portabilidade, simplicidade e aderência às especificações.

Portanto, não é necessário pedir aprovação do usuário para cada escolha de biblioteca, ferramenta de teste, host, organização de código, configuração de build ou detalhe de infraestrutura quando a decisão não muda comportamento de produto e respeita essas condições.

Ainda é necessário consultar o usuário quando a decisão:

- muda comportamento ou fluxo visível do produto;
- reduz feature já aprovada;
- altera privacidade ou expectativa de segurança de maneira material;
- cria custo obrigatório;
- exige informação pessoal/credencial que o agente não possui;
- envolve trade-off de produto genuíno em vez de escolha de engenharia.

Toda decisão técnica material deve continuar sendo documentada no repositório e validada com fontes atuais quando depender de APIs, planos ou limites que possam mudar.

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
- usar `docs/UX.md`, `docs/FRONTEND.md`, as especificações funcionais e qualquer design explicitamente aprovado como fonte de verdade visual;
- @Build Web Apps pode e deve continuar sendo usado para engenharia de frontend, revisão, responsividade, testes e QA visual sem ImageGen;
- ImageGen só pode voltar a fazer parte do fluxo se o usuário autorizar isso explicitamente em uma decisão posterior.

Essa regra prevalece sobre defaults de ferramentas que normalmente sugeririam gerar um conceito visual antes de codificar.

## 4. React e qualidade de implementação

A stack aprovada usa React + TypeScript + Vite. Em tarefas React, aproveitar as práticas do @Build Web Apps e de `docs/FRONTEND.md` para:

- evitar waterfalls desnecessários;
- manter bundle enxuto e carregar código pesado apenas quando necessário;
- reduzir re-renders evitáveis;
- evitar estado redundante ou duplicado quando o valor puder ser derivado;
- evitar `Effect` usado apenas para recalcular estado derivável;
- usar refs para valores transitórios que não precisam disparar renderização;
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
8. conferir estados relevantes como loading, vazio, erro, offline/sync e tema escuro quando a mudança os atingir;
9. corrigir problemas encontrados antes de considerar a tarefa concluída.

Se houver Browser integrado, ele deve ser preferido para esse ciclo. Se não estiver disponível ou houver bloqueio real, Playwright pode ser usado como fallback, registrando o motivo.

## 6. Fidelidade ao produto

@Build Web Apps é uma ferramenta de execução e revisão, não uma autorização para redesenhar o produto.

Ao trabalhar no frontend:

- não inventar seções, métricas, dashboards ou textos de marketing;
- não transformar páginas de receita em dashboards SaaS;
- não adicionar gradientes genéricos, glassmorphism, excesso de cards, badges ou pills;
- preservar a direção de “caderno/livro de receitas moderno” de `docs/UX.md`;
- seguir os guardrails anti-template/anti-“cara de IA” de `docs/FRONTEND.md`;
- tratar fotografia de comida como conteúdo principal, não decoração;
- manter boa densidade de informação e ergonomia mobile;
- respeitar todas as decisões já documentadas de navegação, modo cozinha, conflitos, fotos e estados offline.

## 7. Uso de @Context7

**Usar @Context7 sempre que uma implementação, correção ou decisão técnica depender de API atual de biblioteca/framework/SDK.**

É especialmente importante para:

- React;
- Vite;
- integração PWA/service worker;
- PowerSync;
- Supabase;
- bibliotecas de componentes, animação, formulários, roteamento ou testes;
- migrações e mudanças de versão;
- qualquer API cuja sintaxe ou recomendação possa ter mudado desde o treinamento do modelo.

Fluxo esperado:

1. identificar a biblioteca e a versão usada pelo projeto quando disponível;
2. consultar a documentação atual via Context7;
3. confirmar que a API/import/configuração proposta existe na versão relevante;
4. só então escrever ou alterar código dependente desse comportamento.

Não usar Context7 apenas para “decorar” uma resposta quando a tarefa não depende de biblioteca atual. Quando usado, suas conclusões devem ser incorporadas ao código/documentação de forma concreta.

## 8. Uso de @Supericons

**Usar @Supericons sempre que uma tarefa de frontend exigir novos ícones, substituição de ícones ou revisão de coerência do conjunto existente.**

Regras:

- para múltiplos slots, recomendar o conjunto em uma única passagem quando possível;
- preferir uma família principal consistente;
- revisar semanticamente as sugestões antes de aceitá-las;
- visualizar candidatos quando houver dúvida de coerência óptica;
- obter o SVG exato somente depois de escolher um resultado real retornado pela ferramenta;
- não misturar bibliotecas casualmente;
- não usar emoji como solução de iconografia de interface;
- controles apenas por ícone precisam de nome acessível.

@Supericons é uma ferramenta de descoberta e consistência; a recomendação automática não substitui julgamento de significado e aderência a `docs/UX.md`/`docs/FRONTEND.md`.

## 9. Relação com outras ferramentas e skills

A política completa está em `docs/TOOLS_AND_PLUGINS.md`.

Resumo de responsabilidades:

- **@Build Web Apps:** frontend React, UI, interação, responsividade, QA visual e revisão de performance do frontend;
- **@Context7:** documentação atual de bibliotecas/frameworks/SDKs e validação de APIs/configurações;
- **@Supericons:** busca, recomendação, visualização e SVG exato de iconografia consistente;
- **Superpowers:** processo de design/planejamento, TDD, depuração sistemática, execução e verificação conforme a fase do projeto;
- **Codex Security:** scans/revisões de segurança quando houver código e risco que justifiquem auditoria;
- **GitHub:** fonte de verdade persistente, documentação, histórico e commits;
- **Supabase:** schema, SQL, RLS, Auth, Storage, Edge Functions e diagnóstico do backend quando a implementação correspondente existir;
- **Figma/Canva:** opcionais para trabalho visual explicitamente útil, sem reabrir ImageGen por padrão;
- **Cloudflare Pages:** host preferencial do frontend enquanto permanecer a melhor opção gratuita compatível;
- **Vercel:** fallback de deploy/preview se houver incompatibilidade real com a opção preferencial;
- **OpenAI Developers:** somente se uma integração de IA for explicitamente aprovada;
- **Plugin Management:** descoberta/gestão de plugins quando faltar capacidade externa relevante;
- demais plugins/connectors: somente quando a tarefa realmente envolver o sistema correspondente.

Uma ferramenta não deve ser usada para substituir outra que tenha responsabilidade mais apropriada, nem apenas porque está disponível.

## 10. Material de referência visual

O material de referência de frontend fornecido ao projeto foi **adaptado**, não adotado literalmente.

A versão normativa dessas adaptações está em `docs/FRONTEND.md`.

Isso significa, entre outras coisas:

- aproveitar auditoria anti-template, tipografia, estados, acessibilidade, responsividade e disciplina visual;
- não importar defaults de landing page como AIDA, hero cinematográfico, bento obrigatório, GSAP obrigatório ou randomização de layout;
- não usar placeholders externos ou animação excessiva apenas porque constavam do material de referência;
- preservar a natureza utilitária, mobile-first e culinária do Receitas.

## 11. Documentação e commits

Manter a documentação sincronizada com as decisões e com a implementação.

Preferir commits pequenos e descritivos em marcos lógicos, especialmente quando uma sessão puder ser interrompida. Não deixar decisões importantes existirem apenas na memória da sessão.

## 12. Checklist curto para uma tarefa de frontend

Antes de concluir uma tarefa de frontend, verificar:

- [ ] li `docs/FRONTEND.md`, `docs/UX.md`, `docs/TOOLS_AND_PLUGINS.md` e a especificação funcional relevante;
- [ ] usei @Build Web Apps onde trouxe benefício real;
- [ ] consultei @Context7 se dependi de API/configuração atual de biblioteca;
- [ ] usei @Supericons se criei, substituí ou revisei iconografia;
- [ ] respeitei a decisão de não usar ImageGen;
- [ ] preservei a direção visual aprovada;
- [ ] evitei estado React redundante e Effects desnecessários quando aplicável;
- [ ] testei a interface renderizada e a interação principal;
- [ ] conferi mobile e desktop quando aplicável;
- [ ] conferi estados relevantes de loading/erro/offline/sync quando aplicável;
- [ ] não deixei erro relevante de console conhecido sem explicação;
- [ ] considerei Codex Security quando a mudança tocou superfície sensível;
- [ ] mantive custo recorrente obrigatório em US$ 0 em decisões técnicas;
- [ ] atualizei documentação se o comportamento ou a arquitetura mudou.
