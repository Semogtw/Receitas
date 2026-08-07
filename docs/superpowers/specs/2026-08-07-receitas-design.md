# Receitas — Especificação Final de Design

**Data:** 2026-08-07  
**Status:** aguardando aprovação final do usuário antes do plano de implementação  
**Projeto:** Receitas  

> Esta especificação consolida as decisões de produto, UX, arquitetura, segurança, sincronização, dados, operação e qualidade aprovadas durante a fase de design. Ela é a referência de alto nível para o plano de implementação. Documentos especializados em `docs/` continuam normativos nos detalhes.

---

## 1. Visão do produto

Receitas é uma **PWA privada, local-first e mobile-first para exatamente duas pessoas**.

O produto existe para o uso doméstico do próprio par: cadastrar receitas, decidir o que cozinhar, preparar receitas em conjunto, manter histórico visual dos preparos, avaliar cada execução, planejar refeições, organizar compras e preservar os dados com backup/restauração.

Não é SaaS, rede social, catálogo público ou plataforma multiusuário.

A primeira versão deve ser tratada como o **produto pessoal completo desejado**, não como MVP artificialmente reduzido.

### 1.1 Princípios centrais

1. **Exatamente duas pessoas.** O par é a unidade de compartilhamento e segurança.
2. **Local-first.** A interface trabalha prioritariamente sobre dados locais e continua útil sem internet.
3. **Sem perda silenciosa.** Conflitos reais preservam todas as versões relevantes.
4. **Privacidade por padrão.** Dados pessoais, fotos e histórico não são públicos.
5. **Portabilidade.** Backup e restauração fazem parte do produto, não de uma futura fase opcional.
6. **Uso doméstico real.** Ergonomia em celular, cozinha e mercado é mais importante que estética de marketing.
7. **Visual culinário e autoral.** Evitar estética de dashboard SaaS, template ou “feito por IA”.
8. **Custo recorrente obrigatório de US$ 0.** Decisões técnicas devem usar a melhor alternativa gratuita compatível.

---

## 2. Escopo funcional

O produto inclui, na primeira versão:

- autenticação fechada para duas identidades;
- cadastro e edição de receitas;
- ingredientes estruturados;
- etapas estruturadas;
- categorias criadas pelo par;
- fotos da receita;
- histórico de preparos;
- fotos por preparo;
- avaliações individuais e comentários individuais;
- observação compartilhada por preparo;
- favoritos;
- marcador “Queremos fazer”;
- estado derivado “Já fizemos”;
- porções e redimensionamento;
- conversão de unidades culinárias;
- perfis de conversão massa ↔ volume por ingrediente;
- modo cozinha;
- múltiplos timers locais;
- lista de compras compartilhada;
- múltiplas listas nomeadas;
- planejador de refeições;
- importação de receita por URL/texto;
- busca e filtros locais;
- sincronização local-first;
- conflitos explícitos;
- lixeira/soft delete;
- backup/exportação;
- restauração por Mesclar ou Substituir tudo;
- diagnóstico privado e logs sanitizados;
- tema claro e escuro;
- PWA instalável sem App Store.

### 2.1 Fora de escopo

Não incluir:

- múltiplos pares/casais;
- grupos;
- organizações;
- perfis públicos;
- seguidores;
- feed social;
- marketplace;
- catálogo público;
- cobrança/planos;
- publicação obrigatória na App Store;
- arquitetura genérica de multi-tenancy para vários pares;
- IA como dependência obrigatória do produto.

---

## 3. Formação do par, autenticação e ciclo de vida das contas

### 3.1 Modelo de identidade

Autenticação por **e-mail e senha** usando Supabase Auth.

As duas contas precisam ter **e-mail verificado** antes de serem consideradas plenamente configuradas.

Não existe cadastro público.

### 3.2 Bootstrap inicial

O primeiro membro é criado por um **bootstrap único protegido por segredo servidor**.

Regras:

- só funciona enquanto nenhum par foi inicializado;
- segredo de alta entropia;
- segredo nunca entra no bundle do frontend;
- validação servidor/Edge Function;
- criação da primeira identidade/membro e do `pair` deve ser atômica;
- depois do sucesso, bootstrap é consumido permanentemente;
- descobrir a rota ou um segredo antigo não reabre o bootstrap.

### 3.3 Segundo membro

O primeiro membro pode gerar um convite:

- de uso único;
- expiring;
- de alta entropia;
- vinculado ao par;
- validado no backend.

A aceitação deve impedir concorrência que resulte em terceiro membro.

Ao completar duas pessoas, o par fecha definitivamente para o fluxo normal do produto.

### 3.4 Recuperação de senha

Cada identidade existente pode redefinir senha pelo **e-mail verificado**.

Recuperação:

- preserva `user_id`;
- preserva associação ao par;
- nunca cria nova conta;
- nunca reabre bootstrap;
- nunca cria convite;
- nunca aumenta número de membros.

### 3.5 Logout

Logout encerra a sessão do dispositivo e impede acesso subsequente aos dados privados por outra identidade no mesmo navegador.

O armazenamento local deve ser isolado por identidade/par.

Porém, como o produto é local-first, logout **não pode destruir a única cópia conhecida de mutações ou fotos ainda não sincronizadas**. O fluxo de limpeza precisa proteger pendências até existir cópia segura ou tratamento explícito.

### 3.6 Remoção de identidade

“**Sair do par**” não é uma ação comum do produto.

Remover uma identidade é excepcional e administrativa.

Regras:

- não apagar conteúdo compartilhado por cascata;
- não reabrir automaticamente uma vaga;
- não apagar autoria/histórico anterior;
- eventual substituição de membro exige fluxo administrativo específico;
- operação destrutiva deve incentivar/produzir backup antes.

Detalhes normativos: `AUTH_SECURITY.md` e `ACCOUNT_LIFECYCLE.md`.

---

## 4. Receita como entidade duradoura

Cada receita possui, conforme aplicável:

- título;
- descrição/notas;
- rendimento/porções-base;
- tempos;
- categorias;
- ingredientes ordenados;
- etapas ordenadas;
- foto de capa;
- galeria de referência;
- origem/importação;
- favorito;
- “Queremos fazer”;
- histórico de preparos.

### 4.1 Estados organizacionais

**Favorito** é manual.

**Queremos fazer** é manual.

**Já fizemos** é derivado da existência de pelo menos um preparo válido no histórico.

Não persistir estados derivados sem necessidade quando eles puderem ser calculados com segurança.

---

## 5. Categorias

Categorias são criadas pelos próprios usuários.

Uma receita pode ter múltiplas categorias.

A relação é muitos-para-muitos.

Categorias são ferramenta de organização, não uma enumeração fixa nem uma nuvem de badges decorativos.

Excluir uma categoria não exclui receitas.

---

## 6. Ingredientes

Cada ingrediente estruturado representa, no mínimo:

- ID estável;
- posição/ordem;
- quantidade;
- unidade;
- nome do ingrediente;
- observação opcional;
- forma normalizada quando útil para busca/consolidação.

A quantidade deve suportar:

- números;
- frações culinárias;
- valores aproximados;
- expressões semanticamente não numéricas como “a gosto”.

Não usar posição como identidade.

O sistema não deve depender de um catálogo global massivo de ingredientes.

---

## 7. Etapas de preparo

Cada etapa possui:

- ID estável;
- posição;
- instrução;
- duração opcional;
- observação opcional.

Etapas são reorderáveis.

Duração pode alimentar timer, mas timer não faz parte da definição canônica da receita.

---

## 8. Porções e redimensionamento

Toda receita pode informar porções/rendimento-base.

Usuário pode escolher:

- multiplicadores como 0,5x, 1,5x, 2x, 3x;
- número exato de porções.

Ingredientes quantitativos escalam proporcionalmente.

Expressões como “a gosto” permanecem semanticamente estáveis.

Alterar porções na visualização não edita a receita original.

---

## 9. Conversão de unidades

Conversão é feature de primeira classe.

### 9.1 Volume ↔ volume

Conversões compatíveis como:

- xícara;
- colher de sopa;
- colher de chá;
- mL;

podem ser realizadas diretamente.

### 9.2 Massa ↔ volume

Não existe conversão universal de gramas para xícaras/colheres.

O sistema usa `ingredient_conversion_profiles` com equivalências específicas por ingrediente.

Precedência:

```text
perfil personalizado do par
        ↓
perfil padrão conhecido
        ↓
sem conversão automática
```

Regras:

- nunca inventar fator desconhecido;
- marcar aproximações;
- apresentar frações culinárias amigáveis quando útil;
- redimensionar porções antes de converter unidade;
- conversão temporária não altera receita;
- conversão permanente só acontece por ação explícita de edição.

---

## 10. Histórico de preparos

Receita e execução são entidades diferentes.

Cada ocasião em que a receita é realmente feita gera `cooking_session` próprio.

O preparo preserva o contexto histórico mesmo depois de a receita ser editada.

Pode conter:

- data/hora;
- porções preparadas;
- snapshot/referência suficiente da versão da receita;
- observação compartilhada;
- avaliações individuais;
- comentários individuais;
- fotos daquele preparo.

### 10.1 Avaliações individuais

Cada membro possui sua própria avaliação por preparo.

Escala:

- 0 a 10;
- incrementos de 0,5.

No máximo uma avaliação ativa por `(cooking_session_id, user_id)`.

Uma pessoa editar a própria avaliação nunca altera a outra.

Cada avaliação pode ter comentário pessoal opcional.

O preparo pode ter observação compartilhada separada.

Médias são derivadas:

- média daquele preparo;
- média histórica do par;
- média histórica por pessoa;
- evolução ao longo do tempo.

Ausência de nota não vale zero.

---

## 11. Modo cozinha

Modo cozinha existe para consulta durante preparo.

Objetivos:

- legibilidade maior;
- menos distração;
- controles grandes;
- avanço simples;
- ingredientes acessíveis;
- tentativa de manter tela acordada quando a plataforma permitir;
- offline funcional.

### 11.1 Preparo em andamento

Abrir/iniciar modo cozinha **não cria histórico**.

O progresso fica em estado local temporário.

Inclui:

- posição/etapas;
- marcações locais;
- timers;
- dados necessários para retomada.

Se usuário sair, pode **Retomar preparo**.

A ação **Encerrar sem registrar** abandona o estado temporário sem criar histórico.

A ação **Finalizar preparo** cria o `cooking_session`.

Finalização precisa ser idempotente para evitar duplicação acidental.

Pode finalizar offline e sincronizar depois.

Depois de finalizar, interface pode oferecer fotos, notas, comentários e observação compartilhada.

### 11.2 Timers

Suportar múltiplos timers simultâneos.

Cada timer identifica receita/etapa de origem quando necessário.

Ações:

- iniciar;
- pausar;
- retomar;
- cancelar;
- ajustar.

Persistência deve ser baseada em timestamps/deadlines, não apenas contagem em memória.

Timers são locais ao dispositivo; não há requisito de sincronização de timer ativo entre dispositivos.

Alertas:

- som/visual;
- notificação do sistema quando plataforma permitir.

O produto deve comunicar honestamente limitações de background do iOS/browser.

Detalhes: `COOKING_MODE.md`.

---

## 12. Fotos e mídia

Existem dois conceitos separados:

1. `recipe_photos` — capa/galeria permanente da receita;
2. `cooking_session_photos` — fotos de uma execução específica.

Buckets remotos são privados.

### 12.1 Política local/offline

Priorizar localmente:

- capas;
- miniaturas;
- fotos recentes.

Originais sincronizados podem ficar no Storage privado e ser baixados sob demanda.

Fotos recém-tiradas permanecem localmente até confirmação do upload.

Falha de upload não pode apagar a única cópia.

Cada receita possui **Disponibilizar offline**, baixando/preparando seus dados e mídias para aquele dispositivo.

A preferência é local por dispositivo.

Limpar cache não exclui foto canônica.

Interface diferencia:

- disponível offline;
- download parcial/pendente;
- original exige conexão.

Detalhes: `MEDIA_STORAGE.md`.

---

## 13. Lista de compras

O produto suporta **múltiplas listas nomeadas compartilhadas**.

Uma lista pode ser marcada como padrão.

Exemplos:

- Mercado;
- Atacado;
- Festa.

Itens podem ser:

- manuais;
- gerados por receita;
- gerados a partir do planejador.

Cada item suporta, conforme aplicável:

- nome;
- quantidade;
- unidade;
- comprado/não comprado;
- origem;
- ordem;
- referência a receita/planejamento.

### 13.1 Consolidação

Unidades compatíveis podem ser convertidas e somadas.

Massa ↔ volume só quando houver perfil conhecido do ingrediente.

Nunca inventar equivalência só para consolidar.

Detalhes: `SHOPPING_LISTS.md`.

---

## 14. Planejador de refeições

Planejador é compartilhado.

Cada entrada pode possuir:

- data;
- período de refeição;
- horário opcional;
- receita;
- porções;
- observação opcional.

Períodos são criados pelo par, por exemplo:

- Café;
- Almoço;
- Lanche;
- Jantar.

O planejador pode gerar itens para lista de compras a partir de intervalo selecionado.

### 14.1 Notificações

O planejador é **somente visual**.

Não há lembretes/notificações de refeições planejadas.

Notificações ficam reservadas a necessidades temporais reais como timers.

---

## 15. Importação de receitas

Usuário pode colar uma URL.

Fluxo preferido:

1. backend valida URL;
2. fetch servidor;
3. tenta `Schema.org Recipe`/JSON-LD primeiro;
4. fallback de HTML/metadados;
5. produz rascunho;
6. usuário revisa;
7. só então salva receita canônica.

Campos possíveis:

- título;
- porções;
- tempos;
- ingredientes;
- etapas;
- imagem;
- URL de origem.

Falhas parciais preservam o que foi extraído corretamente.

Fallback adicional: colar texto da receita e estruturar deterministicamente antes da revisão.

Não depender de API paga de IA.

### 15.1 Segurança da importação

Obrigatório:

- apenas esquemas permitidos, como HTTP/HTTPS;
- proteção SSRF;
- rejeitar localhost/redes privadas/link-local/reservadas após resolução;
- revalidar redirects;
- timeout;
- limite de tamanho;
- limite/content type;
- evitar credenciais embutidas em URL;
- sanitizar conteúdo;
- nunca renderizar HTML arbitrário da página importada.

Detalhes: `IMPORTING.md`.

---

## 16. Busca, filtros e ordenação

Busca funciona **localmente** sobre dados disponíveis no dispositivo.

Pesquisar por:

- título;
- ingredientes;
- categorias;
- descrição/notas.

Filtros combináveis:

- categorias;
- Favoritos;
- Queremos fazer;
- Já fizemos.

Ordenações:

- mais recentes;
- nome;
- mais preparadas;
- melhor avaliadas.

“Mais preparadas” é derivado do histórico.

“Melhor avaliadas” usa avaliações existentes e não trata ausência de nota como zero.

Qualquer índice local é reconstruível e não vira nova fonte de verdade.

Detalhes: `SEARCH_FILTERS.md`.

---

## 17. Exclusão e lixeira

Conteúdo importante usa soft delete.

Entidades relevantes podem ser restauradas.

Exclusão definitiva exige ação explícita.

Não existe expiração automática obrigatória da lixeira.

Soft delete participa da sincronização/versionamento.

Editar enquanto outro dispositivo exclui a mesma entidade gera conflito.

---

## 18. Sincronização local-first

### 18.1 Modelo

```text
UI
 ↓
Banco local
 ↓
Outbox/mutações
 ↓
PowerSync
 ↓
Supabase/Postgres
```

A UI não espera round-trip remoto para refletir uma edição local válida.

Entidades sincronizáveis usam IDs estáveis gerados antes de chegar ao servidor.

Mutações possuem metadados suficientes para conhecer a base/revisão sobre a qual foram criadas.

### 18.2 Política de conflitos

Não usar last-write-wins silencioso para conflitos reais.

Auto-merge só quando comprovadamente seguro.

Exemplos de merge seguro:

- avaliações de usuários diferentes;
- campos semanticamente independentes quando não há sobreposição;
- entidades-filhas realmente independentes.

Gerar conflito explícito em:

- mesmo campo alterado de formas diferentes;
- mesmo ingrediente/etapa alterado concorrentemente;
- estruturas incompatíveis;
- delete vs edit;
- reordenação concorrente não conciliável.

Conflito preserva:

- base;
- versão A;
- versão B;
- entidade/ID;
- estado;
- resolução posterior.

A versão estável continua consultável.

Conflitos não bloqueiam o resto do app.

Detalhes: `SYNC.md`.

---

## 19. Backup, exportação e restauração

Backup completo em formato aberto.

Estrutura conceitual:

```text
backup.zip
├── manifest.json
├── data/
│   └── *.json
└── media/
    └── ...
```

Inclui:

- receitas;
- categorias;
- ingredientes;
- etapas;
- histórico;
- avaliações/comentários;
- planejamento;
- compras;
- preferências relevantes;
- perfis de conversão;
- fotos/mídias incluídas.

### 19.1 Validação

Todo pacote é validado antes de alterar estado.

Rejeitar:

- manifesto inválido;
- formato incompatível;
- referências inconsistentes;
- arquivos inesperados perigosos;
- path traversal/zip-slip;
- ZIP bomb;
- conteúdo acima de limites.

Falha de validação não aplica restauração parcial.

### 19.2 Modo Mesclar

Usa IDs estáveis.

Adiciona dados ausentes.

Divergências reais entram no sistema de conflitos.

### 19.3 Modo Substituir tudo

Antes de qualquer alteração destrutiva:

1. gerar backup de segurança do estado atual;
2. validar esse backup;
3. só então substituir.

Backup nunca cria terceiro usuário, reabre bootstrap ou importa credenciais como novas identidades.

Detalhes: `BACKUP_RESTORE.md`.

---

## 20. Modelo de dados de alto nível

Entidades principais:

- `pairs`;
- `pair_members`;
- `pair_invites`;
- `recipes`;
- `recipe_ingredients`;
- `recipe_steps`;
- `categories`;
- `recipe_categories`;
- `recipe_photos`;
- `cooking_sessions`;
- `cooking_session_ratings`;
- `cooking_session_photos`;
- `meal_periods`;
- `meal_plan_entries`;
- `shopping_lists`;
- `shopping_items`;
- `ingredient_conversion_profiles`;
- `imports`;
- `conflicts`.

Estruturas locais adicionais:

- outbox;
- fila de uploads;
- cache de arquivos;
- estado de retry;
- preparo em andamento;
- timers;
- índices locais reconstruíveis.

Praticamente toda entidade compartilhada carrega ou deriva `pair_id`.

Detalhes: `DATA_MODEL.md`.

---

## 21. Arquitetura técnica

### 21.1 Stack

- **React + TypeScript + Vite**;
- **PWA** com manifest/service worker;
- **PowerSync** para banco local/sync Web;
- **Supabase Postgres** como cópia remota canônica compartilhada;
- **Supabase Auth**;
- **Supabase Storage privado**;
- **Supabase Edge Functions** para operações privilegiadas;
- **Cloudflare Pages Free** para hosting estático.

### 21.2 Regra de custo

Custo recorrente obrigatório deve permanecer **US$ 0**.

Configuração atual:

- Cloudflare Pages Free;
- Supabase Free;
- PowerSync Cloud Free.

Supabase e PowerSync podem pausar/desativar depois de cerca de uma semana de inatividade conforme regras atuais dos planos gratuitos.

Esse trade-off é aceito porque o produto é local-first.

Não usar keep-alive artificial para contornar políticas dos provedores.

Se uma limitação gratuita se tornar material, pesquisar a melhor alternativa gratuita atual antes de considerar solução paga.

Detalhes: `ARCHITECTURE.md` e `DEPLOYMENT_OPERATIONS.md`.

---

## 22. Segurança

### 22.1 Autorização

Autenticação não basta.

RLS obrigatório em dados compartilhados.

Regra conceitual:

```text
usuário autenticado
        ↓
pertence ao pair_id?
  sim → permitir
  não → negar
```

### 22.2 Segredos

Nunca no frontend:

- `service_role`;
- segredo de bootstrap;
- tokens administrativos;
- credenciais de operações privilegiadas.

Variáveis `VITE_*` são públicas por definição operacional do projeto.

### 22.3 Storage

Buckets privados.

Autorização equivalente à dos registros.

Sem URLs públicas permanentes por padrão.

### 22.4 Superfícies sensíveis

Rate limiting/abuse controls onde aplicável:

- login;
- bootstrap;
- convite;
- recuperação;
- verificação de e-mail;
- importação.

### 22.5 Web/PWA

Configurar e testar:

- HTTPS;
- CSP restritiva;
- `X-Content-Type-Options`;
- `Referrer-Policy`;
- `Permissions-Policy`;
- proteção de framing quando aplicável;
- caching seguro;
- service worker sem cache indiscriminado de conteúdo privado.

---

## 23. Direção visual e UX

### 23.1 Personalidade

**Caderno/livro de receitas moderno**.

Deve parecer:

- doméstico;
- acolhedor;
- limpo;
- funcional;
- culinário;
- bem cuidado;
- suficientemente denso para uso diário.

Fotografia de comida é o principal elemento visual.

### 23.2 Evitar estética genérica de IA/template

Evitar deliberadamente:

- gradiente roxo/azul sem relação temática;
- glassmorphism;
- cards para tudo;
- excesso de pills/badges;
- cantos arredondados em todo componente;
- grandes vazios decorativos;
- hero de marketing dentro do app;
- dashboard cheio de métricas irrelevantes;
- ilustração genérica de startup;
- mistura de famílias de ícones;
- headings gigantes;
- microcopy artificialmente animada;
- motion decorativo que atrasa uso.

### 23.3 Cores

Direção:

- creme/off-white;
- carvão/grafite;
- terracota;
- tomate;
- oliva;
- tons naturais de papel, madeira, ervas e comida.

Não é obrigatório usar todas as cores simultaneamente.

Cada fluxo/superfície deve evitar competir com múltiplos acentos fortes.

### 23.4 Tema

Claro e escuro.

Tema escuro é desenhado conscientemente, não simples inversão.

Preferência é pessoal/dispositivo por padrão.

### 23.5 Tipografia

- ótima legibilidade mobile;
- português completo;
- frações/numerais culinários;
- títulos com personalidade sem exagero;
- corpo e controles rápidos de escanear;
- `tabular-nums` para timers/quantidades quando útil.

### 23.6 Cards/superfícies

Cards só quando representam agrupamento real.

Preferir frequentemente:

- listas;
- divisores;
- espaçamento;
- seções abertas;
- linhas com ações contextuais.

Sem card dentro de card como linguagem padrão.

### 23.7 Ícones

Usar uma família principal coerente.

@Supericons deve apoiar seleção/revisão quando iconografia for criada ou alterada.

Sugestões automáticas precisam de validação semântica e visual.

Controles somente por ícone precisam de nome acessível.

### 23.8 Mobile-first

Prioridade especial para iPhone/PWA.

- targets confortáveis;
- nada crítico depende de hover;
- safe areas quando relevantes;
- teclado virtual considerado;
- `dvh`/estratégia apropriada para viewport móvel;
- navegação primária próxima do polegar.

Desktop deve aproveitar espaço, não apenas esticar mobile.

### 23.9 Estados completos

Quando aplicável:

- default;
- hover;
- focus-visible;
- pressed;
- disabled;
- loading;
- empty;
- error;
- offline;
- sync pendente;
- sincronizando;
- conflito;
- upload/download pendente.

### 23.10 Motion

Baixo/moderado e funcional.

Preferir CSS/transitions simples.

`prefers-reduced-motion` obrigatório.

Sem scroll hijacking.

Sem GSAP como dependência padrão.

Detalhes: `UX.md` e `FRONTEND.md`.

---

## 24. Navegação e superfícies principais

Navegação deve ser simples, mobile-first e próxima do polegar.

Conceitos principais:

- Receitas/Início;
- Planejar;
- Compras;
- acesso contextual a criação/registro/histórico.

Não colocar funções raras na navegação principal só para preencher espaço.

### 24.1 Tela de receita

Prioridade visual:

1. foto/identidade;
2. rendimento/porções e escala/conversão;
3. ingredientes;
4. preparo;
5. histórico/fotos;
6. ações secundárias.

Deve parecer uma excelente página de receita, não dashboard.

### 24.2 Planejador

Parece agenda de refeições, não calendário corporativo.

### 24.3 Compras

Otimizada para mercado/cozinha:

- targets grandes;
- itens comprados reduzidos visualmente;
- edição rápida;
- origem sob demanda.

### 24.4 Conflitos

Tela transmite segurança, não urgência artificial.

Explica que nenhuma versão será perdida.

Permite adiar resolução.

---

## 25. Frontend React

### 25.1 Estado mínimo

Persistir apenas fontes de verdade necessárias.

Derivar:

- médias;
- filtros;
- seleções deriváveis;
- estados calculáveis.

Evitar duplicar entidade inteira quando ID estável basta.

### 25.2 Effects

`useEffect` é para sincronização com sistemas externos/ciclo de vida real, não para recalcular estado derivável.

### 25.3 Refs

Usar para valores persistentes que não precisam causar render:

- timeout IDs;
- DOM refs;
- handles externos;
- transitórios não visuais.

### 25.4 Organização

Direção:

```text
src/
├── app/
├── features/
├── components/
├── hooks/
├── lib/
├── data/
├── styles/
└── test/
```

`App` é composição, não monólito.

Abstrações surgem de repetição real.

---

## 26. PWA

PWA deve:

- instalar pela tela inicial;
- possuir manifest coerente;
- precachear shell/assets necessários;
- trabalhar com dados locais;
- não cachear arbitrariamente conteúdo privado;
- possuir UX clara para atualização/offline-ready;
- sobreviver a atualização sem perder mutações locais;
- suportar deep links/SPA no host.

Service worker não é banco de dados.

---

## 27. Erros, observabilidade e diagnóstico

Sem analytics comportamental por padrão.

Logs devem ser sanitizados.

Não registrar:

- conteúdo de receitas;
- tokens;
- segredos;
- e-mails completos desnecessariamente;
- fotos;
- conteúdo pessoal em payloads de log.

Erros de sync/upload mantêm contexto técnico suficiente para retry.

Pode existir histórico local curto de falhas relevantes.

Ação **Exportar diagnóstico** gera arquivo contendo, de forma sanitizada:

- versão do app;
- plataforma/browser;
- estado de sync;
- estados técnicos úteis;
- erros recentes.

Logging detalhado só temporariamente para depuração.

Nenhum erro deve resultar em perda silenciosa.

Detalhes: `OBSERVABILITY.md`.

---

## 28. Deploy e operação

### 28.1 Frontend

Cloudflare Pages Free.

Pipeline conceitual:

```text
GitHub main
  ↓
gates
  ↓
build Vite
  ↓
Cloudflare Pages
```

### 28.2 Backend/sync

- Supabase Free;
- PowerSync Cloud Free.

### 28.3 Hibernação

Se serviço pausar por inatividade:

- app continua com dados locais;
- mutações ficam pendentes;
- uploads ainda únicos localmente são preservados;
- serviço é retomado;
- filas drenam depois.

Runbook deve existir antes do primeiro uso real.

### 28.4 Domínio

Domínio próprio é opcional e não requisito.

Subdomínio gratuito do host preserva custo zero.

Detalhes: `DEPLOYMENT_OPERATIONS.md`.

---

## 29. Testes e quality gates

Stack gratuita:

- Vitest;
- Testing Library;
- Playwright;
- QA Browser/@Build Web Apps;
- testes SQL/RLS;
- Codex Security quando aplicável.

### 29.1 Coberturas críticas

Testar:

- conversão/redimensionamento;
- consolidação de compras;
- filtros;
- histórico/avaliações;
- conflicts;
- idempotência;
- offline/reconnect;
- sync concorrente;
- uploads;
- timers;
- importação;
- backup/restore;
- RLS/Auth;
- service worker;
- acessibilidade.

### 29.2 Browser matrix

Pelo menos, conforme o fluxo:

- Chromium desktop;
- WebKit desktop;
- perfil iPhone/mobile Safari;
- Chromium mobile quando útil.

Limitações específicas de PWA instalada em iOS devem ser verificadas em dispositivo real quando possível.

### 29.3 Gate típico

```text
lint/typecheck
    ↓
Vitest
    ↓
build
    ↓
Playwright smoke crítico
    ↓
QA renderizado quando UI mudou
```

Se um gate não puder ser executado no ambiente atual, documentar a limitação e continuar com os gates possíveis.

Detalhes: `TESTING.md`.

---

## 30. Ferramentas e processo de desenvolvimento

### 30.1 Autonomia técnica

Decisões puramente técnicas podem ser fechadas pelo agente sem pedir aprovação adicional quando:

- preservam comportamento aprovado;
- mantêm custo recorrente obrigatório US$ 0;
- usam a melhor opção gratuita compatível;
- não reduzem segurança/privacidade.

Perguntar ao usuário quando houver mudança real de produto/UX ou custo obrigatório.

### 30.2 Plugins e skills

Usar quando trouxer benefício real:

- **@Build Web Apps** — frontend/QA renderizado;
- **@Context7** — APIs/configuração atual de bibliotecas;
- **@Supericons** — iconografia;
- **Superpowers** — design, planejamento, TDD, debugging, verificação;
- **Codex Security** — auditorias de segurança;
- **Supabase** — backend/DB/RLS/Auth/Storage/Functions;
- **GitHub** — fonte de verdade e histórico;
- demais plugins especializados — quando a tarefa realmente envolver sua responsabilidade.

A especificação do projeto sempre vence defaults de plugin.

### 30.3 ImageGen

Não usar ImageGen no fluxo visual sem nova autorização explícita do usuário.

### 30.4 Commits

Documentar e commitar frequentemente em marcos lógicos.

Não deixar decisões importantes somente na memória da sessão.

Detalhes: `TOOLS_AND_PLUGINS.md` e `DEVELOPMENT_WORKFLOW.md`.

---

## 31. Critérios de aceite do produto

A primeira versão é considerada coerente com esta especificação quando:

1. apenas as duas identidades autorizadas acessam dados;
2. PWA funciona como aplicação doméstica real em mobile;
3. receitas podem ser criadas/editadas offline;
4. sync posterior não perde alterações;
5. conflitos incompatíveis preservam versões;
6. fotos novas nunca são descartadas antes de cópia segura;
7. histórico só nasce quando preparo é finalizado;
8. avaliações individuais permanecem independentes;
9. porções/conversões funcionam sem corromper receita original;
10. compras e planejador funcionam offline;
11. busca e filtros funcionam localmente;
12. backup completo pode ser restaurado;
13. restauração destrutiva possui backup de segurança anterior;
14. importação por URL exige revisão e aplica proteções SSRF;
15. UX não assume estética genérica SaaS/template;
16. claro/escuro e acessibilidade básica funcionam;
17. erros/sync pendente são explicáveis e recuperáveis;
18. segredos não entram no frontend;
19. RLS protege todos os dados compartilhados;
20. deploy e serviços essenciais permanecem em opções gratuitas;
21. testes cobrem invariantes críticas e fluxos reais.

---

## 32. Documentos normativos relacionados

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/UX.md`
- `docs/FRONTEND.md`
- `docs/SYNC.md`
- `docs/AUTH_SECURITY.md`
- `docs/ACCOUNT_LIFECYCLE.md`
- `docs/IMPORTING.md`
- `docs/BACKUP_RESTORE.md`
- `docs/MEDIA_STORAGE.md`
- `docs/COOKING_MODE.md`
- `docs/SHOPPING_LISTS.md`
- `docs/SEARCH_FILTERS.md`
- `docs/OBSERVABILITY.md`
- `docs/DEPLOYMENT_OPERATIONS.md`
- `docs/TESTING.md`
- `docs/TOOLS_AND_PLUGINS.md`
- `docs/DEVELOPMENT_WORKFLOW.md`

---

## 33. Próximo gate

Esta especificação encerra a fase de design **somente depois de aprovação explícita do usuário**.

Após aprovação:

1. usar a skill `superpowers:writing-plans`;
2. criar plano detalhado em `docs/superpowers/plans/2026-08-07-receitas.md` (ou nome equivalente adequado ao plano);
3. decompor a implementação em tarefas pequenas e verificáveis;
4. seguir TDD e gates apropriados;
5. começar implementação apenas depois do plano.

Até essa aprovação, não iniciar scaffold/implementação do aplicativo.
