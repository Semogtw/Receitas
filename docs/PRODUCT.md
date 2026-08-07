# Especificação de Produto

> Documento vivo. Registra somente decisões já aprovadas para o produto. Novas decisões devem ser incorporadas aqui assim que forem fechadas.

## 1. Escopo

O aplicativo é um produto pessoal para **exatamente duas pessoas**. Não existe conceito de múltiplos casais, grupos, organizações, perfis públicos ou compartilhamento externo.

A primeira versão deve ser tratada como o **produto completo para uso pessoal**, e não como um MVP artificialmente reduzido.

## 2. Formação do par e autenticação

- Autenticação por **e-mail e senha**.
- A primeira pessoa cria o par.
- O sistema gera um **convite de uso único** para a segunda pessoa.
- Após o segundo membro entrar, o par fica fechado para novas adesões.
- Os dois membros possuem acesso funcional equivalente aos dados compartilhados.

## 3. Receitas

Cada receita deve suportar:

- título;
- descrição/notas;
- rendimento ou número de porções-base;
- tempos relevantes;
- categorias;
- ingredientes estruturados e ordenáveis;
- etapas de preparo estruturadas e ordenáveis;
- foto de capa;
- galeria permanente da receita;
- estado/favorito e organização para receitas que o par deseja fazer;
- histórico de preparos realizados;
- origem da receita, incluindo importação por URL quando aplicável.

### 3.1 Categorias

- Categorias são **criadas pelos próprios usuários**.
- Uma receita pode pertencer a **várias categorias simultaneamente**.
- Exemplos possíveis: Doce, Salgado, Sobremesa, Massa, Forno, Rápido, Bebida.
- Categorias não são uma enumeração fixa do sistema.

### 3.2 Ingredientes estruturados

Cada item de ingrediente deve, no mínimo, representar:

- quantidade;
- unidade;
- ingrediente;
- observação opcional;
- ordem dentro da receita.

A modelagem deve permitir quantidades culinárias como frações, valores aproximados e expressões não estritamente numéricas, como “a gosto”, sem forçar conversões inválidas.

### 3.3 Etapas estruturadas

O modo de preparo é composto por etapas ordenáveis. Cada etapa pode conter:

- texto da instrução;
- posição/ordem;
- duração opcional;
- observação opcional.

A estrutura deve permitir timers por etapa sem remodelagem do domínio.

### 3.4 Estados organizacionais da receita

- **Já fizemos** não é um marcador manual: é um estado **derivado automaticamente da existência de pelo menos um preparo válido no histórico**.
- Se uma receita possui histórico de preparo, ela deve ser considerada já feita sem exigir uma flag separada.
- **Queremos fazer** é um marcador manual e independente do histórico.
- **Favorito** também é um marcador manual e independente.
- Uma receita já preparada pode continuar marcada como “Queremos fazer” se o par quiser fazê-la novamente.
- Evitar persistir estados derivados quando eles puderem ser calculados com segurança, reduzindo a possibilidade de contradições entre receita e histórico.

## 4. Porções e redimensionamento

- Toda receita pode informar rendimento/porções-base.
- O usuário pode escolher multiplicadores como 0,5x, 1,5x, 2x e 3x ou um número específico de porções.
- Ingredientes quantitativos são recalculados proporcionalmente.
- Itens como “sal a gosto” permanecem semanticamente inalterados.
- A receita original não deve ser modificada apenas porque o usuário alterou temporariamente o número de porções exibido.

## 5. Conversão de unidades culinárias

A conversão de unidades é uma feature de primeira classe.

### 5.1 Volume para volume

Conversões como xícara, colher de sopa, colher de chá e mL podem ser feitas diretamente quando as unidades forem compatíveis.

### 5.2 Massa para volume

Conversões como gramas para xícaras/colheres dependem do ingrediente e **não podem ser tratadas como universais**.

O sistema deve suportar perfis de conversão por ingrediente, por exemplo:

- farinha de trigo: equivalência aproximada entre xícara e gramas;
- açúcar: equivalência própria;
- manteiga: equivalência própria.

Regras:

- a conversão pode ser exibida temporariamente sem alterar a receita original;
- durante edição, o usuário pode optar por converter permanentemente a unidade;
- frações culinárias amigáveis devem ser apresentadas quando fizer sentido;
- equivalências personalizadas pelo par têm prioridade sobre as equivalências padrão;
- se não houver perfil confiável para o ingrediente, o sistema não inventa uma conversão;
- conversões aproximadas devem ser identificadas como aproximadas;
- o redimensionamento de porções acontece antes da conversão de unidade.

## 6. Histórico de preparos

Cada vez que a receita for feita deve gerar um registro próprio, separado da definição atual da receita.

Um preparo pode conter:

- data e horário;
- porções preparadas;
- avaliações individuais dos dois membros;
- comentários individuais vinculados às avaliações;
- uma observação compartilhada opcional do preparo;
- fotos específicas daquele preparo;
- referência à versão/snapshot da receita usada naquela ocasião.

### 6.1 Avaliação e comentários do preparo

- **Cada membro avalia individualmente o mesmo preparo.** Não existe uma única nota compartilhada que sobrescreva opiniões diferentes.
- Cada avaliação usa escala de **0 a 10**.
- São aceitos incrementos de **0,5 ponto**: por exemplo, 7; 7,5; 8; 8,5; 9.
- Cada membro pode ter no máximo uma avaliação ativa por preparo, podendo editar a própria nota posteriormente sem alterar a avaliação do outro membro.
- Cada avaliação individual pode conter um **comentário pessoal opcional**, visível no histórico como opinião daquele membro.
- O comentário individual de um membro não altera nem substitui o comentário individual do outro.
- O preparo pode conter também uma **observação compartilhada opcional**, destinada a decisões conjuntas ou anotações práticas como “da próxima vez usar menos molho”.
- Comentários individuais e observação compartilhada são conceitos distintos e devem aparecer separados na interface.
- A nota pertence ao preparo específico e não substitui avaliações de preparos anteriores.
- A interface pode calcular a **média daquele preparo** a partir das avaliações existentes.
- A receita pode exibir agregados históricos, como média geral do par, média por pessoa e evolução das notas ao longo dos preparos, sempre preservando as avaliações individuais originais.
- A ausência de nota de um dos membros não impede o registro do preparo nem invalida a nota do outro.

O histórico deve preservar o contexto do passado mesmo que a receita seja editada posteriormente.

## 7. Fotos

Existem dois conjuntos distintos de mídia:

1. **Fotos da receita:** capa e galeria permanente de referência.
2. **Fotos do preparo:** vinculadas a uma execução específica da receita.

As duas galerias não devem ser misturadas conceitualmente.

## 8. Lista de compras

A lista de compras é compartilhada entre os dois usuários e funciona offline.

Deve permitir:

- gerar itens a partir de uma ou várias receitas;
- respeitar o número de porções escolhido;
- consolidar ingredientes compatíveis;
- adicionar itens manualmente;
- editar quantidade e unidade;
- marcar/desmarcar itens como comprados;
- remover itens;
- sincronizar alterações entre os dois usuários.

Itens originados de receitas podem manter referência à origem para facilitar explicação e regeneração.

### 8.1 Consolidação conservadora

- Unidades compatíveis podem ser convertidas e somadas.
- Conversões massa ↔ volume só são feitas quando existir um perfil conhecido para o ingrediente.
- O sistema nunca deve inventar uma equivalência culinária apenas para conseguir consolidar a lista.

## 9. Planejador de refeições

O produto inclui planejador compartilhado de refeições.

Cada entrada pode possuir:

- data;
- período de refeição;
- horário opcional;
- receita;
- número de porções.

Os **períodos de refeição são personalizáveis** pelo par, em vez de uma enumeração fixa. Exemplos: Café, Almoço, Lanche, Jantar.

O planejador deve poder alimentar a lista de compras com as receitas e quantidades planejadas para um período selecionado.

## 10. Importação por URL

O usuário pode colar a URL de uma receita e solicitar preenchimento automático de:

- título;
- ingredientes;
- etapas;
- imagem quando disponível e apropriado;
- metadados úteis da fonte.

A importação sempre termina em **revisão manual antes de salvar**. O parser é um acelerador de cadastro, não uma fonte de verdade incontestável.

Falhas parciais devem preservar o que foi extraído corretamente e permitir completar/corrigir manualmente.

## 11. Conflitos de edição

O produto **não aceita sobrescrita silenciosa do tipo last-write-wins** como experiência final para conflitos reais.

Quando os dois usuários alterarem a mesma entidade a partir de bases incompatíveis:

- ambas as versões são preservadas;
- o conflito é registrado explicitamente;
- a versão estável permanece acessível;
- a interface permite comparar versões;
- o usuário pode escolher uma versão ou mesclar campo a campo;
- a versão descartada continua registrada no histórico do conflito.

## 12. Lixeira

Exclusões importantes usam **soft delete**.

- Receita, preparo, categoria, foto e outras entidades relevantes podem ser restauradas.
- Exclusão definitiva é uma ação explícita.
- Não há remoção automática obrigatória após um prazo arbitrário.
- Excluir uma categoria não exclui as receitas associadas.

## 13. Backup, exportação e restauração

Portabilidade faz parte do produto.

O aplicativo deve permitir exportar um backup completo contendo, no mínimo:

- receitas;
- categorias;
- ingredientes;
- etapas;
- histórico de preparos, avaliações, comentários individuais e observações compartilhadas;
- planejamento;
- lista de compras e metadados relevantes;
- preferências e perfis de conversão personalizados;
- fotos e demais mídias incluídas no backup.

Formato esperado: arquivo `.zip` com manifesto e dados estruturados em formato aberto, como JSON, acompanhado das mídias.

O aplicativo também deve restaurar/importar um backup compatível.

## 14. Modo cozinha

O produto inclui um **modo cozinha** focado em consulta durante o preparo.

Características:

- interface mais simples e com maior legibilidade;
- ingredientes fáceis de consultar e marcar;
- passos apresentados de forma clara e sequencial;
- controles grandes o suficiente para uso com o celular apoiado;
- avanço simples entre etapas;
- tentativa de evitar que a tela apague enquanto a plataforma permitir;
- suporte a timers associados às etapas que possuam duração.

### 14.1 Timers de preparo

- Uma etapa com duração pode iniciar um timer diretamente no modo cozinha.
- O usuário pode manter **vários timers simultâneos** em execução.
- Cada timer deve identificar claramente a receita/etapa que o originou quando houver mais de um ativo.
- O término deve gerar aviso sonoro e, quando a plataforma permitir, notificação do sistema.
- Pausar, retomar, cancelar e ajustar um timer devem ser ações explícitas e locais.
- O estado de timers ativos deve sobreviver à navegação interna do PWA e a recarregamentos recuperáveis sempre que tecnicamente possível.
- O app **não deve prometer execução confiável em segundo plano quando o navegador ou iOS não oferecerem essa garantia**.
- Quando houver limitação de background, a interface deve informar de maneira clara que o aviso pode depender do app permanecer ativo/aberto, em vez de fingir confiabilidade inexistente.
- Timers são auxiliares de preparo e não alteram a definição canônica da receita.

## 15. Fora de escopo por decisão de produto

- múltiplos pares/casais;
- grupos;
- marketplace ou catálogo público;
- perfis públicos;
- seguidores;
- compartilhamento social interno;
- publicação obrigatória em App Store;
- recursos SaaS de times, organizações, cobrança ou planos.
