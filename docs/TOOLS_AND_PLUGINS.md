# Ferramentas, Plugins e Skills

> Política operacional para agentes e sessões que continuarem o projeto Receitas. Este documento define **quando e por que** usar ferramentas conectadas. Ele complementa `DEVELOPMENT_WORKFLOW.md` e não substitui especificações de produto, arquitetura, UX ou frontend.

## 1. Princípio geral

**Usar plugins, connectors e skills disponíveis sempre que eles trouxerem ganho concreto de qualidade, segurança, atualidade, precisão ou capacidade de verificação.**

Não usar ferramentas apenas para dizer que foram usadas.

Regras:

- a especificação do projeto sempre vence defaults de plugin;
- nenhuma ferramenta autoriza adicionar feature não aprovada;
- escolher a ferramenta pela responsabilidade que ela cobre melhor;
- preferir fonte especializada/conectada em vez de improvisar comportamento que pode ser verificado;
- quando uma ferramenta falhar ou não trouxer valor, documentar o bloqueio relevante e continuar pelo caminho adequado;
- evitar duplicar trabalho entre plugins que cobrem a mesma responsabilidade sem motivo;
- quando a tarefa envolver informação que pode ter mudado, consultar fonte atual apropriada antes de congelar decisão técnica.

## 2. @Build Web Apps

Uso preferencial para trabalho de frontend renderizado.

Usar especialmente em:

- implementação e refinamento de telas React;
- componentes e layouts responsivos;
- revisão de UI existente;
- acessibilidade e ergonomia;
- debugging de interação, console e layout;
- QA visual e responsivo no navegador;
- performance de frontend e revisão React quando aplicável.

Regras específicas do Receitas:

- deve obedecer `docs/UX.md` e `docs/FRONTEND.md`;
- não pode transformar o produto em dashboard SaaS ou landing page;
- não deve usar ImageGen neste projeto sem nova autorização explícita do usuário;
- build/typecheck sozinho não substitui QA da interface renderizada.

## 3. @Context7

**Usar sempre que código, configuração ou decisão técnica depender de API atual de biblioteca, framework, SDK, CLI ou serviço.**

Casos prioritários:

- React;
- Vite;
- Vite PWA / service worker;
- PowerSync;
- Supabase;
- bibliotecas de roteamento, formulários, testes, animação e componentes;
- mudanças de versão ou migrações;
- sintaxe/configuração que possa ter mudado desde o treinamento do modelo;
- debugging em que o comportamento depende da versão de uma biblioteca.

Fluxo esperado:

1. identificar a biblioteca e, quando possível, a versão usada pelo repositório;
2. resolver a documentação correta no Context7;
3. consultar a API/conceito específico;
4. verificar que imports, opções e comportamento propostos existem na versão relevante;
5. implementar apenas depois dessa confirmação quando o detalhe for material.

Não consultar Context7 para conhecimento puramente de domínio do produto que não dependa de biblioteca.

## 4. @Supericons

**Usar como ferramenta padrão para busca, seleção e obtenção de ícones quando uma tarefa de frontend exigir ícones novos ou revisar um conjunto existente.**

Objetivos:

- evitar mistura arbitrária de bibliotecas;
- escolher metáforas claras;
- manter traço, estilo e peso visual consistentes;
- obter SVG exato de uma escolha validada em vez de desenhar aproximações improvisadas;
- visualizar alternativas antes de congelar o icon set.

Fluxo recomendado:

1. para dois ou mais slots de UI, usar recomendação em conjunto em vez de pesquisar cada ícone isoladamente;
2. preferir uma única família principal no produto;
3. revisar semanticamente cada sugestão — **não aceitar automaticamente o primeiro resultado**;
4. visualizar o conjunto quando houver dúvida de coerência óptica;
5. depois da escolha, obter o SVG exato pelo identificador retornado pela ferramenta;
6. registrar a família escolhida no design system quando ela for congelada.

O teste feito durante a documentação mostrou por que a revisão humana/semântica é obrigatória: mesmo uma ferramenta especializada pode retornar uma metáfora inadequada para um rótulo ambíguo. Resultado de busca é candidato, não decisão de produto.

Regras de frontend relacionadas:

- ícone sozinho só quando a ação for realmente reconhecível;
- controles só com ícone precisam de nome acessível;
- não misturar Lucide, Tabler, Phosphor etc. casualmente na mesma superfície;
- não usar emoji como substituto de iconografia de interface;
- não escolher ícone pela estética se a metáfora comunicar outra ação.

## 5. Superpowers

Usar as skills do Superpowers conforme a fase da tarefa.

Responsabilidades principais:

- brainstorming e design antes de implementação quando houver decisão aberta;
- escrita de planos depois de especificação aprovada;
- TDD em implementação de features/bugfixes quando aplicável;
- debugging sistemático diante de comportamento inesperado;
- verificação antes de declarar conclusão;
- execução disciplinada de planos e revisão.

Superpowers organiza o processo; não substitui plugins especializados como Context7, Supericons ou ferramentas do backend.

## 6. Codex Security

Usar o conjunto **Codex Security** quando houver código suficiente para auditoria de segurança ou quando a tarefa for explicitamente de segurança.

Casos relevantes para o Receitas:

- revisão do repositório antes de considerar a primeira versão pronta;
- autenticação, bootstrap e convites;
- RLS/autorização por `pair_id`;
- importação por URL e SSRF;
- upload/Storage;
- backup/restauração e parsing de ZIP;
- Edge Functions e operações privilegiadas;
- revisão de mudanças sensíveis em PR/diff quando aplicável.

Usar a skill correta para o escopo:

- scan padrão para auditoria geral do repositório;
- diff scan para PR/commit/branch;
- deep scan somente quando a intenção for auditoria aprofundada/multi-pass;
- validation/triage/fix para findings já identificados, conforme necessidade.

Não tratar scanner como substituto de arquitetura segura, RLS testada ou testes específicos de autorização.

## 7. GitHub

O repositório GitHub é a **fonte de verdade persistente do projeto**.

Usar o connector para:

- ler documentação antes de alterações;
- buscar a versão atual de arquivos antes de editar;
- documentar decisões aprovadas;
- commits frequentes e descritivos;
- acompanhar branches, PRs, issues e CI quando existirem;
- preservar progresso entre sessões.

Não depender do histórico da conversa para informação que deveria estar versionada.

## 8. Supabase

Quando a implementação do backend começar, usar o connector Supabase quando ele trouxer capacidade direta sobre o projeto.

Casos esperados:

- schema Postgres;
- migrations e SQL;
- RLS;
- autenticação;
- Storage;
- Edge Functions;
- inspeção de logs e comportamento do projeto;
- testes de políticas/autorização quando suportados pelo fluxo.

Antes de usar APIs ou configuração específica do SDK/serviço, combinar com **@Context7** para confirmar documentação atual.

Mudanças destrutivas de banco devem ser deliberadas e verificáveis; não executar operações amplas só porque a ferramenta permite.

## 9. Figma e Canva

São ferramentas opcionais, não parte obrigatória do fluxo.

Usar apenas quando houver benefício claro ou pedido explícito para design/editáveis visuais.

No estado atual do projeto:

- não é necessário continuar criando wireframes por padrão;
- documentação e implementação devem seguir `UX.md`/`FRONTEND.md`;
- nenhuma dessas ferramentas reabre automaticamente o uso de ImageGen;
- não atrasar implementação apenas para produzir mockup que não acrescenta decisão nova.

## 10. Vercel

Usar quando houver uma tarefa concreta de deploy/preview/diagnóstico em Vercel **e somente se Vercel for a plataforma escolhida para aquela etapa**.

Não assumir Vercel como decisão arquitetural apenas porque o plugin está disponível.

Quando escolhido, pode ser usado para:

- configuração de projeto/deploy;
- previews;
- inspeção de builds/logs;
- variáveis/configuração de ambiente apropriadas;
- diagnóstico de deploy.

## 11. OpenAI Developers

O produto **não depende de IA/API paga para suas funções essenciais**.

Usar as skills de OpenAI Developers somente se uma feature de IA for explicitamente aprovada ou se uma tarefa separada exigir integração com OpenAI.

Não introduzir chave de API, custo recorrente ou dependência de modelo como consequência indireta de uma decisão de frontend/importação.

## 12. Plugin Management

Quando uma tarefa exigir capacidade externa que não esteja claramente coberta pelas ferramentas disponíveis:

1. verificar se já existe plugin adequado instalado/conectado;
2. se necessário, usar descoberta de plugins antes de concluir que a capacidade não existe;
3. sugerir instalação apenas quando houver ganho concreto para a tarefa;
4. não instalar/remover/alterar permissões sem necessidade e intenção apropriada.

## 13. Outros plugins conectados

Ferramentas como Linear, Notion, Google Drive, Gmail, Calendar e similares só devem entrar no fluxo quando a tarefa realmente envolver esses sistemas.

O fato de um plugin estar disponível **não muda a fonte de verdade atual**:

- especificações e decisões do Receitas ficam no GitHub;
- não duplicar documentação em Notion/Drive por padrão;
- não criar gestão de projeto em Linear apenas para usar o plugin;
- não acessar e-mail/calendário sem relação direta com uma tarefa solicitada.

## 14. Ordem de combinação comum

### Feature de frontend

```text
Especificações GitHub
      ↓
Superpowers (processo, se aplicável)
      ↓
Context7 (APIs atuais)
      ↓
Supericons (se houver iconografia)
      ↓
Build Web Apps (implementação + navegador/QA)
      ↓
GitHub (documentação + commits)
```

### Feature de backend Supabase

```text
Especificações GitHub
      ↓
Superpowers (plano/TDD, se aplicável)
      ↓
Context7 (SDK/API atual)
      ↓
Supabase (implementação/verificação)
      ↓
Codex Security (quando o risco/etapa justificar)
      ↓
GitHub
```

### Mudança sensível de segurança

```text
AUTH_SECURITY / ARCHITECTURE / especificação relevante
      ↓
Context7 para APIs atuais
      ↓
implementação especializada
      ↓
testes de autorização/segurança
      ↓
Codex Security
      ↓
GitHub
```

Essas sequências são guias de responsabilidade, não obrigação de invocar ferramentas sem utilidade.

## 15. Checklist de uso de ferramentas

Antes de concluir uma tarefa relevante, perguntar:

- [ ] existe documentação atual que eu deveria validar no @Context7?
- [ ] a tarefa visual usa ícones que deveriam passar pelo @Supericons?
- [ ] @Build Web Apps melhora implementação ou QA desta mudança?
- [ ] uma skill Superpowers é apropriada à fase atual?
- [ ] a mudança toca superfície sensível que merece Codex Security?
- [ ] usei o GitHub como fonte de verdade e preservei as decisões?
- [ ] se alterei Supabase, usei a ferramenta especializada e validei segurança?
- [ ] estou usando algum plugin apenas por disponibilidade, sem benefício real? Se sim, remover esse passo.
