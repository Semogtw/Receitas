# Arquitetura

> Documento vivo. Registra decisões técnicas já aprovadas e deve ser atualizado junto das decisões de produto.

## 1. Direção geral

O aplicativo será uma **PWA privada, mobile-first e local-first**.

A interface deve continuar funcional sem conexão. O backend existe para autenticação, sincronização entre os dois usuários, armazenamento remoto, operações privilegiadas e recuperação/portabilidade dos dados.

## 2. Stack aprovada

- **Frontend:** React + TypeScript + Vite.
- **PWA:** manifest, service worker e instalação pela tela inicial.
- **Banco local/sincronização:** PowerSync, usando armazenamento local persistente adequado à Web.
- **Backend:** Supabase.
- **Banco remoto:** Supabase Postgres.
- **Autenticação:** Supabase Auth com e-mail e senha.
- **Mídia:** Supabase Storage em buckets privados.
- **Operações privilegiadas:** Supabase Edge Functions quando a lógica não deve residir no cliente.

### Por que não Expo Web como base

A direção aprovada prioriza uma PWA Web de alta qualidade agora, sem carregar complexidade específica de uma futura distribuição nativa. A camada local-first é tratada como requisito central, não como melhoria posterior.

## 3. Fonte de leitura da interface

A UI lê prioritariamente do banco local.

Fluxo conceitual:

```text
UI
 ↓
Banco local
 ↓
Fila de mutações / sincronização
 ↓
PowerSync + Supabase
 ↓
Postgres remoto
```

A ausência de internet não deve bloquear ações normais como consultar receitas, editar dados já disponíveis, planejar refeições ou marcar itens da lista de compras.

## 4. Escritas offline

Alterações feitas offline são persistidas localmente imediatamente e entram no fluxo de sincronização.

Princípios:

- a interface não deve fingir que uma alteração foi enviada ao servidor quando ainda está apenas local;
- o usuário pode continuar trabalhando enquanto a sincronização está pendente;
- operações devem ser idempotentes sempre que possível;
- falhas transitórias de rede geram retry, não perda de dados;
- estados de sincronização importantes devem ser observáveis pela interface.

## 5. Conflitos

A política de produto exige preservação explícita de conflitos.

Não depender de last-write-wins para alterações concorrentes semanticamente incompatíveis.

Entidades editáveis devem carregar metadados suficientes para detectar que uma mutação foi produzida sobre uma base desatualizada. Quando isso ocorrer:

1. preservar a versão local;
2. preservar a versão remota concorrente;
3. criar registro de conflito;
4. manter uma versão estável disponível para leitura;
5. permitir resolução por escolha ou mesclagem campo a campo;
6. registrar a resolução sem apagar imediatamente as versões anteriores.

A implementação detalhada da estratégia de versionamento será congelada no plano técnico antes do código, mas a propriedade acima é obrigatória.

## 6. Mídia local-first

Fotos são tratadas separadamente dos metadados estruturados.

Fluxo esperado:

1. usuário seleciona/tira uma foto;
2. o arquivo recebe uma referência local imediata;
3. o registro relacionado pode ser salvo offline;
4. a mídia entra em fila de upload;
5. quando online, o arquivo é enviado ao bucket privado;
6. metadados locais/remotos são reconciliados;
7. cópias locais podem continuar em cache conforme política de armazenamento.

A aplicação não deve bloquear o cadastro de um preparo apenas porque o upload de uma foto ainda não terminou.

## 7. Segurança

### 7.1 Unidade de autorização

O **par** é a unidade de segurança.

Praticamente toda entidade compartilhada possui `pair_id` ou é alcançável de forma inequívoca por uma entidade com `pair_id`.

Regra conceitual:

```text
usuário autenticado
        ↓
é membro do pair_id?
   ↓ sim       ↓ não
 acesso       negar
```

### 7.2 RLS

Row Level Security deve existir nas tabelas compartilhadas do Supabase.

O frontend nunca é considerado autoridade para autorização. Mesmo que alguém descubra endpoints, IDs ou a chave pública do projeto, operações fora do par devem ser rejeitadas pelo backend.

### 7.3 Segredos

- `service_role` e demais segredos administrativos nunca entram no bundle da PWA.
- Operações administrativas ficam em ambiente servidor/Edge Function.
- Chaves públicas próprias do cliente são tratadas como públicas e protegidas por RLS, não por obscuridade.

### 7.4 Storage

- buckets de fotos são privados;
- acesso depende da associação ao par;
- URLs públicas permanentes para conteúdo pessoal não são o padrão;
- upload e leitura devem respeitar autorização equivalente à dos registros do banco.

## 8. Convite do segundo membro

O produto possui um par com limite rígido de dois membros.

O fluxo aprovado é:

1. primeiro usuário cria o par;
2. o backend emite convite de uso único;
3. segundo usuário autenticado aceita o convite;
4. associação é criada atomicamente;
5. convite é consumido;
6. o par passa a recusar novas adesões.

A aceitação deve ser validada no backend, nunca apenas no cliente.

## 9. Edge Functions previstas

Operações candidatas a funções privilegiadas:

- criação/aceitação de convite;
- importação de receita por URL;
- geração e restauração de backup;
- operações administrativas de exclusão definitiva;
- rotinas que precisem acessar segredos ou serviços externos;
- validações de consistência que não possam ser confiadas ao cliente.

## 10. Importação por URL

Parsing de páginas externas não deve depender exclusivamente do navegador do usuário, devido a CORS, variabilidade de HTML e necessidade de regras de segurança.

Fluxo preferido:

```text
PWA envia URL
     ↓
Edge Function valida e busca a página
     ↓
parser tenta dados estruturados primeiro
     ↓
fallback de extração quando necessário
     ↓
resultado estruturado retorna como rascunho
     ↓
usuário revisa antes de salvar
```

A função deve aplicar proteções contra abuso de fetch do lado servidor, incluindo validação rigorosa de URL e prevenção de SSRF.

## 11. Backup e restauração

Backups devem usar formato portável e independente do banco interno sempre que razoável.

Estrutura conceitual:

```text
backup.zip
├── manifest.json
├── data/
│   ├── recipes.json
│   ├── categories.json
│   ├── cooking-sessions.json
│   ├── meal-plan.json
│   └── ...
└── media/
    └── ...
```

Restauração deve validar versão do formato, integridade básica, associações e pertencimento antes de inserir dados.

## 12. Exclusão lógica

Entidades recuperáveis usam soft delete, normalmente via `deleted_at` ou mecanismo equivalente.

A sincronização precisa propagar exclusões lógicas como estado, em vez de interpretar ausência remota como autorização para destruir cópias locais imediatamente.

## 13. Estado de conectividade

A experiência deve diferenciar pelo menos:

- sincronizado;
- alterações locais pendentes;
- sincronizando;
- falha temporária;
- conflito aguardando resolução.

O aplicativo não deve transformar conectividade em um banner permanente ou intrusivo quando tudo estiver normal.

## 14. Restrições arquiteturais

- Sem backend de autorização implementado apenas no frontend.
- Sem banco remoto como dependência para toda renderização.
- Sem sincronização própria improvisada quando PowerSync cobrir o caso com confiabilidade.
- Sem sobrescrita silenciosa de conflitos reais.
- Sem uploads públicos por padrão.
- Sem arquitetura multi-tenant genérica para vários pares.
