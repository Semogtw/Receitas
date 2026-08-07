# Listas de Compras

> Especificação normativa da organização das listas de compras compartilhadas.

## 1. Decisão principal

O produto suporta **múltiplas listas de compras nomeadas**, em vez de restringir o par a uma única lista global.

Exemplos possíveis:

- Mercado;
- Atacado;
- Festa;
- Farmácia/itens domésticos, caso o par deseje usar a mesma superfície para compras relacionadas.

Os nomes são definidos pelos usuários; o sistema não depende de uma enumeração fixa.

## 2. Lista padrão

Uma das listas pode ser marcada como **lista padrão** do par.

Objetivo:

- manter o uso cotidiano tão simples quanto uma lista única;
- permitir que ações comuns já proponham um destino sem exigir escolha toda vez;
- continuar permitindo separar compras quando isso fizer sentido.

Quando existir uma lista padrão, ações que geram itens a partir de receitas ou do planejador podem pré-selecioná-la, sem impedir que o usuário escolha outra lista antes de confirmar.

A lista padrão é uma preferência compartilhada do par, não uma preferência exclusiva de um dispositivo.

## 3. Comportamento compartilhado e offline

Todas as listas pertencem ao mesmo `pair` e são compartilhadas entre os dois membros.

Cada lista deve continuar funcional offline para ações locais normais, incluindo:

- abrir e consultar itens já disponíveis localmente;
- adicionar item manual;
- editar quantidade/unidade;
- marcar/desmarcar item como comprado;
- remover item por soft delete;
- reorganizar quando a interface oferecer ordenação;
- criar uma nova lista localmente e sincronizá-la posteriormente.

A sincronização segue `docs/SYNC.md`: IDs são estáveis, alterações independentes podem ser mescladas quando seguro e conflitos reais não são sobrescritos silenciosamente.

## 4. Geração a partir de receitas

Ao gerar compras a partir de uma ou mais receitas:

1. o sistema calcula ingredientes considerando as porções escolhidas;
2. aplica consolidação conservadora;
3. apresenta o resultado antes ou durante a inclusão conforme a UX final;
4. direciona os itens para a lista escolhida;
5. quando houver lista padrão, ela pode aparecer pré-selecionada;
6. o usuário pode escolher outra lista antes da confirmação.

Itens gerados podem manter metadados de origem para explicar de qual receita/planejamento vieram.

## 5. Geração a partir do planejador

O planejador pode gerar compras para um intervalo selecionado.

O destino segue a mesma regra:

- lista padrão pré-selecionada quando existir;
- possibilidade de escolher outra lista;
- consolidação dos ingredientes antes da inclusão;
- preservação da origem dos itens quando útil.

O planejador continua sendo somente visual e não envia lembretes; gerar compras é uma ação explícita do usuário.

## 6. Consolidação dentro de uma lista

A consolidação segue as regras já aprovadas:

- unidades compatíveis podem ser convertidas e somadas;
- massa ↔ volume só é convertida quando houver perfil confiável para o ingrediente;
- itens semanticamente incompatíveis não são fundidos apenas para reduzir a quantidade de linhas;
- o sistema nunca inventa equivalências culinárias.

A consolidação ocorre no contexto da lista de destino. O sistema não deve fundir silenciosamente itens de listas diferentes.

## 7. Modelo conceitual

### `shopping_lists`

Campos conceituais:

- `id` estável;
- `pair_id`;
- `name`;
- indicação compartilhada de lista padrão ou mecanismo equivalente que garanta no máximo uma lista padrão ativa;
- metadados de versionamento/sincronização;
- `deleted_at` para lixeira/soft delete.

### `shopping_items`

Cada item pertence inequivocamente a uma lista por `shopping_list_id`.

Além dos campos já descritos em `docs/DATA_MODEL.md`, o item pode manter:

- origem manual ou gerada;
- referência opcional a receita, planejamento ou geração;
- quantidade/unidade;
- estado comprado/não comprado;
- posição quando a UI permitir ordenação;
- metadados de sincronização;
- `deleted_at`.

## 8. Exclusão e lixeira

Excluir uma lista segue a política geral de soft delete.

- excluir uma lista não deve produzir uma exclusão definitiva imediata;
- restauração deve recuperar a lista e seus itens recuperáveis de forma consistente;
- a definição exata do que acontece com a preferência de lista padrão quando a lista padrão for removida deve preservar consistência e não apontar para uma lista excluída.

## 9. UX

A existência de várias listas não deve transformar a tela de compras em um gerenciador complexo.

Direção:

- mostrar claramente qual lista está aberta;
- trocar de lista com poucas ações;
- permitir criar/renomear listas sem fluxo administrativo pesado;
- identificar a lista padrão de forma discreta;
- ao adicionar compras de receitas/planejador, usar a padrão como conveniência, não como bloqueio;
- manter a experiência principal otimizada para uso rápido no mercado.

## 10. Invariantes para testes

No mínimo:

1. o par pode possuir várias listas ativas;
2. listas diferentes não misturam itens entre si;
3. no máximo uma lista padrão ativa é considerada padrão ao mesmo tempo;
4. os dois membros veem e editam as mesmas listas compartilhadas;
5. criar/editar itens offline sincroniza depois;
6. gerar compras para uma lista não altera outra lista;
7. a lista padrão pode ser pré-selecionada, mas o usuário consegue escolher outra;
8. exclusão segue soft delete e não deixa referência padrão inconsistente;
9. consolidação nunca atravessa listas diferentes;
10. conflitos seguem `docs/SYNC.md` sem perda silenciosa.

## 11. Relação com outros documentos

- Requisitos gerais de compras: `docs/PRODUCT.md`.
- Modelo de dados: `docs/DATA_MODEL.md`.
- Planejador: `docs/PRODUCT.md` e `docs/UX.md`.
- Sincronização: `docs/SYNC.md`.
- Fluxo de desenvolvimento: `docs/DEVELOPMENT_WORKFLOW.md`.
