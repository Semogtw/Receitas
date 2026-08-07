# Direção de UX e UI

> A interface deve parecer um produto pessoal de cozinha bem cuidado. Evitar deliberadamente estética genérica de template, dashboard SaaS ou “feito por IA”.

## 1. Personalidade visual

Referência conceitual: **caderno/livro de receitas moderno**.

A temática culinária deve aparecer por meio de fotografia, tipografia, ritmo, materiais visuais e pequenos detalhes funcionais — não por excesso de ilustrações ou decoração temática.

Características desejadas:

- acolhedora;
- doméstica;
- limpa;
- funcional;
- visualmente ligada a comida e cozinha;
- suficientemente sóbria para uso diário;
- com boa densidade de informação.

## 2. O que evitar

Evitar padrões associados a interfaces genéricas produzidas por templates ou geração automática:

- gradientes roxo/azul sem relação com a temática;
- glassmorphism gratuito;
- cards para absolutamente tudo;
- cantos excessivamente arredondados em todos os componentes;
- grandes blocos vazios apenas para “respirar”;
- hero sections de marketing dentro do aplicativo;
- dashboards cheios de métricas que não ajudam a cozinhar;
- ilustrações genéricas de startup em estados vazios;
- ícones de bibliotecas diferentes misturados;
- textos grandiosos ou slogans no uso cotidiano;
- microcopy artificialmente entusiasmada;
- excesso de chips, badges e pills;
- animações decorativas que atrasem a interação.

## 3. Paleta e materiais

A direção deve partir de tons naturais e culinários, usados com moderação:

- creme/off-white;
- carvão/grafite;
- terracota;
- vermelho tomate;
- verde oliva;
- tons derivados de papel, madeira, ervas e alimentos.

A paleta final deve ser definida por contraste, legibilidade e consistência, não pela necessidade de usar todas essas cores ao mesmo tempo.

Fotos de comida são o principal elemento visual e devem receber mais protagonismo do que elementos decorativos artificiais.

## 4. Tipografia

- alta legibilidade em telas pequenas;
- hierarquia clara entre título da receita, seções, ingredientes e passos;
- tamanhos confortáveis para consulta com o celular apoiado;
- evitar títulos enormes típicos de landing pages;
- limitar quantidade de famílias tipográficas;
- priorizar excelente suporte a português, numerais, frações e símbolos culinários.

## 5. Navegação

O produto é **mobile-first**, especialmente pensando em instalação como PWA no iPhone.

A navegação principal deve ser simples e previsível. Áreas de uso frequente devem ficar próximas do polegar.

Conceitos principais esperados na navegação:

- Receitas/Início;
- Planejar;
- Compras;
- acesso direto às ações contextuais como criar receita ou registrar preparo.

A organização final deve evitar colocar funções raras na navegação principal apenas para preencher espaço.

## 6. Tela de receita

A tela deve se comportar como uma boa página de receita, e não como um dashboard.

Prioridades visuais:

1. foto e identidade da receita;
2. rendimento/porções e controles de escala;
3. ingredientes;
4. modo de preparo;
5. histórico e fotos dos preparos;
6. ações secundárias.

Conversões de unidade devem aparecer próximas da quantidade, de forma simples, por exemplo conceitualmente:

```text
240 g  ⇄  2 xícaras
```

A conversão não deve exigir navegar para uma calculadora separada para casos comuns.

## 7. Ingredientes durante o uso

- permitir marcar ingredientes consultados/preparados sem alterar a receita;
- manter quantidade e unidade visualmente próximas do ingrediente;
- destacar alterações temporárias de porções/conversão sem confundi-las com edição permanente;
- mostrar claramente quando uma conversão é aproximada;
- evitar tabelas densas demais em telas estreitas.

## 8. Etapas de preparo

- passos numerados e bem separados;
- suporte visual a duração quando houver;
- controles grandes e simples;
- navegação sequencial natural;
- observações devem ser visíveis sem competir com a instrução principal.

## 9. Modo cozinha

Modo específico para consulta enquanto a receita está sendo preparada.

### Objetivos

- reduzir distrações;
- aumentar legibilidade;
- minimizar toques necessários;
- favorecer uso com mãos ocupadas/sujas;
- manter progresso local mesmo sem internet.

### Comportamento

- tipografia maior;
- foco em uma etapa ou pequeno conjunto de etapas;
- ingredientes acessíveis rapidamente;
- botões grandes para anterior/próxima;
- timers quando a etapa possuir duração;
- tentativa de manter a tela acordada usando APIs disponíveis da plataforma, com fallback quando não suportado;
- progresso não deve editar o conteúdo canônico da receita;
- saída e retomada devem preservar posição local.

## 10. Fotos

Fotos são conteúdo, não decoração.

- capa da receita deve ter presença forte;
- galeria da receita fica separada do histórico visual de preparos;
- fotos de preparos devem reforçar a linha do tempo da experiência do casal;
- upload pendente precisa ter estado claro sem bloquear o restante do app;
- placeholders devem ser discretos e coerentes com a temática.

## 11. Categorias

Categorias são ferramentas de organização, não uma nuvem de badges coloridos.

- permitir múltiplas categorias por receita;
- usar cor apenas quando ajudar a escanear;
- manter nomes legíveis;
- criação/edição deve ser rápida;
- filtros combinados devem ser fáceis de entender.

## 12. Planejador

O planejador deve parecer uma agenda de refeições, não um calendário corporativo.

- destaque para comida/receita e porções;
- períodos personalizados como Café, Almoço e Jantar devem ser fáceis de reconhecer;
- adicionar receita a uma data deve exigir poucas ações;
- gerar compras a partir de um intervalo deve ser uma ação explícita e previsível.

## 13. Lista de compras

A tela deve otimizar uso real em mercado/cozinha:

- área de toque confortável para marcar item;
- itens comprados visualmente reduzidos sem desaparecer imediatamente;
- edição rápida de quantidade/unidade;
- itens manuais e gerados convivem sem criar duas listas separadas;
- origem pode ser exibida sob demanda, não como ruído constante;
- funcionamento offline é essencial.

## 14. Conflitos

A tela de conflito precisa transmitir segurança, não urgência artificial.

- explicar que nenhuma versão será perdida;
- apresentar diferenças de forma objetiva;
- permitir escolher versão inteira ou mesclar campos;
- nunca usar modal destrutivo que incentive decisão apressada;
- resolução pode ser adiada sem bloquear a consulta da receita estável.

## 15. Estados de sincronização

Mostrar estado apenas quando útil.

- normal e sincronizado: indicador discreto ou nenhum ruído;
- pendente offline: sinal claro, não alarmista;
- falha temporária: opção de entender/repetir;
- conflito: visível até resolução;
- upload de foto: progresso local por mídia quando relevante.

## 16. Tema claro e escuro

O aplicativo deve suportar ambos.

O tema escuro não deve ser apenas inversão automática de cores; fotos, contraste, superfícies e tons culinários precisam continuar naturais.

Preferência de tema é pessoal/dispositivo por padrão, não uma preferência obrigatoriamente compartilhada pelo par.

## 17. Microcopy

Tom direto, normal e doméstico.

Preferir:

- “Receitas”;
- “Planejar”;
- “Compras”;
- “Histórico”;
- “Adicionar preparo”;
- “Converter unidade”;
- “Resolver conflito”.

Evitar frases de marketing, personificação excessiva, mensagens com entusiasmo artificial e explicações longas para ações simples.

## 18. Acessibilidade e ergonomia

- áreas de toque adequadas a mobile;
- contraste suficiente em claro e escuro;
- não depender apenas de cor para comunicar estado;
- suporte a zoom/tamanho de fonte do sistema quando tecnicamente viável;
- foco visível para teclado na versão Web;
- rótulos acessíveis em controles de ícone;
- ações destrutivas com diferenciação e confirmação proporcional ao risco.
