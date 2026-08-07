# Importação de Receitas

> Documento vivo para a importação de receitas. Registra decisões de produto, parsing, segurança e comportamento de fallback já aprovadas.

## 1. Objetivo

A importação existe para acelerar o cadastro sem transformar conteúdo externo em fonte de verdade automática.

O usuário pode iniciar a importação de duas formas:

1. colando a URL de uma receita;
2. colando o texto de uma receita quando a página não puder ser interpretada adequadamente.

Em ambos os casos, o resultado é sempre um **rascunho revisável**. Nenhuma receita importada é salva automaticamente como definitiva.

## 2. Campos que o importador tenta extrair

Quando disponíveis, o importador tenta preencher:

- título;
- descrição/notas úteis;
- rendimento ou porções;
- tempos de preparo/cozimento;
- ingredientes estruturados;
- etapas estruturadas;
- imagem principal quando apropriado;
- URL/origem da receita;
- metadados úteis da fonte.

Falhas parciais não invalidam todo o resultado: os campos extraídos corretamente devem ser preservados e os demais podem ser completados manualmente.

## 3. Estratégia de parsing por URL

A ordem preferida é:

1. buscar e validar a página no backend;
2. procurar dados estruturados de receita, priorizando `Recipe` em JSON-LD/schema.org;
3. complementar com metadados HTML quando necessário;
4. usar extração conservadora de conteúdo visível apenas quando os dados estruturados forem insuficientes;
5. normalizar o resultado para o modelo interno;
6. devolver um rascunho para revisão manual.

Dados estruturados têm prioridade por serem menos frágeis que heurísticas baseadas em layout visual da página.

## 4. Fallback por texto

Se a URL falhar, a página bloquear o acesso, o conteúdo não tiver estrutura suficiente ou a extração ficar ruim, o usuário pode colar o texto da receita.

O parser de texto tenta identificar e estruturar:

- título quando reconhecível;
- rendimento/porções;
- lista de ingredientes;
- quantidade, unidade, ingrediente e observação de cada item;
- passos de preparo;
- tempos mencionados quando forem claros.

O fallback por texto também termina em revisão manual.

A funcionalidade-base **não depende de IA nem de API paga**. O parser deve funcionar com regras determinísticas, parsing de texto e bibliotecas locais/servidor apropriadas. Uma futura ajuda opcional por IA não pode ser requisito para o funcionamento principal.

## 5. Revisão antes de salvar

A tela de revisão deve deixar claro o que foi preenchido automaticamente e permitir:

- editar qualquer campo;
- reordenar ingredientes e etapas;
- corrigir unidades e quantidades;
- remover conteúdo extraído incorretamente;
- adicionar campos ausentes;
- escolher ou remover a imagem sugerida;
- confirmar a origem;
- cancelar a importação sem criar receita definitiva.

O parser é um acelerador de cadastro, não uma autoridade culinária.

## 6. Origem e rastreabilidade

Uma receita importada deve preservar a URL original quando a origem for uma página Web.

O sistema pode registrar metadados da tentativa de importação, como:

- tipo de origem (`url` ou `text`);
- URL quando existir;
- data;
- usuário que iniciou;
- estratégia/parser que produziu o rascunho;
- status;
- erros parciais relevantes.

A origem não concede ao aplicativo permissão para republicar conteúdo publicamente; o app é privado e a importação serve ao uso pessoal do par.

## 7. Execução no backend

A PWA não deve fazer fetch arbitrário de páginas externas diretamente como mecanismo principal de importação.

A busca por URL acontece em operação de backend/Edge Function para:

- evitar limitações de CORS;
- centralizar parsing;
- aplicar limites de tamanho e tempo;
- aplicar política de redirects;
- bloquear destinos inseguros;
- manter comportamento consistente entre dispositivos.

Fluxo conceitual:

```text
PWA
 ↓ URL
Edge Function
 ↓ validação
fetch externo controlado
 ↓
JSON-LD / HTML / fallback
 ↓
normalização
 ↓
rascunho estruturado
 ↓
revisão manual
 ↓
receita definitiva
```

## 8. Proteções de segurança

Como o backend fará requisições para URLs fornecidas pelo usuário, a importação deve ser tratada como superfície sensível de SSRF.

Requisitos mínimos:

- aceitar apenas esquemas HTTP/HTTPS apropriados;
- bloquear `file:`, `data:`, `ftp:` e outros esquemas não necessários;
- rejeitar `localhost` e hosts equivalentes;
- bloquear IPs privados, loopback, link-local, multicast, metadata endpoints e faixas reservadas;
- validar o destino novamente após resolução DNS;
- validar cada redirect, não apenas a URL inicial;
- limitar número de redirects;
- limitar tempo total da requisição;
- limitar tamanho máximo do corpo baixado;
- validar `Content-Type` e rejeitar tipos inesperados;
- não executar JavaScript remoto como requisito padrão para parsing;
- não encaminhar cookies, tokens ou cabeçalhos secretos do aplicativo para o site de origem;
- não expor segredos administrativos ao parser;
- registrar falhas de maneira suficiente para diagnóstico sem armazenar segredos.

O importador não deve poder ser usado como proxy genérico para acessar a rede interna do backend.

## 9. Imagens externas

Uma imagem sugerida pela página não deve virar automaticamente um arquivo permanente do aplicativo antes da confirmação do usuário.

Quando o usuário aceitar uma imagem importada:

- validar tipo e tamanho;
- aplicar as mesmas restrições de fetch remoto quando o backend baixar a imagem;
- armazenar em bucket privado do par;
- manter referência à origem quando útil;
- não depender de hotlink permanente da página externa para a galeria pessoal.

## 10. Offline e local-first

Importar uma URL exige conectividade porque depende de buscar conteúdo externo.

Porém:

- um rascunho já retornado ao dispositivo deve poder ser revisado localmente;
- o usuário não deve perder alterações feitas no rascunho se a conexão cair;
- a criação definitiva da receita deve seguir o mesmo fluxo local-first das receitas manuais;
- uploads de imagem podem permanecer pendentes e sincronizar depois.

O fallback por texto pode ser parcialmente processado localmente quando a implementação permitir, mas a arquitetura não depende disso.

## 11. Erros esperados

A UX deve diferenciar pelo menos:

- URL inválida;
- destino bloqueado por segurança;
- página inacessível;
- conteúdo grande demais;
- tipo de conteúdo não suportado;
- receita não detectada;
- extração parcial;
- falha temporária de rede;
- erro interno do parser.

Sempre que houver conteúdo útil extraído antes de uma falha parcial, ele deve ser preservado no rascunho quando for seguro fazê-lo.

## 12. Princípios de implementação

- sem scraping frágil específico para dezenas de sites como base do sistema;
- sem IA/API paga como dependência obrigatória;
- sem salvar automaticamente resultado importado;
- sem fetch arbitrário não validado no backend;
- sem inventar ingredientes, quantidades ou etapas ausentes;
- preferir perda de automação a produzir uma receita silenciosamente incorreta;
- preservar o máximo possível de trabalho do usuário durante falhas.