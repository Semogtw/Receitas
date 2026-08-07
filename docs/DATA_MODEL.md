# Modelo de Dados

> Documento vivo do domínio. Nomes finais de colunas podem mudar durante a implementação, mas as entidades e invariantes abaixo representam decisões já aprovadas.

## 1. Princípios do domínio

- O sistema possui um único **par** como unidade de compartilhamento.
- O par possui no máximo **dois membros**.
- Receitas são entidades duradouras; cada preparo realizado é um evento separado.
- Ingredientes e etapas são estruturados e ordenáveis.
- Categorias são criadas pelo par e possuem relação muitos-para-muitos com receitas.
- Exclusões importantes são recuperáveis.
- Conflitos são entidades explícitas, não apenas logs descartáveis.
- Fotos da receita e fotos de preparos possuem ciclos de vida distintos.
- Avaliações e comentários de preparos pertencem individualmente a cada membro; observações compartilhadas pertencem ao preparo.
- Entidades sincronizáveis usam IDs estáveis e metadados de versão suficientes para detectar concorrência.
- Auto-merge só é permitido quando a união for inequivocamente segura; ambiguidades viram conflito explícito.

A política normativa de sincronização está em [`SYNC.md`](./SYNC.md).

## 2. Entidades principais

### `pairs`

Representa o par de usuários.

Responsabilidades:

- identidade do espaço compartilhado;
- estado de formação do par;
- preferências compartilhadas relevantes;
- raiz de autorização para dados do domínio.

Invariante: um `pair` nunca possui mais de dois membros ativos.

### `pair_members`

Relaciona usuários autenticados ao par.

Campos conceituais:

- `pair_id`;
- `user_id`;
- papel administrativo simples, se necessário;
- data de entrada;
- estado ativo/removido quando aplicável.

Os papéis não devem criar diferenças arbitrárias de acesso às receitas compartilhadas.

### `pair_invites`

Convite de uso único para formar o par.

Deve permitir:

- token/identificador seguro;
- expiração;
- estado de consumo;
- vínculo ao par;
- auditoria mínima de criação e aceitação.

A aceitação válida deve ser atômica em relação à criação do segundo membro.

## 3. Receitas

### `recipes`

Campos conceituais:

- `id`;
- `pair_id`;
- `title`;
- `description`;
- `base_yield_quantity`;
- `base_yield_unit`;
- tempos de preparo/cozimento quando aplicável;
- `cover_photo_id` ou referência equivalente;
- favorito/estado organizacional;
- origem/importação;
- metadados de versionamento e sincronização;
- `deleted_at`.

### `recipe_ingredients`

Ingrediente estruturado e ordenado.

Campos conceituais:

- `id` estável próprio;
- `recipe_id`;
- `position` ou mecanismo de ordenação equivalente;
- quantidade estruturada;
- unidade;
- nome exibido do ingrediente;
- forma normalizada para busca/consolidação;
- observação;
- indicador de aproximação/opcional quando necessário;
- metadados de versão;
- `deleted_at` quando a estratégia exigir histórico individual.

A quantidade não deve depender apenas de `float`. O modelo precisa preservar precisão suficiente para frações culinárias e permitir valores não numéricos quando semanticamente necessários.

A posição nunca deve ser usada como identidade do ingrediente. Reordenação concorrente deve seguir a política de `SYNC.md`.

### `recipe_steps`

Etapa estruturada do preparo.

Campos conceituais:

- `id` estável próprio;
- `recipe_id`;
- `position` ou mecanismo de ordenação equivalente;
- instrução;
- duração opcional;
- observação opcional;
- metadados de versão;
- estado de exclusão quando necessário.

A posição nunca deve ser usada como identidade da etapa.

## 4. Categorias

### `categories`

Categorias pertencem ao par e são criadas livremente pelos usuários.

Campos conceituais:

- `id`;
- `pair_id`;
- `name`;
- metadados visuais opcionais e discretos;
- `deleted_at`.

### `recipe_categories`

Tabela de associação muitos-para-muitos.

Uma receita pode possuir zero, uma ou várias categorias. Excluir/restaurar uma categoria não deve destruir receitas.

## 5. Fotos

### `recipe_photos`

Mídia permanente associada à definição da receita.

Campos conceituais:

- `id`;
- `recipe_id`;
- referência local;
- referência remota quando sincronizada;
- ordem na galeria;
- flag ou relacionamento de capa;
- estado de upload;
- metadados do arquivo;
- metadados de versão quando o registro for editável;
- `deleted_at`.

### `cooking_session_photos`

Mídia de uma execução específica. Nunca deve ser misturada semanticamente com `recipe_photos`.

Uploads binários usam fila separada da sincronização dos metadados. Falha de upload não desfaz o registro do preparo ou da receita.

## 6. Histórico de preparos

### `cooking_sessions`

Representa uma ocasião em que a receita foi preparada.

Campos conceituais:

- `id`;
- `pair_id`;
- `recipe_id`;
- usuário que registrou;
- data/hora;
- porções efetivamente preparadas;
- `shared_observation`, opcional, para anotação conjunta do preparo;
- referência de versão;
- snapshot suficiente para preservar o estado relevante da receita usada naquele preparo;
- metadados de versionamento e sincronização;
- `deleted_at`.

A entidade do preparo **não armazena uma única nota compartilhada**. A observação compartilhada também não substitui os comentários pessoais dos membros.

### `cooking_session_ratings`

Representa a avaliação individual de um membro para um preparo específico.

Campos conceituais:

- `id`;
- `cooking_session_id`;
- `pair_id`;
- `user_id`;
- `score`, restrito ao intervalo de 0 a 10 em incrementos de 0,5;
- `comment`, comentário individual opcional daquele membro;
- timestamps de criação/edição;
- metadados de versionamento e sincronização;
- `deleted_at` quando necessário para restauração/auditoria.

Invariantes:

- existe no máximo **uma avaliação ativa por (`cooking_session_id`, `user_id`)**;
- apenas membros do mesmo `pair_id` do preparo podem avaliá-lo;
- editar a própria nota ou comentário não altera a avaliação nem o comentário do outro membro;
- um preparo pode existir sem avaliações;
- a ausência de avaliação de um membro não invalida a avaliação do outro;
- comentário individual e `shared_observation` são campos semanticamente distintos e não devem ser fundidos durante sincronização ou resolução de conflitos;
- avaliações dos dois membros são entidades independentes e podem sincronizar simultaneamente sem conflito entre si;
- médias são valores derivados e não precisam ser persistidas como fonte de verdade.

Agregados possíveis derivados em leitura:

- média do preparo;
- média histórica do par para a receita;
- média histórica por membro;
- evolução das notas por preparo.

### Snapshot da receita

O histórico não pode ser reinterpretado automaticamente à luz da receita atual.

Se a receita foi feita com 200 g de um ingrediente e posteriormente editada para 250 g, o registro antigo deve continuar capaz de representar o preparo original.

O snapshot deve ser leve, mas suficiente para reconstruir o contexto culinário relevante daquela execução.

## 7. Planejamento

### `meal_periods`

Períodos personalizados pelo par.

Exemplos: Café, Almoço, Lanche, Jantar.

Campos conceituais:

- `id`;
- `pair_id`;
- nome;
- posição/ordem opcional;
- metadados de versão quando editável;
- `deleted_at`.

### `meal_plan_entries`

Campos conceituais:

- `id`;
- `pair_id`;
- `recipe_id`;
- `meal_period_id` opcional;
- data;
- horário opcional;
- porções planejadas;
- observação opcional;
- metadados de versionamento e sincronização;
- `deleted_at`.

## 8. Lista de compras

### `shopping_lists`

A modelagem não deve impedir múltiplas listas no futuro, ainda que a experiência inicial priorize uma lista compartilhada ativa.

### `shopping_items`

Campos conceituais:

- `id` estável;
- `shopping_list_id`;
- `pair_id` ou associação inequívoca à lista do par;
- nome do item;
- nome normalizado;
- quantidade;
- unidade;
- comprado/não comprado;
- origem manual ou gerada;
- referência opcional a receita/planejamento;
- posição;
- metadados de sincronização e versão;
- `deleted_at`.

## 9. Perfis de conversão de ingredientes

### `ingredient_conversion_profiles`

Permite conversões massa ↔ volume dependentes do ingrediente.

Deve distinguir:

- equivalências padrão distribuídas pelo app;
- equivalências personalizadas pelo par;
- origem/referência da equivalência quando útil;
- indicador de aproximação;
- unidade-base e unidade-alvo;
- fator ou relação usada.

Regra de precedência:

```text
equivalência personalizada do par
          ↓
equivalência padrão conhecida
          ↓
sem conversão automática
```

O nome normalizado do ingrediente é usado para buscar perfis, mas o sistema deve permitir correção manual quando a correspondência automática não for apropriada.

## 10. Importações

### `imports`

Registra tentativas de importar receitas por URL ou texto.

Pode conter:

- URL de origem quando aplicável;
- data;
- usuário;
- estado da importação;
- parser/estratégia usada;
- conteúdo extraído ou referência ao rascunho;
- erros parciais relevantes.

O resultado importado só vira receita definitiva após revisão do usuário.

A especificação detalhada do importador está em [`IMPORTING.md`](./IMPORTING.md).

## 11. Conflitos

### `conflicts`

Registro explícito de edição concorrente.

Campos conceituais:

- `id`;
- tipo da entidade;
- `entity_id`;
- `pair_id`;
- versão/base comum conhecida;
- versão ou alteração A;
- versão ou alteração B;
- estado: aberto/resolvido;
- estratégia de resolução;
- resultado resolvido;
- responsável pela resolução;
- timestamps;
- metadados opcionais da operação/dispositivo quando úteis para diagnóstico.

Invariantes:

- conflito aberto preserva todas as versões necessárias para resolução;
- resolver conflito produz uma nova versão explícita da entidade;
- conflito não é criado quando alterações concorrentes forem demonstravelmente independentes e puderem ser mescladas com segurança;
- exclusão concorrendo com edição da mesma entidade gera conflito;
- conflitos não devem ser apagados automaticamente logo após resolução, pois fazem parte da explicabilidade e proteção contra perda de dados.

A definição de quais alterações podem ser auto-mescladas está em [`SYNC.md`](./SYNC.md).

## 12. Exclusão e lixeira

Entidades recuperáveis usam `deleted_at` ou mecanismo equivalente.

Uma visualização lógica de lixeira pode ser construída a partir dessas entidades; não é obrigatório duplicar todo conteúdo em uma tabela `trash_entries` se isso gerar inconsistência.

Regras:

- soft delete sincroniza como alteração normal;
- restauração limpa o estado de exclusão de forma explícita;
- exclusão definitiva exige ação específica;
- cascatas destrutivas devem ser evitadas para conteúdo recuperável;
- soft delete participa do versionamento e pode conflitar com edição concorrente.

## 13. Estado local de sincronização

Algumas estruturas pertencem apenas ao cliente/local store e não precisam existir como tabelas públicas do domínio remoto.

Exemplos conceituais:

- fila de mutações pendentes;
- fila de uploads de mídia;
- cache de arquivos;
- metadados transitórios de retry;
- indicadores de conectividade.

Cada operação pendente deve poder carregar, conforme a implementação:

- ID estável da operação;
- entidade alvo;
- tipo de operação;
- base/revisão conhecida;
- payload necessário;
- estado de tentativa;
- último erro relevante;
- timestamps.

Essas estruturas não devem ser confundidas com o modelo de negócio remoto.

## 14. Preferências

Preferências compartilhadas podem incluir:

- unidade de apresentação preferida;
- comportamento padrão de conversões;
- períodos de refeição;
- opções visuais compartilhadas quando fizer sentido.

Preferências estritamente pessoais, como tema claro/escuro, podem permanecer por usuário/dispositivo quando não houver razão para sincronizá-las.
