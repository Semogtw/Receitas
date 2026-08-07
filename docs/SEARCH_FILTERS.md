# Busca e Filtros de Receitas

> Especificação normativa da busca, filtragem e ordenação de receitas. A experiência é local-first e deve continuar útil sem conexão.

## 1. Princípio central

A busca de receitas acontece sobre os **dados locais disponíveis no dispositivo**.

O usuário não deve depender de uma consulta remota para localizar receitas que já estejam sincronizadas/localmente disponíveis.

Isso significa:

- busca utilizável offline;
- filtros utilizáveis offline;
- ordenação utilizável offline;
- resultados coerentes com o conjunto de dados que o dispositivo conhece naquele momento;
- sincronização pode trazer dados novos posteriormente, mas não é requisito para executar a busca atual.

Não introduzir serviço remoto de busca como dependência obrigatória do produto.

## 2. Campos pesquisáveis

A busca textual deve considerar, no mínimo:

- título da receita;
- nomes dos ingredientes;
- categorias associadas;
- descrição/notas da receita.

A implementação pode aplicar normalização apropriada para melhorar a experiência, como comparação sem diferença de maiúsculas/minúsculas e tratamento coerente de acentos, desde que não distorça o conteúdo persistido.

O texto original nunca deve ser modificado apenas para facilitar pesquisa.

## 3. Filtros combináveis

O usuário pode combinar filtros.

Filtros aprovados:

- uma ou mais **categorias**;
- **Favoritos**;
- **Queremos fazer**;
- **Já fizemos**.

Os filtros não são telas isoladas: devem poder coexistir com a busca textual e com a ordenação.

Exemplo conceitual:

```text
"massa" + categoria "Rápido" + Favoritos
```

Todos os critérios ativos devem ser compreensíveis e removíveis sem exigir limpar toda a busca.

## 4. Semântica dos estados

Os filtros devem respeitar as definições do domínio:

- **Favoritos** é um estado manual da receita;
- **Queremos fazer** é um estado manual e independente do histórico;
- **Já fizemos** é derivado da existência de pelo menos um preparo válido no histórico e não deve depender de uma flag manual redundante.

A busca não deve criar uma segunda fonte de verdade para esses estados.

## 5. Ordenação

Ordenações aprovadas:

- **Mais recentes**;
- **Nome**;
- **Mais preparadas**;
- **Melhor avaliadas**.

### 5.1 Mais recentes

A implementação deve usar um critério consistente e compreensível, definido no plano técnico, evitando misturar de forma opaca criação e última edição.

### 5.2 Nome

Ordenação textual previsível e adequada a português.

### 5.3 Mais preparadas

Valor derivado da quantidade de preparos válidos no histórico da receita.

Não persistir um contador redundante como fonte de verdade quando ele puder ser derivado de forma confiável.

### 5.4 Melhor avaliadas

Valor derivado das avaliações existentes dos preparos.

Regras:

- avaliações individuais originais continuam sendo a fonte de verdade;
- ausência de avaliações não deve ser transformada artificialmente em nota zero;
- empates e receitas sem avaliação devem ter comportamento previsível, a ser definido no plano de implementação;
- não persistir média agregada como fonte canônica apenas para ordenar, salvo se uma otimização futura exigir materialização explicitamente invalidada/recalculada.

## 6. UX

A busca deve parecer parte natural da biblioteca de receitas, não um painel de administração.

Direção:

- campo de busca fácil de alcançar;
- filtros ativos visíveis sem poluir a interface;
- categorias selecionáveis de forma clara;
- ordenação acessível, mas secundária;
- limpar/remover filtros individualmente;
- estado vazio deve explicar que nenhum resultado corresponde aos critérios atuais;
- diferenciar “não há receitas cadastradas” de “nenhuma receita corresponde à busca”.

Evitar:

- dezenas de chips simultâneos sem hierarquia;
- formulário avançado permanente ocupando grande parte da tela;
- filtros numéricos excessivamente específicos sem necessidade real;
- transformar a biblioteca em um dashboard analítico.

## 7. Escopo deliberadamente não obrigatório

Não fazem parte da experiência aprovada inicial:

- filtro por faixa exata de nota;
- construtor de consultas avançadas;
- operadores booleanos expostos ao usuário;
- pesquisa dependente de serviço externo;
- busca semântica/IA obrigatória;
- filtros extremamente granulares apenas porque o modelo de dados permitiria.

A arquitetura não deve impedir evolução futura, mas não deve carregar complexidade de produto sem necessidade atual.

## 8. Local-first e sincronização

Enquanto offline, a busca reflete os dados locais conhecidos.

Quando novas receitas ou alterações chegarem pela sincronização:

- a próxima avaliação dos critérios deve refletir o novo estado local;
- não deve existir um índice remoto divergente tratado como fonte de verdade da interface;
- qualquer índice/cache local de busca é derivado e deve poder ser reconstruído a partir dos dados locais canônicos.

Receitas em conflito seguem a política de `docs/SYNC.md`: a busca não pode resolver ou descartar silenciosamente versões conflitantes.

## 9. Performance

A implementação deve permanecer instantânea para o volume esperado de um acervo pessoal.

Se otimização de índice local for necessária, ela deve:

- ser derivável/reconstruível;
- não se tornar nova fonte canônica;
- respeitar atualizações e exclusões lógicas;
- funcionar no armazenamento local escolhido para a arquitetura;
- ser validada contra as APIs atuais da camada local antes da implementação.

Não adicionar infraestrutura de busca remota apenas por antecipação a uma escala que o produto não possui.

## 10. Testes mínimos

A implementação deve cobrir pelo menos:

1. busca por título;
2. busca por ingrediente;
3. busca por categoria;
4. busca em descrição/notas;
5. combinação de texto + categoria + estado;
6. filtro Favoritos;
7. filtro Queremos fazer;
8. filtro Já fizemos derivado do histórico;
9. ordenação por nome;
10. ordenação por mais preparadas;
11. ordenação por melhor avaliadas sem tratar ausência como zero;
12. funcionamento offline com dados locais;
13. atualização dos resultados após alteração local;
14. atualização dos resultados após sincronização trazer novos dados;
15. exclusão lógica removendo a receita das visões normais conforme a política de lixeira;
16. estado vazio distinto entre acervo vazio e busca sem resultados.

## 11. Relação com outros documentos

- Requisitos gerais de receitas: `docs/PRODUCT.md`.
- Direção de UX: `docs/UX.md`.
- Modelo de dados: `docs/DATA_MODEL.md`.
- Política local-first e conflitos: `docs/SYNC.md` e `docs/ARCHITECTURE.md`.
- Engenharia do frontend: `docs/FRONTEND.md`.
