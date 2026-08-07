# Frontend — Engenharia, Design e Qualidade

> Documento normativo para implementação e revisão do frontend do Receitas. Complementa `UX.md`, `PRODUCT.md`, `ARCHITECTURE.md` e `DEVELOPMENT_WORKFLOW.md`.
>
> Este guia adapta princípios úteis do material de referência de frontend fornecido ao projeto, descartando padrões voltados a landing pages/Awwwards que não servem a um aplicativo doméstico de receitas. Práticas específicas de React, Vite e PWA devem ser validadas contra documentação atual antes de implementação quando houver risco de API ou comportamento ter mudado.

## 1. Leitura de design do produto

Antes de criar ou alterar uma superfície visual, assumir a seguinte leitura como padrão:

- **tipo de produto:** aplicação utilitária pessoal, não site de marketing;
- **uso principal:** celular, com forte prioridade para iPhone/PWA e uso em cozinha/mercado;
- **personalidade:** caderno/livro de receitas moderno, doméstico e bem cuidado;
- **densidade:** média a alta quando a informação é útil; evitar tanto poluição quanto grandes áreas vazias decorativas;
- **variação visual:** moderada; suficiente para não parecer template, mas sem comprometer previsibilidade;
- **movimento:** baixo a moderado e sempre funcional;
- **fotografia:** conteúdo principal nas áreas de receita e histórico, não decoração de fundo arbitrária;
- **prioridade:** clareza, ergonomia, offline/local-first e velocidade percebida acima de espetáculo visual.

Qualquer proposta que transforme o produto em landing page, dashboard SaaS, portfólio Awwwards ou experimento de animação está fora da direção aprovada.

## 2. O que foi aproveitado do material de referência

São incorporados ao projeto:

- combate deliberado a padrões visuais genéricos de IA/template;
- auditoria de tipografia, cor, superfície, layout, conteúdo, estados e acessibilidade;
- disciplina de componentes e de hierarquia visual;
- uso consciente de cards, sombras, bordas e raios;
- estados completos de interação, carregamento, vazio e erro;
- responsividade mobile-first e cuidado com viewport móvel;
- preferência por animações baseadas em `transform`/`opacity`;
- respeito obrigatório a `prefers-reduced-motion`;
- auditoria antes de redesenhar uma superfície existente;
- verificação de dependências antes de importar bibliotecas;
- proibição de controles falsos, links mortos, placeholders visíveis e código de produção incompleto;
- validação do frontend realmente renderizado, e não apenas build/typecheck.

Não são adotados como regras do Receitas:

- AIDA;
- hero cinematográfico;
- bento grid obrigatório;
- randomização de layout por RNG;
- GSAP obrigatório ou animação pesada por padrão;
- scroll hijacking/pinning como linguagem principal;
- headings gigantes de marketing;
- uso obrigatório de imagens de placeholder externas;
- grandes blocos de CTA/footer promocional;
- regra de que uma interface estática é necessariamente ruim.

Esses padrões podem ser úteis em sites promocionais, mas são inadequados como defaults para este produto.

## 3. Hierarquia visual e composição

### 3.1 Regra principal

A interface deve fazer o conteúdo culinário parecer protagonista.

Em telas de receita, a hierarquia deve favorecer:

1. identidade/foto da receita;
2. porções e controles de escala/conversão;
3. ingredientes;
4. preparo;
5. histórico/fotos;
6. ações secundárias.

Não inserir widgets, métricas ou painéis apenas para “preencher” a tela.

### 3.2 Evitar simetria automática

Não centralizar tudo por reflexo. Títulos, listas e formulários devem usar alinhamento que favoreça leitura e escaneabilidade.

Em desktop, assimetria pode ser usada quando funcional, por exemplo:

- ingredientes em uma coluna e preparo em outra;
- foto/identidade da receita ao lado de dados principais;
- painel de filtros compacto sem transformar a aplicação em dashboard lateral genérico.

No mobile, priorizar fluxo vertical previsível.

### 3.3 Cards com função real

Cards só devem existir quando comunicarem agrupamento ou hierarquia real.

Evitar:

- card dentro de card;
- borda + sombra + fundo branco em toda seção;
- transformar cada ingrediente, etapa ou configuração em um cartão isolado;
- grids de três cards iguais usados como solução universal.

Preferir quando apropriado:

- divisores;
- listas;
- agrupamento por espaçamento;
- superfícies discretas;
- seções abertas;
- linhas com ações contextuais.

## 4. Sistema de formas, bordas e elevação

Definir uma escala consistente, não valores arbitrários por componente.

Direção inicial:

- controles pequenos: raio baixo/moderado;
- inputs e botões: raio consistente entre variantes;
- superfícies maiores: raio um pouco maior apenas quando houver agrupamento real;
- pills: reservadas para controles semanticamente adequados, não para qualquer texto curto;
- sombras: discretas e raras;
- bordas: preferíveis a sombras quando a intenção for apenas delimitar.

Não misturar elementos completamente quadrados, cards muito arredondados e botões cápsula sem uma regra visual explícita.

Também deve existir uma escala de `z-index` pequena e documentada. Valores como `9999` não são aceitos sem justificativa excepcional.

## 5. Tipografia

### 5.1 Princípios

- tipografia precisa funcionar muito bem em português;
- legibilidade em tela pequena é prioridade;
- títulos de receita podem ter personalidade, mas não podem sacrificar leitura;
- corpo, ingredientes, instruções e controles devem ser rápidos de escanear;
- evitar fonte de navegador sem decisão explícita;
- evitar escolher Inter apenas por ser o default mais fácil;
- não misturar famílias para “parecer criativo” sem motivo funcional;
- usar pesos intermediários quando ajudarem a hierarquia;
- números de timer, quantidades e valores que precisam alinhar podem usar `font-variant-numeric: tabular-nums`.

### 5.2 Escala

O produto não usa headings de landing page como padrão.

- títulos de tela: fortes, porém proporcionais ao viewport;
- título de receita: pode ter maior presença visual;
- seções: claramente distinguíveis sem competir com o conteúdo;
- labels e metadados: menores, mas nunca ilegíveis;
- modo cozinha: aumenta o tamanho do texto e dos controles em favor da consulta à distância.

Quando útil e suportado, usar `text-wrap: balance` em títulos curtos e `text-wrap: pretty` em parágrafos para reduzir quebras ruins.

## 6. Cor e tema

A direção aprovada continua sendo a de `UX.md`: neutros naturais, carvão/grafite e acentos culinários como terracota, tomate e oliva.

Adaptação da regra “um único accent” do material de referência:

- não significa eliminar todas as cores culinárias do produto;
- uma **superfície ou fluxo** deve ter um acento dominante e não competir com vários CTAs coloridos;
- cores semânticas de sucesso, atenção, erro, offline/conflito podem existir, mas devem ser tratadas como sistema, não decoração;
- categorias não devem virar uma nuvem de badges multicoloridos;
- evitar gradiente roxo/azul genérico, neon e glows sem relação com comida;
- evitar alternar arbitrariamente entre famílias de cinza quentes e frias.

Tema claro e escuro são obrigatórios conforme `UX.md`. O tema escuro deve ser desenhado e testado, não simplesmente invertido.

## 7. Ícones

Escolher **uma família principal de ícones** para o produto e preservar:

- metáfora consistente;
- espessura de traço coerente;
- tamanhos ópticos coerentes;
- alinhamento e padding consistentes;
- estados ativo/inativo/disabled previsíveis.

Não misturar bibliotecas por conveniência em uma mesma interface.

A biblioteca deve ser escolhida na implementação após verificar dependências e adequação visual. Não existe obrigação de usar Lucide, Phosphor ou outra família específica antes dessa decisão.

Ícones nunca substituem labels quando a ação não for imediatamente óbvia. Controles somente por ícone precisam de nome acessível.

## 8. Layout responsivo

### 8.1 Mobile-first

Todo fluxo nasce funcional em viewport estreito.

Regras:

- targets de toque confortáveis;
- nenhuma ação crítica depende de hover;
- evitar tabelas largas quando listas estruturadas funcionarem melhor;
- navegação primária próxima do polegar;
- respeitar safe areas quando relevante em PWA instalada;
- checar teclado virtual em formulários e editores;
- não depender de altura fixa de viewport.

### 8.2 Viewport móvel

Para superfícies que precisam ocupar ao menos a tela inteira, preferir unidades dinâmicas como `100dvh`/`min-height: 100dvh` quando suportadas pela estratégia de CSS, em vez de assumir que `100vh` representa corretamente a área útil em navegadores móveis.

### 8.3 Grid sobre matemática frágil

Quando houver múltiplas colunas, preferir CSS Grid a cálculos frágeis de largura em Flexbox.

Evitar estruturas do tipo “33% menos um valor arbitrário” quando um grid semântico resolver o mesmo problema.

### 8.4 Desktop

Desktop deve ganhar espaço e informação útil, não apenas esticar o layout mobile.

Usar container máximo coerente para impedir linhas e formulários excessivamente largos. Não aplicar um `max-width` global único a todos os tipos de tela se uma área específica exigir largura maior.

## 9. Estados de interface obrigatórios

Nenhuma feature é considerada visualmente completa se só existir o “happy path”.

Quando aplicável, desenhar e implementar:

- default;
- hover;
- focus-visible;
- active/pressed;
- disabled;
- loading;
- empty;
- error;
- offline;
- pendente de sincronização;
- sincronizando;
- conflito;
- upload/download pendente;
- sucesso quando ele realmente precisar ser comunicado.

### 9.1 Loading

Preferir skeletons que preservem aproximadamente a geometria final quando o usuário estiver esperando conteúdo de leitura.

Spinners podem existir em ações pequenas e localizadas, mas não devem ser a única linguagem de carregamento do produto.

### 9.2 Empty states

Devem explicar o próximo passo sem microcopy artificialmente entusiasmada.

Exemplo de direção:

- “Nenhuma receita ainda” + ação real para adicionar/importar;
- não usar ilustrações genéricas de startup apenas para ocupar espaço.

### 9.3 Erros

- mensagens diretas;
- erros de campo próximos ao campo;
- falhas recuperáveis com ação clara de tentar novamente;
- não usar `window.alert()` para erros normais do produto;
- evitar “Oops!”, exclamações e linguagem teatral.

## 10. Microinterações e animação

Movimento serve para comunicar relação, estado e continuidade.

Boas utilizações:

- feedback de botão pressionado;
- entrada/saída de drawer ou sheet;
- reordenação de ingrediente/etapa;
- feedback de item comprado;
- transição entre passos no modo cozinha;
- atualização discreta de estado de sincronização;
- expansão de conteúdo contextual.

Regras:

- CSS/transitions simples primeiro;
- biblioteca de motion somente quando houver ganho concreto;
- GSAP não é dependência padrão do projeto;
- animações de layout devem evitar propriedades que provoquem trabalho desnecessário quando `transform`/`opacity` resolverem;
- respeitar `prefers-reduced-motion`;
- animação nunca pode atrasar uma ação crítica;
- scroll hijacking não faz parte da linguagem do produto.

## 11. Conteúdo e microcopy

- escrever em português natural e direto;
- usar sentence case;
- evitar slogans e linguagem promocional dentro do produto;
- evitar “Eleve”, “experiência perfeita”, “revolucione”, “desbloqueie”, “next-gen” e clichês semelhantes;
- não usar lorem ipsum;
- não usar nomes/dados fake genéricos quando exemplos realistas puderem ser escritos;
- não adicionar métricas fictícias;
- evitar exclamações em mensagens de sucesso comuns;
- manter rótulos estáveis entre telas.

A microcopy aprovada em `UX.md` tem precedência.

## 12. Arquitetura React

A implementação deve seguir as recomendações atuais do React e as necessidades local-first do produto.

### 12.1 Estado mínimo e derivado

- manter em estado apenas o que realmente precisa ser fonte de verdade de UI;
- derivar valores a partir de props/estado existentes quando possível;
- não duplicar uma entidade inteira em estado quando um ID estável é suficiente;
- médias, filtros, seleção derivada e estados calculáveis não devem virar fontes paralelas de verdade sem necessidade.

Isso é especialmente importante no Receitas, que já possui muitos valores derivados de domínio.

### 12.2 Effects como integração, não calculadora

Não usar `useEffect` para sincronizar estado que poderia ser calculado diretamente durante renderização.

Effects ficam reservados a sincronização com sistemas externos ou ciclos de vida reais, como:

- APIs/browser APIs;
- listeners;
- timers;
- integração com armazenamento/local DB quando a camada escolhida exigir;
- service worker;
- observadores e recursos externos.

### 12.3 Refs para valores transitórios

Valores que precisam persistir entre renders mas não alteram a UI não devem provocar renderização sem motivo.

Exemplos possíveis:

- IDs de timeout;
- referências DOM;
- handles externos;
- valores transitórios de interação quando não fazem parte da saída renderizada.

### 12.4 Componentes

- `App` deve ser composição, não um arquivo monolítico;
- separar shell, features, primitives e helpers;
- componentes reutilizáveis devem representar uma responsabilidade clara;
- não criar abstração genérica antes de existir repetição real;
- manter estado o mais próximo possível da superfície que o utiliza;
- estado global só quando o compartilhamento transversal justificar.

## 13. Organização sugerida do frontend

A estrutura exata será congelada no plano de implementação, mas a direção é:

```text
src/
├── app/                 # shell, providers, routing, bootstrap de UI
├── features/            # receitas, compras, planejador, histórico, conflitos...
├── components/          # primitives/componentes compartilhados reais
├── hooks/               # hooks compartilhados com responsabilidade clara
├── lib/                 # integrações e helpers de infraestrutura
├── styles/              # tokens/globais quando aplicável
├── assets/              # assets empacotados
└── types/               # tipos compartilhados quando necessários
```

Evitar pasta global de `utils` que vire depósito sem fronteira. Helpers específicos de uma feature devem permanecer próximos dela.

## 14. Vite e configuração de cliente

### 14.1 Variáveis de ambiente

No Vite, variáveis expostas ao bundle do cliente devem ser tratadas como **públicas**.

Regras do projeto:

- nenhum segredo administrativo entra em variável acessível ao frontend;
- `service_role`, segredo de bootstrap e credenciais privilegiadas nunca entram no bundle;
- variáveis `VITE_*` devem conter somente configuração segura para exposição pública;
- declarar tipos para `import.meta.env` quando a configuração crescer, evitando chaves inexistentes passarem despercebidas;
- modo de desenvolvimento pode usar `import.meta.env.DEV` para lógica exclusivamente de dev quando apropriado.

### 14.2 Assets

Preferir imports de assets quando eles fizerem parte do grafo da aplicação e precisarem de hashing/build.

Usar `public/` apenas para arquivos que realmente precisem manter caminho/nome estável e não precisem entrar no processamento normal do bundler.

### 14.3 Bundle

- não adicionar dependência pesada para resolver detalhe pequeno;
- rotas/features raras e pesadas podem usar import dinâmico quando trouxer benefício real;
- verificar impacto de bundle antes de adotar bibliotecas de animação, editor, imagem ou gráficos;
- build de produção é gate mínimo, mas não substitui QA renderizado.

## 15. PWA e service worker

O service worker não é um cache indiscriminado de tudo que o usuário acessa.

### 15.1 App shell

É apropriado precachear recursos estáticos necessários para inicializar a aplicação offline, como:

- HTML/app shell conforme estratégia adotada;
- JS/CSS versionados;
- ícones e assets essenciais pequenos.

### 15.2 Dados privados

Dados pessoais/autenticados devem seguir a arquitetura local-first documentada (`PowerSync`/banco local e políticas de mídia), em vez de depender de cache HTTP genérico do service worker.

Não adicionar uma regra ampla de runtime cache para endpoints autenticados, APIs do Supabase ou mídias privadas sem análise explícita de:

- identidade;
- expiração;
- logout;
- revogação;
- isolamento entre usuários;
- risco de servir conteúdo privado fora da sessão correta.

### 15.3 Atualização da aplicação

A atualização do service worker deve ter UX explícita.

Quando uma versão nova exigir refresh, a interface deve poder comunicar que há atualização disponível em vez de trocar o app em momento inesperado durante edição ou preparo.

Também pode existir um estado discreto de “pronto para uso offline” quando isso acrescentar informação útil, sem criar toast/barulho a cada visita.

A estratégia final (`prompt`, `autoUpdate` ou equivalente) deve ser decidida no plano técnico considerando risco de interromper fluxos em andamento.

## 16. Segurança no frontend

Além das regras de `AUTH_SECURITY.md`:

- nunca confiar no frontend como camada de autorização;
- não renderizar HTML arbitrário de receita importada;
- todo conteúdo importado deve ser estruturado/sanitizado antes de apresentação;
- URLs e arquivos externos não ganham confiança por terem vindo de um usuário autenticado;
- não colocar tokens administrativos em logs;
- não persistir segredo de bootstrap;
- logout precisa isolar/limpar estado local conforme política de identidade;
- mensagens de erro não devem vazar detalhes internos sensíveis.

## 17. Acessibilidade

A acessibilidade faz parte da definição de pronto.

No mínimo:

- HTML semântico (`nav`, `main`, `article`, `section`, formulários e headings coerentes);
- link de “pular para conteúdo” quando a estrutura da aplicação justificar;
- foco visível;
- labels reais em inputs;
- nomes acessíveis em botões de ícone;
- contraste adequado em temas claro/escuro;
- não depender apenas de cor para estado;
- suporte a teclado nas superfícies web relevantes;
- erros de formulário associados ao campo;
- conteúdo de imagem com `alt` significativo quando a imagem transmitir informação;
- imagens decorativas devem ser tratadas como decorativas;
- motion reduzido respeitado;
- áreas de toque adequadas a mobile.

## 18. Performance

O objetivo não é micro-otimizar cedo, e sim evitar padrões caros conhecidos.

- evitar re-renderizações provocadas por estado redundante;
- não assinar estado global mais amplo que o necessário;
- listas grandes devem ser avaliadas por custo real antes de virtualização;
- imagens devem usar tamanhos/variantes adequados ao contexto;
- miniaturas não devem baixar o original gigante quando não necessário;
- animações não devem manter loops contínuos sem necessidade;
- bibliotecas pesadas entram apenas com justificativa;
- medir quando houver problema, não otimizar por superstição.

## 19. Protocolo para redesign e polimento

Ao melhorar uma tela existente:

1. **ler** as especificações relevantes;
2. **renderizar** a tela atual;
3. **auditar** problemas concretos de hierarquia, tipografia, spacing, estados, responsividade e acessibilidade;
4. **preservar** fluxos, dados e decisões aprovadas;
5. **corrigir** de forma direcionada antes de cogitar reescrita;
6. **comparar** antes/depois no navegador;
7. **testar** mobile e desktop;
8. **registrar** qualquer mudança intencional de direção visual antes de expandi-la ao restante do produto.

Não reescrever uma feature funcional apenas para aplicar uma nova estética.

## 20. Dependências e documentação atual

Antes de importar API ou biblioteca nova:

1. verificar `package.json` e lockfile;
2. confirmar se a dependência já existe;
3. verificar documentação atual da biblioteca, preferencialmente via **@Context7** quando disponível;
4. confirmar sintaxe/versão compatível;
5. só então implementar/importar.

Context7 deve ser usado especialmente quando a tarefa depender de comportamento atual de React, Vite, Vite PWA, PowerSync, Supabase ou outra biblioteca/SDK que possa ter mudado.

Não confiar em snippets antigos ou memória do modelo quando a documentação atual puder ser consultada.

## 21. Código completo e sem placeholders de produção

Adaptando o princípio de “full output” do material fornecido:

- não comitar `TODO` como substituto de comportamento solicitado e considerado concluído;
- não deixar botão visível sem ação real;
- não usar links para `#` como destino final;
- não criar mocks permanentes que pareçam dados reais;
- não deixar trechos `// ...`, “implementar depois” ou stubs em código apresentado como concluído;
- se uma feature ainda estiver em desenvolvimento, seu estado deve ser tecnicamente explícito e não mascarado como pronta;
- remover código comentado/dead/debug antes de concluir uma entrega.

Isso não impede desenvolvimento incremental; impede chamar uma superfície incompleta de concluída.

## 22. QA visual e funcional

Toda alteração de UI não trivial precisa ser validada renderizada.

Usar @Build Web Apps quando disponível e útil, conforme `DEVELOPMENT_WORKFLOW.md`.

Checklist mínimo:

- página/rota correta;
- ausência de tela branca/overlay de erro;
- console sem erro relevante não explicado;
- fluxo principal exercitado;
- viewport mobile verificado;
- viewport desktop verificado quando aplicável;
- tema claro e escuro verificados nas superfícies alteradas quando aplicável;
- foco/teclado verificados em controles relevantes;
- sem clipping/overflow horizontal inesperado;
- sem texto ou CTA quebrado de forma ruim;
- imagens carregam e usam crop/tamanho coerentes;
- loading/empty/error relevantes testados;
- offline/sync testados quando a feature tocar nesses estados;
- `prefers-reduced-motion` respeitado em mudanças animadas.

Build, lint e typecheck são complementares; nenhum deles substitui esse ciclo.

## 23. Checklist anti-“cara de IA”

Antes de considerar uma tela visualmente pronta:

- [ ] não transformei conteúdo em cards sem motivo;
- [ ] não adicionei gradiente roxo/azul ou glow genérico;
- [ ] não usei pills/badges como decoração;
- [ ] não centralizei tudo por reflexo;
- [ ] não criei dashboard/métricas que não ajudam a tarefa;
- [ ] não inventei texto de marketing;
- [ ] não deixei espaços enormes sem função;
- [ ] tipografia tem hierarquia deliberada;
- [ ] cores seguem o sistema culinário aprovado;
- [ ] raios, bordas e sombras seguem uma regra consistente;
- [ ] ícones pertencem a uma família coerente;
- [ ] estados de interação existem;
- [ ] empty/loading/error não parecem placeholders;
- [ ] mobile parece uma interface projetada para mobile, não desktop comprimido;
- [ ] a tela parece parte do mesmo produto que as demais.

## 24. Relação com os outros documentos

- `docs/UX.md`: direção visual e princípios de experiência; prevalece para decisões de linguagem visual.
- `docs/PRODUCT.md`: comportamento esperado das features.
- `docs/ARCHITECTURE.md`: stack e fronteiras técnicas.
- `docs/SYNC.md`: estados e regras de sincronização/conflito.
- `docs/MEDIA_STORAGE.md`: mídia local/offline.
- `docs/COOKING_MODE.md`: ergonomia e estado temporário do modo cozinha.
- `docs/AUTH_SECURITY.md`: autenticação e segurança.
- `docs/DEVELOPMENT_WORKFLOW.md`: processo de execução, plugins e QA.

Se uma sugestão deste documento conflitar com uma decisão explícita de produto/UX já aprovada, a decisão específica vence.